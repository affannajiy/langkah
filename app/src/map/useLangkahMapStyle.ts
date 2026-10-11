import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useState } from 'react';

import type { ScoringMode } from '../api/types';
import { POSITRON_STYLE_URL } from './config';
import { useScoringMode } from './useScoringMode';

type Paint = Record<string, Record<string, string>>;

// Langkah day colours for the base map, sampled from docs/screens/Main.png.
// Muted and low-saturation so routes, hazards and amenities stand out.
const DAY_PAINT: Paint = {
  background: { 'background-color': '#E9ECF1' },
  landuse_residential: { 'fill-color': '#E6E9EE' },
  park: { 'fill-color': '#E1E7E2' },
  landcover_wood: { 'fill-color': '#DCE3DD' },
  building: { 'fill-color': '#E2E6EC', 'fill-outline-color': '#D6DBE2' },
  water: { 'fill-color': '#C3D6E8' },
  waterway: { 'line-color': '#C3D6E8' },
  highway_path: { 'line-color': '#F7F8FA' },
  highway_minor: { 'line-color': '#FFFFFF' },
  highway_major_casing: { 'line-color': '#D3D9E2' },
  highway_major_inner: { 'line-color': '#FFFFFF' },
  'highway-name-minor': { 'text-color': '#5B6472' },
  'highway-name-major': { 'text-color': '#5B6472' },
};

// Night: dark navy (guide Sections 6.1 and 6.2), built on the brand navy #0F2A47.
// Streets stay lighter than the blocks, so the route and pins still read clearly.
const NIGHT_LAND = '#0B1F36';
const NIGHT_ROAD = '#2F5078';
const NIGHT_ROAD_MAJOR = '#3A5E8A';
const NIGHT_CASING = '#1E3F66';
const NIGHT_RAIL = '#2F4A68';
const NIGHT_PAINT: Paint = {
  background: { 'background-color': NIGHT_LAND },
  landuse_residential: { 'fill-color': '#0E243E' },
  park: { 'fill-color': '#10302F' },
  landcover_wood: { 'fill-color': '#10302F' },
  building: { 'fill-color': '#15304F', 'fill-outline-color': '#1C3A5C' },
  water: { 'fill-color': '#081627' },
  waterway: { 'line-color': '#081627' },
  road_area_pier: { 'fill-color': NIGHT_LAND },
  road_pier: { 'line-color': NIGHT_LAND },
  highway_path: { 'line-color': '#2A4A70' },
  highway_minor: { 'line-color': NIGHT_ROAD },
  highway_major_casing: { 'line-color': NIGHT_CASING },
  highway_major_inner: { 'line-color': NIGHT_ROAD_MAJOR },
  highway_major_subtle: { 'line-color': NIGHT_ROAD },
  highway_motorway_casing: { 'line-color': NIGHT_CASING },
  highway_motorway_inner: { 'line-color': NIGHT_ROAD_MAJOR },
  highway_motorway_subtle: { 'line-color': NIGHT_ROAD },
  highway_motorway_bridge_casing: { 'line-color': NIGHT_CASING },
  highway_motorway_bridge_inner: { 'line-color': NIGHT_ROAD_MAJOR },
  tunnel_motorway_casing: { 'line-color': NIGHT_CASING },
  tunnel_motorway_inner: { 'line-color': NIGHT_ROAD },
  railway: { 'line-color': NIGHT_RAIL },
  railway_transit: { 'line-color': NIGHT_RAIL },
  railway_service: { 'line-color': NIGHT_RAIL },
  railway_dashline: { 'line-color': NIGHT_LAND },
  railway_transit_dashline: { 'line-color': NIGHT_LAND },
  railway_service_dashline: { 'line-color': NIGHT_LAND },
};
// Every label at night: light text on a navy halo.
const NIGHT_LABEL = { 'text-color': '#C9D6E6', 'text-halo-color': NIGHT_LAND };

// Shown behind the map while tiles load.
export const MAP_LAND: Record<ScoringMode, string> = { day: '#E9ECF1', night: NIGHT_LAND };

const FETCH_TIMEOUT_MS = 8000;

function recolour(style: StyleSpecification, mode: ScoringMode): StyleSpecification {
  const table = mode === 'night' ? NIGHT_PAINT : DAY_PAINT;
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (!('paint' in layer)) return layer;
      const label = mode === 'night' && layer.type === 'symbol' ? NIGHT_LABEL : null;
      const paint = table[layer.id] ?? label;
      if (!paint) return layer;
      return { ...layer, paint: { ...layer.paint, ...paint } } as typeof layer;
    }),
  };
}

// One download of Positron per app run, shared by every map.
let positron: Promise<StyleSpecification | null> | null = null;

function loadPositron(): Promise<StyleSpecification | null> {
  positron ??= (async () => {
    const controller = new AbortController();
    // A timeout also aborts, and then falls back like any other failure.
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(POSITRON_STYLE_URL, { signal: controller.signal });
      if (!res.ok) throw new Error(`Style request failed: ${res.status}`);
      return (await res.json()) as StyleSpecification;
    } catch (error) {
      console.warn('Map style fallback to stock Positron', error);
      positron = null; // try again the next time a map opens
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();
  return positron;
}

// Positron recoloured for day or night; night follows the scoring mode. If the
// download fails, falls back to the stock Positron URL so the map still shows.
export function useLangkahMapStyle(): { style: string | StyleSpecification | null; land: string } {
  const { mode } = useScoringMode();
  const [base, setBase] = useState<StyleSpecification | 'fallback' | null>(null);

  useEffect(() => {
    let alive = true;
    loadPositron().then((style) => {
      if (alive) setBase(style ?? 'fallback');
    });
    return () => {
      alive = false;
    };
  }, []);

  const style = useMemo(() => {
    if (base === null) return null;
    if (base === 'fallback') return POSITRON_STYLE_URL;
    return recolour(base, mode);
  }, [base, mode]);

  return { style, land: base === 'fallback' ? MAP_LAND.day : MAP_LAND[mode] };
}
