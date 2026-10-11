import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, mapInView } from '../api/langkah';
import type { MapView } from '../api/types';

// Below this zoom the view is too wide to be useful and the server refuses it.
export const PINS_MIN_ZOOM = 14;
const DEBOUNCE_MS = 400;

export type MapViewState =
  | { status: 'zoomed_out' }
  | { status: 'loading'; last: MapView | null }
  | { status: 'ok'; view: MapView }
  | { status: 'error'; last: MapView | null };

// Hazards and amenities for the area on screen, fetched after the map stops moving.
// A newer request cancels the older one, so a fast pan never shows stale pins.
export function useMapView() {
  const [state, setState] = useState<MapViewState>({ status: 'zoomed_out' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const last = useRef<MapView | null>(null);

  const onViewChange = useCallback((bounds: LngLatBounds, zoom: number) => {
    if (timer.current) clearTimeout(timer.current);
    if (zoom < PINS_MIN_ZOOM) {
      inflight.current?.abort();
      setState({ status: 'zoomed_out' });
      return;
    }
    timer.current = setTimeout(async () => {
      inflight.current?.abort();
      const controller = new AbortController();
      inflight.current = controller;
      setState({ status: 'loading', last: last.current });
      try {
        const view = await mapInView(bounds, controller.signal);
        if (controller.signal.aborted) return;
        last.current = view;
        setState({ status: 'ok', view });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.code === 'too_big') {
          setState({ status: 'zoomed_out' });
          return;
        }
        console.warn('map_in_view failed', error);
        setState({ status: 'error', last: last.current });
      }
    }, DEBOUNCE_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      inflight.current?.abort();
    },
    [],
  );

  const view = state.status === 'ok' ? state.view : state.status === 'zoomed_out' ? null : state.last;
  return { state, view, onViewChange };
}
