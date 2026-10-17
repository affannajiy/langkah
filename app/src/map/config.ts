import type { LngLat, LngLatBounds } from '@maplibre/maplibre-react-native';

// OpenFreeMap Positron: free OSM vector tiles, no key (guide Section 3).
export const POSITRON_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

// Pilot areas [west, south, east, north] (guide Section 7.3). Data and routing only
// cover these boxes. Keep in step with AREAS in data-scripts/ipoh_extract.py.
export const IPOH_BOUNDS: LngLatBounds = [101.068, 4.583, 101.1, 4.612];
export const SERI_ISKANDAR_BOUNDS: LngLatBounds = [100.935, 4.345, 100.99, 4.395];
export const PILOT_AREAS: LngLatBounds[] = [IPOH_BOUNDS, SERI_ISKANDAR_BOUNDS];

export const MIN_ZOOM = 12;
export const MAX_ZOOM = 19;

function inBox([lng, lat]: LngLat, [west, south, east, north]: LngLatBounds): boolean {
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

// True when a point lies inside any pilot area.
export function isInPilotArea(point: LngLat): boolean {
  return PILOT_AREAS.some((box) => inBox(point, box));
}

// The pilot area whose centre is closest, for framing the map when the user is outside all of them.
export function nearestPilotArea([lng, lat]: LngLat): LngLatBounds {
  const dist = ([w, s, e, n]: LngLatBounds) => Math.hypot((w + e) / 2 - lng, (s + n) / 2 - lat);
  return PILOT_AREAS.reduce((best, box) => (dist(box) < dist(best) ? box : best));
}

// Map tiles kept on the phone after viewing (MapLibre's default is 50 MB).
// The pilot areas are small, so 20 MB holds them with room to spare.
export const TILE_CACHE_BYTES = 20 * 1024 * 1024;
