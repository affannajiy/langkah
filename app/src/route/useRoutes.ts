import type { LngLat } from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../api/langkah';
import type { RouteError, RouteOptions, RoutePair, ScoringMode } from '../api/types';
import { cachedRoutes, loadRoutes, prefetchRoutes, routeKey } from './routeCache';

export type RoutesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; pair: RoutePair }
  | { status: 'error'; error: RouteError };

// Asks route_safe for both routes whenever the trip, the scoring mode or an option changes.
// The trip is passed as plain numbers so a new array with the same point does not refetch.
// A cached answer shows at once; once routes land, the other mode and the other cover
// choice are fetched quietly so those toggles are instant too (guide Section 17.1).
export function useRoutes(from: LngLat | null, to: LngLat | null, mode: ScoringMode, options: RouteOptions, enabled: boolean) {
  const [state, setState] = useState<RoutesState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  const fx = from?.[0];
  const fy = from?.[1];
  const tx = to?.[0];
  const ty = to?.[1];
  const { cover, stepFree } = options;

  useEffect(() => {
    if (!enabled || fx === undefined || fy === undefined || tx === undefined || ty === undefined) {
      setState({ status: 'idle' });
      return;
    }
    const a: LngLat = [fx, fy];
    const b: LngLat = [tx, ty];
    const opts = { cover, stepFree };
    const prefetchOthers = () => {
      prefetchRoutes(a, b, mode === 'night' ? 'day' : 'night', opts);
      prefetchRoutes(a, b, mode, { cover: !cover, stepFree });
    };
    const hit = cachedRoutes(routeKey(a, b, mode, opts));
    if (hit) {
      setState({ status: 'ok', pair: hit });
      prefetchOthers();
      return;
    }
    let live = true;
    setState({ status: 'loading' });
    loadRoutes(a, b, mode, opts)
      .then((pair) => {
        if (!live) return;
        setState({ status: 'ok', pair });
        prefetchOthers();
      })
      .catch((error: unknown) => {
        if (!live) return;
        const code: RouteError =
          error instanceof ApiError && error.code !== 'bad_response' && error.code !== 'too_big' ? error.code : 'generic';
        if (code === 'network' || code === 'generic') console.warn('route_safe failed', error);
        setState({ status: 'error', error: code });
      });
    return () => {
      live = false;
    };
  }, [fx, fy, tx, ty, mode, cover, stepFree, enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
