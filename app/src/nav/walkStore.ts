import type { LngLat } from '@maplibre/maplibre-react-native';

import type { Route, ScoringMode } from '../api/types';
import type { RouteKind } from '../map/RouteLayers';

// The walk the user just started, handed from route compare to the walking screen.
// Routes are too big for URL params, and they never need to outlive the app.
export type Walk = {
  route: Route;
  kind: RouteKind;
  mode: ScoringMode;
  to: { name: string; lngLat: LngLat };
};

let current: Walk | null = null;

export function setWalk(walk: Walk | null) {
  current = walk;
}

export function getWalk(): Walk | null {
  return current;
}
