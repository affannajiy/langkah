import type { LngLat, LngLatBounds } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';

import { mapInView } from '../api/langkah';
import { snap, type Track } from './geo';

// Hazards and marked crossings on the active route only (guide Section 6.3, screen 4).
// Reuses map_in_view, one small box at a time along the line, so nothing new is
// exposed and the phone still never downloads the dataset (Section 7.4).

export type RouteHazard = { id: string; lngLat: LngLat; category: string; along: number };
export type RouteCrossing = { lngLat: LngLat; along: number };

// map_in_view refuses boxes wider than 0.05 degrees.
const MAX_SPAN = 0.04;
const PAD = 0.0003; // about 30 m
const HAZARD_NEAR_M = 15; // same as route_safe's hazard count
const CROSSING_NEAR_M = 10;

function boxesAlong(points: LngLat[]): LngLatBounds[] {
  const boxes: LngLatBounds[] = [];
  let box: LngLatBounds | null = null;
  for (const [x, y] of points) {
    if (box) {
      const next: LngLatBounds = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
      if (next[2] - next[0] <= MAX_SPAN && next[3] - next[1] <= MAX_SPAN) {
        box = next;
        continue;
      }
      boxes.push(box);
    }
    box = [x, y, x, y];
  }
  if (box) boxes.push(box);
  return boxes.map(([w, s, e, n]) => [w - PAD, s - PAD, e + PAD, n + PAD]);
}

// The walk map is close up; only hazards and crossings are read from these views.
const WALK_ZOOM = 17;

export function useRouteFeatures(track: Track) {
  const [hazards, setHazards] = useState<RouteHazard[]>([]);
  const [crossings, setCrossings] = useState<RouteCrossing[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(boxesAlong(track.points).map((b) => mapInView(b, WALK_ZOOM, controller.signal)))
      .then((views) => {
        if (controller.signal.aborted) return;
        const seenH = new Set<string>();
        const seenX = new Set<string>();
        const hz: RouteHazard[] = [];
        const xs: RouteCrossing[] = [];
        for (const v of views) {
          for (const h of v.hazards) {
            if (seenH.has(h.id)) continue;
            seenH.add(h.id);
            const s = snap(track, h.lngLat, null);
            if (s.off <= HAZARD_NEAR_M) hz.push({ ...h, along: s.along });
          }
          for (const a of v.amenities) {
            const key = `${a.lngLat[0]},${a.lngLat[1]}`;
            if (a.kind !== 'crossing' || seenX.has(key)) continue;
            seenX.add(key);
            const s = snap(track, a.lngLat, null);
            if (s.off <= CROSSING_NEAR_M) xs.push({ lngLat: a.lngLat, along: s.along });
          }
        }
        setHazards(hz.sort((a, b) => a.along - b.along));
        setCrossings(xs.sort((a, b) => a.along - b.along));
      })
      // Without hazards the walk still works; the map just shows fewer icons.
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.warn('Could not load hazards on route', error);
      });
    return () => controller.abort();
  }, [track]);

  return { hazards, crossings };
}
