import type { LngLat } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError, routeSafe } from '../api/langkah';
import type { Route, Step } from '../api/types';
import { bearingAt, makeTrack, metres, snap, type Track } from './geo';
import { haptics } from './haptics';
import { useRouteFeatures, type RouteCrossing, type RouteHazard } from './useRouteFeatures';
import { startWalkLocation, stopWalkLocation, subscribeFixes, type Fix } from './walkLocation';
import type { Walk } from './walkStore';

// Turn-by-turn progress for one walk (guide Section 6.3, screen 4): where the walker
// is on the line, the next step, hazards ahead, leaving the route and arriving.

const OFF_ROUTE_M = 30; // farther than this from the line counts as off the route
const OFF_ROUTE_FIXES = 3; // in a row, so one bad fix does not reroute
const MAX_ACCURACY_M = 40; // fixes worse than this never count as off the route
const REROUTE_GAP_MS = 15000;
const TURN_BUZZ_M = 20; // pulse once when the next step is this close
const PASSED_M = 5; // a step this far behind counts as done
const HAZARD_AHEAD_M = 50; // banner when a hazard is this close ahead (Section 5.2)
const ARRIVE_M = 20;
const LANDMARK_NEAR_M = 30;
const WALK_SPEED = 1.3; // m/s, as route_safe

export type HazardLandmark = { k: 'beforeCrossing' } | { k: 'afterCrossing' } | { k: 'street'; name: string } | null;

export type Banner =
  | { kind: 'hazard'; hazard: RouteHazard; distM: number; landmark: HazardLandmark }
  | { kind: 'rerouting' }
  | { kind: 'back' }
  | { kind: 'rerouteFailed' };

export type WalkView = {
  at: LngLat | null; // the walker, snapped onto the line while on it
  heading: number;
  along: number;
  joined: boolean; // has reached the line at least once
  offM: number | null; // metres from the line
  next: { step: Step; distM: number } | null;
  street: string | null; // street being walked now
  remainingM: number;
  arrived: boolean;
};

// Street name of the leg that contains a point `along` the line.
function streetAt(route: Route, track: Track, along: number): string | null {
  let name: string | null = null;
  for (const s of route.steps) {
    if ((track.cum[s.i] ?? Infinity) > along) break;
    if (s.t !== 'arrive') name = s.n ?? null;
  }
  return name;
}

function landmarkFor(h: RouteHazard, crossings: RouteCrossing[], route: Route, track: Track): HazardLandmark {
  if (crossings.some((x) => x.along >= h.along && x.along - h.along <= LANDMARK_NEAR_M)) return { k: 'beforeCrossing' };
  if (crossings.some((x) => x.along < h.along && h.along - x.along <= LANDMARK_NEAR_M)) return { k: 'afterCrossing' };
  const name = streetAt(route, track, h.along);
  return name ? { k: 'street', name } : null;
}

function nextStep(route: Route, track: Track, along: number): WalkView['next'] {
  for (const step of route.steps) {
    if (step.t === 'depart') continue;
    const at = track.cum[step.i] ?? track.total;
    if (at > along + PASSED_M || step.t === 'arrive') return { step, distM: Math.max(0, at - along) };
  }
  return null;
}

