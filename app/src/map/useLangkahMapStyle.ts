import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';

import { POSITRON_STYLE_URL } from './config';

// Langkah day colours for the base map, sampled from docs/screens/Main.png.
// Muted and low-saturation so routes, hazards and amenities stand out.
const DAY_PAINT: Record<string, Record<string, string>> = {
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

const FETCH_TIMEOUT_MS = 8000;

function applyDayPaint(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      const paint = DAY_PAINT[layer.id];
      if (!paint || !('paint' in layer)) return layer;
      return { ...layer, paint: { ...layer.paint, ...paint } } as typeof layer;
    }),
  };
}

// Loads Positron and recolours a few layers. If the fetch fails, falls back
// to the stock Positron URL so the map still shows.
export function useLangkahMapStyle(): string | StyleSpecification | null {
  const [style, setStyle] = useState<string | StyleSpecification | null>(null);

  useEffect(() => {
    let unmounted = false;
    const controller = new AbortController();
    // A timeout also aborts, and then falls back like any other failure.
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    fetch(POSITRON_STYLE_URL, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Style request failed: ${res.status}`);
        return res.json() as Promise<StyleSpecification>;
      })
      .then((json) => {
        if (!unmounted) setStyle(applyDayPaint(json));
      })
      .catch((error: unknown) => {
        if (unmounted) return;
        console.warn('Map style fallback to stock Positron', error);
        setStyle(POSITRON_STYLE_URL);
      })
      .finally(() => clearTimeout(timer));

    return () => {
      unmounted = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return style;
}
