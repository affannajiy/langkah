import type { LngLat } from '@maplibre/maplibre-react-native';

import { routeSafe } from '../api/langkah';
import type { RouteOptions, RoutePair, ScoringMode } from '../api/types';

// Routes kept in memory, so toggles and going back to a trip show at once
// (guide Section 17.1). Hazards change, so an entry lives 10 minutes.
const MAX_ROUTES = 50;
const TTL_MS = 10 * 60 * 1000;

type Entry = { at: number; pair: RoutePair };
const done = new Map<string, Entry>();
// Requests still running, shared by everyone asking for the same trip.
const running = new Map<string, Promise<RoutePair>>();

const r5 = (n: number) => (Math.round(n * 1e5) / 1e5).toFixed(5);

export function routeKey(from: LngLat, to: LngLat, mode: ScoringMode, options: RouteOptions): string {
  return [r5(from[0]), r5(from[1]), r5(to[0]), r5(to[1]), mode, options.cover ? 'c' : '-', options.stepFree ? 's' : '-'].join(',');
}

export function cachedRoutes(key: string): RoutePair | null {
  const hit = done.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    done.delete(key);
    return null;
  }
  // Move to the back, so the oldest unused entry goes first.
  done.delete(key);
  done.set(key, hit);
  return hit.pair;
}

// One request per trip at a time. It is not cancelled when a screen stops waiting for it:
// the answer still lands in the cache for the next look.
export function loadRoutes(from: LngLat, to: LngLat, mode: ScoringMode, options: RouteOptions): Promise<RoutePair> {
  const key = routeKey(from, to, mode, options);
  const hit = cachedRoutes(key);
  if (hit) return Promise.resolve(hit);
  const live = running.get(key);
  if (live) return live;
  const request = routeSafe(from, to, mode, options)
    .then((pair) => {
      done.set(key, { at: Date.now(), pair });
      while (done.size > MAX_ROUTES) done.delete(done.keys().next().value!);
      return pair;
    })
    .finally(() => running.delete(key));
  running.set(key, request);
  return request;
}

// Fire and forget: warm the cache for a trip the user is likely to ask for next.
export function prefetchRoutes(from: LngLat | null, to: LngLat | null, mode: ScoringMode, options: RouteOptions) {
  if (!from || !to) return;
  loadRoutes(from, to, mode, options).catch(() => {
    // The real request shows any error.
  });
}

// Reset demo and sign-out start clean.
export function clearRouteCache() {
  done.clear();
}
