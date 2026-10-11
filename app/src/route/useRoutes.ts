import type { LngLat } from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, routeSafe } from '../api/langkah';
import type { RouteError, RoutePair, ScoringMode } from '../api/types';

export type RoutesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; pair: RoutePair }
  | { status: 'error'; error: RouteError };

// Asks route_safe for both routes whenever the trip or the scoring mode changes.
// The trip is passed as plain numbers so a new array with the same point does not refetch.
export function useRoutes(from: LngLat | null, to: LngLat | null, mode: ScoringMode, enabled: boolean) {
  const [state, setState] = useState<RoutesState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const inflight = useRef<AbortController | null>(null);

  const fx = from?.[0];
  const fy = from?.[1];
  const tx = to?.[0];
  const ty = to?.[1];

  useEffect(() => {
    inflight.current?.abort();
    if (!enabled || fx === undefined || fy === undefined || tx === undefined || ty === undefined) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    inflight.current = controller;
    setState({ status: 'loading' });
    routeSafe([fx, fy], [tx, ty], mode, controller.signal)
      .then((pair) => {
        if (!controller.signal.aborted) setState({ status: 'ok', pair });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const code: RouteError =
          error instanceof ApiError && error.code !== 'bad_response' && error.code !== 'too_big' ? error.code : 'generic';
        if (code === 'network' || code === 'generic') console.warn('route_safe failed', error);
        setState({ status: 'error', error: code });
      });
    return () => controller.abort();
  }, [fx, fy, tx, ty, mode, enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