export function useWalk(walk: Walk) {
  const { t } = useTranslation();
  const [route, setRoute] = useState<Route>(walk.route);
  const track = useMemo(() => makeTrack(route.points), [route]);
  const { hazards, crossings } = useRouteFeatures(track);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [view, setView] = useState<WalkView>(() => ({
    at: null,
    heading: bearingAt(track, 0),
    along: 0,
    joined: false,
    offM: null,
    next: nextStep(route, track, 0),
    street: streetAt(route, track, 0),
    remainingM: track.total,
    arrived: false,
  }));

  // Engine memory between fixes. Reset when the route changes.
  const eng = useRef({
    along: null as number | null,
    joined: false,
    offCount: 0,
    heading: bearingAt(track, 0),
    buzzed: new Set<number>(),
    alerted: new Set<string>(),
    rerouting: false,
    lastReroute: 0,
    arrived: false,
  });
  const live = useRef({ route, track, hazards, crossings, banner });
  live.current = { route, track, hazards, crossings, banner };

  const arrive = useCallback(() => {
    if (eng.current.arrived) return;
    eng.current.arrived = true;
    haptics.arrive();
    setBanner(null);
    setView((v) => ({ ...v, arrived: true, remainingM: 0, next: null }));
    stopWalkLocation();
  }, []);

  const reroute = useCallback(
    async (from: LngLat) => {
      const e = eng.current;
      e.rerouting = true;
      setBanner({ kind: 'rerouting' });
      try {
        const pair = await routeSafe(from, walk.to.lngLat, walk.mode);
        const next = walk.kind === 'fastest' && !pair.same ? pair.fastest : pair.safest;
        Object.assign(e, { along: null, joined: false, offCount: 0, buzzed: new Set<number>() });
        setRoute(next);
        setBanner({ kind: 'back' });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'too_close') arrive();
        else {
          console.warn('Reroute failed', error);
          setBanner({ kind: 'rerouteFailed' });
        }
      } finally {
        e.rerouting = false;
        e.lastReroute = Date.now();
      }
    },
    [walk, arrive],
  );

  const onFix = useCallback(
    (f: Fix) => {
      const e = eng.current;
      if (e.arrived) return;
      const { route: r, track: tr, hazards: hz, crossings: xs, banner: b } = live.current;
      setFix(f);

      const s = snap(tr, f.lngLat, e.along);
      const trusted = f.accuracy === null || f.accuracy <= MAX_ACCURACY_M;
      const onLine = s.off <= OFF_ROUTE_M;

      if (onLine && trusted) {
        e.joined = true;
        e.offCount = 0;
        e.along = s.along;
        if (b?.kind === 'rerouteFailed') setBanner(null);
      } else if (e.joined && trusted) {
        e.offCount += 1;
      }

      if (metres(f.lngLat, tr.points[tr.points.length - 1]!) <= ARRIVE_M || (e.joined && onLine && tr.total - s.along <= ARRIVE_M)) {
        arrive();
        return;
      }

      if (e.offCount >= OFF_ROUTE_FIXES && !e.rerouting && Date.now() - e.lastReroute > REROUTE_GAP_MS) {
        e.offCount = 0;
        reroute(f.lngLat);
      }

      const along = e.along ?? 0;
      if (onLine) e.heading = bearingAt(tr, along);
      else if (f.heading !== null && (f.speed ?? 0) > 0.5) e.heading = f.heading;

      const next = nextStep(r, tr, along);
      if (onLine && next && next.step.t !== 'arrive' && next.distM <= TURN_BUZZ_M && !e.buzzed.has(next.step.i)) {
        e.buzzed.add(next.step.i);
        haptics.turn();
      }

      // One hazard banner at a time; it never replaces a reroute message.
      if (onLine && b?.kind !== 'hazard' && b?.kind !== 'rerouting') {
        const h = hz.find((x) => !e.alerted.has(x.id) && x.along - along > 0 && x.along - along <= HAZARD_AHEAD_M);
        if (h) {
          e.alerted.add(h.id);
          haptics.hazard();
          setBanner({ kind: 'hazard', hazard: h, distM: h.along - along, landmark: landmarkFor(h, xs, r, tr) });
        }
      }

      setView({
        at: onLine ? s.at : f.lngLat,
        heading: e.heading,
        along,
        joined: e.joined,
        offM: s.off,
        next,
        street: streetAt(r, tr, along),
        remainingM: Math.max(0, tr.total - along),
        arrived: false,
      });
    },
    [arrive, reroute],
  );

  // Location runs only while this walk is on screen.
  useEffect(() => {
    let alive = true;
    const unsubscribe = subscribeFixes(onFix);
    Location.getLastKnownPositionAsync()
      .then((pos) => {
        if (alive && pos && !eng.current.along) onFix({ lngLat: [pos.coords.longitude, pos.coords.latitude], accuracy: pos.coords.accuracy ?? null, heading: null, speed: null, time: pos.timestamp });
      })
      .catch(() => undefined);
    startWalkLocation({ title: t('nav.notice.title'), body: t('nav.notice.body', { name: walk.to.name }) }).catch(
      (error: unknown) => console.warn('Could not start walk location', error),
    );
    return () => {
      alive = false;
      unsubscribe();
      stopWalkLocation();
    };
    // Start once per walk; onFix reads the latest state through refs.
  }, []);

  // A new route starts fresh: the first fix on it sets progress again.
  useEffect(() => {
    eng.current.heading = bearingAt(track, 0);
  }, [track]);

  const dismissBanner = useCallback(() => setBanner(null), []);

  return {
    route,
    track,
    hazards,
    crossings,
    view,
    fix,
    banner,
    dismissBanner,
    remainingS: view.remainingM / WALK_SPEED,
  };
}
