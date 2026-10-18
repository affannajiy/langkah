import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LngLat } from '@maplibre/maplibre-react-native';

import { searchPlaces } from '../api/langkah';
import type { Place } from '../api/types';

// Search answers kept in memory (last 100) and on the phone (last 20), so a repeated
// search, even after a cold start, shows at once (guide Section 17.1). Place names
// only; nothing personal is stored beyond what Recent already keeps.
const STORE = 'langkah.searchCache.v1';
const MAX_MEMORY = 100;
const MAX_DISK = 20;
const WRITE_DELAY_MS = 2000;

const memory = new Map<string, Place[]>();
let loaded: Promise<void> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

// Nearby results depend on where the user is; about 100 m is close enough to reuse them.
export function searchKey(q: string, near: LngLat | null): string {
  const where = near ? `${near[0].toFixed(3)},${near[1].toFixed(3)}` : '-';
  return `${q.trim().toLowerCase()}|${where}`;
}

function toPlace(v: unknown): Place | null {
  if (typeof v !== 'object' || v === null) return null;
  const p = v as Record<string, unknown>;
  const ll = p.lngLat;
  if (typeof p.name !== 'string' || !Array.isArray(ll) || typeof ll[0] !== 'number' || typeof ll[1] !== 'number') return null;
  return {
    name: p.name.slice(0, 120),
    area: typeof p.area === 'string' ? p.area : null,
    category: typeof p.category === 'string' ? p.category : null,
    lngLat: [ll[0], ll[1]],
    distM: typeof p.distM === 'number' ? p.distM : null,
  };
}

export function loadSearchCache(): Promise<void> {
  loaded ??= AsyncStorage.getItem(STORE)
    .then((raw) => {
      const rows: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(rows)) return;
      for (const row of rows) {
        if (!Array.isArray(row) || typeof row[0] !== 'string' || !Array.isArray(row[1])) continue;
        // Anything searched since launch is newer; keep it.
        if (memory.has(row[0])) continue;
        memory.set(row[0], row[1].map(toPlace).filter((p: Place | null): p is Place => p !== null));
      }
    })
    .catch((error) => console.warn('Could not read search cache', error));
  return loaded;
}

function saveSoon() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const last = [...memory.entries()].slice(-MAX_DISK);
    AsyncStorage.setItem(STORE, JSON.stringify(last)).catch((error) => console.warn('Could not save search cache', error));
  }, WRITE_DELAY_MS);
}

export function cachedSearch(q: string, near: LngLat | null): Place[] | null {
  const key = searchKey(q, near);
  const hit = memory.get(key);
  if (!hit) return null;
  memory.delete(key);
  memory.set(key, hit);
  return hit;
}

// Before the first GPS fix of a cold start: the newest saved answer for the same words,
// from wherever it was asked, without distances. The fresh search replaces it.
export function staleSearch(q: string): Place[] | null {
  const prefix = `${q.trim().toLowerCase()}|`;
  const keys = [...memory.keys()].reverse();
  const key = keys.find((k) => k.startsWith(prefix));
  return key ? memory.get(key)!.map((p) => ({ ...p, distM: null })) : null;
}

export async function search(q: string, near: LngLat | null, signal?: AbortSignal): Promise<Place[]> {
  const hit = cachedSearch(q, near);
  if (hit) return hit;
  const places = await searchPlaces(q, near, signal);
  memory.set(searchKey(q, near), places);
  while (memory.size > MAX_MEMORY) memory.delete(memory.keys().next().value!);
  saveSoon();
  return places;
}

// Reset demo forgets them, like recent places.
export async function clearSearchCache(): Promise<void> {
  memory.clear();
  await AsyncStorage.removeItem(STORE).catch(() => undefined);
}
