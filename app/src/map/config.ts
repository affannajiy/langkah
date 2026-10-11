import type { LngLat, LngLatBounds } from '@maplibre/maplibre-react-native';

// OpenFreeMap Positron: free OSM vector tiles, no key (guide Section 3).
export const POSITRON_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

// Central Ipoh pilot area [west, south, east, north] (guide Section 7.3).
export const IPOH_BOUNDS: LngLatBounds = [101.068, 4.583, 101.1, 4.612];
export const IPOH_CENTER: LngLat = [101.084, 4.5975];

export const MIN_ZOOM = 12;
export const MAX_ZOOM = 19;
