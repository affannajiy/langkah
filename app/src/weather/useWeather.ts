import type { LngLat } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';

import { nearestPilotArea } from '../map/config';

// Rain and heat for route compare (guide Section 16.3). Open-Meteo is free and needs
// no key. It is asked about the middle of the pilot area, never the walker's own
// spot, so it only learns "central Ipoh". Kept 15 minutes. Offline or failed: null,
// and routes are planned as usual.

export type Weather = {
  rain: 'now' | 'soon' | null; // raining now, or 60% or more within the hour
  hot: boolean; // feels like 35 °C or more (MetMalaysia heat level 1)
};

const URL = 'https://api.open-meteo.com/v1/forecast';
const KEEP_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 6000;
const WET_MM = 0.1;
const WET_CHANCE = 60;
const HOT_C = 35;

const cache = new Map<string, { at: number; weather: Weather | null; pending?: Promise<Weather | null> }>();

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numOr = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

async function fetchWeather(lon: number, lat: number): Promise<Weather | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const query =
      `?latitude=${lat}&longitude=${lon}` +
      '&current=precipitation,apparent_temperature&hourly=precipitation_probability&forecast_hours=2&timezone=Asia%2FKuala_Lumpur';
    const res = await fetch(URL + query, { signal: controller.signal });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!isObj(body) || !isObj(body.current)) return null;
    const hourly = isObj(body.hourly) && Array.isArray(body.hourly.precipitation_probability) ? body.hourly.precipitation_probability : [];
    const chance = Math.max(0, ...hourly.map((p) => numOr(p, 0)));
    return {
      rain: numOr(body.current.precipitation, 0) >= WET_MM ? 'now' : chance >= WET_CHANCE ? 'soon' : null,
      hot: numOr(body.current.apparent_temperature, 0) >= HOT_C,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function useWeather(near: LngLat | null): Weather | null {
  // The pilot area's centre at 2 decimals (about 1 km), whichever point is given.
  const box = near ? nearestPilotArea(near) : null;
  const lon = box ? Math.round(((box[0] + box[2]) / 2) * 100) / 100 : null;
  const lat = box ? Math.round(((box[1] + box[3]) / 2) * 100) / 100 : null;
  const key = lon === null || lat === null ? null : `${lon},${lat}`;
  const [weather, setWeather] = useState<Weather | null>(() => (key ? (cache.get(key)?.weather ?? null) : null));

  useEffect(() => {
    if (!key || lon === null || lat === null) return;
    let alive = true;
    let entry = cache.get(key);
    if (!entry || (Date.now() - entry.at > KEEP_MS && !entry.pending)) {
      const pending = fetchWeather(lon, lat);
      entry = { at: Date.now(), weather: entry?.weather ?? null, pending };
      cache.set(key, entry);
      pending.then((w) => cache.set(key, { at: Date.now(), weather: w }));
    }
    if (entry.pending) entry.pending.then((w) => alive && setWeather(w));
    else setWeather(entry.weather);
    return () => {
      alive = false;
    };
  }, [key, lon, lat]);

  return weather;
}
