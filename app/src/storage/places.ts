import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LngLat } from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

// Saved places (Home, UTP, Work) and recent searches, kept on the phone only.
// Nothing here is sent to the server. A wrong or old value is dropped, never trusted.

export type SavedKey = 'home' | 'utp' | 'work';
export const SAVED_KEYS: SavedKey[] = ['home', 'utp', 'work'];

export type StoredPlace = { name: string; area: string | null; category: string | null; lngLat: LngLat };

const SAVED_STORE = 'langkah.saved.v1';
const RECENT_STORE = 'langkah.recent.v1';
const STARRED_STORE = 'langkah.starred.v1';
const MAX_RECENT = 5;

// Starred places beyond Home, UTP and Work: 3 free, 20 with Langkah Plus (guide
// Section 15.2). When Plus ends, the extra stars stay; only adding more stops.
export const MAX_STARRED_FREE = 3;
export const MAX_STARRED_PLUS = 20;

// UTP is set from the start: the team's campus, inside the Seri Iskandar pilot area.
const UTP: StoredPlace = {
  name: 'Universiti Teknologi PETRONAS',
  area: 'Seri Iskandar',
  category: 'amenity:university',
  lngLat: [100.97958, 4.38545],
};

function toPlace(v: unknown): StoredPlace | null {
  if (typeof v !== 'object' || v === null) return null;
  const p = v as Record<string, unknown>;
  const ll = p.lngLat;
  if (typeof p.name !== 'string' || !Array.isArray(ll) || ll.length !== 2) return null;
  const [lng, lat] = ll;
  if (typeof lng !== 'number' || typeof lat !== 'number' || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return {
    name: p.name.slice(0, 120),
    area: typeof p.area === 'string' ? p.area : null,
    category: typeof p.category === 'string' ? p.category : null,
    lngLat: [lng, lat],
  };
}

async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn(`Could not read ${key}`, error);
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not save ${key}`, error);
  }
}

export type SavedPlaces = Record<SavedKey, StoredPlace | null>;

// Shared by the Map and Me tabs, so a change on one shows on the other at once.
let saved: SavedPlaces = { home: null, utp: UTP, work: null };
let savedRead: Promise<void> | null = null;
const savedListeners = new Set<() => void>();
const emitSaved = () => savedListeners.forEach((l) => l());

function readSaved(): Promise<void> {
  savedRead ??= readJson(SAVED_STORE).then((raw) => {
    if (typeof raw !== 'object' || raw === null) return;
    const r = raw as Record<string, unknown>;
    saved = {
      home: toPlace(r.home),
      // An explicit null means the user cleared UTP; a missing key means never touched.
      utp: 'utp' in r ? toPlace(r.utp) : UTP,
      work: toPlace(r.work),
    };
    emitSaved();
  });
  return savedRead;
}

function subscribeSaved(listener: () => void) {
  savedListeners.add(listener);
  return () => {
    savedListeners.delete(listener);
  };
}

export function setSavedPlace(key: SavedKey, place: StoredPlace | null) {
  saved = { ...saved, [key]: place };
  emitSaved();
  writeJson(SAVED_STORE, saved);
}

// The Me tab's saved-place rows open the Map tab's "Choose Home" search. Taken once.
let chooseNext: SavedKey | null = null;
export function requestChooseSaved(key: SavedKey) {
  chooseNext = key;
}
export function takeChooseSaved(): SavedKey | null {
  const key = chooseNext;
  chooseNext = null;
  return key;
}

// The Me tab's starred places open the Map tab's route compare. Taken once.
let routeNext: StoredPlace | null = null;
export function requestRoute(place: StoredPlace) {
  routeNext = place;
}
export function takeRoute(): StoredPlace | null {
  const place = routeNext;
  routeNext = null;
  return place;
}

// Reset demo: the Map tab flies back to Ipoh Railway Station on its next focus. Taken once.
let mapHomeNext = false;
export function requestMapHome() {
  mapHomeNext = true;
}
export function takeMapHome(): boolean {
  const next = mapHomeNext;
  mapHomeNext = false;
  return next;
}

// Reset demo also forgets recent searches, on screen at once.
const recentListeners = new Set<() => void>();
export async function clearRecentPlaces(): Promise<void> {
  await writeJson(RECENT_STORE, []);
  recentListeners.forEach((l) => l());
}

export function useSavedPlaces() {
  const current = useSyncExternalStore(subscribeSaved, () => saved);
  useEffect(() => {
    void readSaved();
  }, []);
  return { saved: current, setPlace: setSavedPlace };
}

// Starred places, shared by the route sheet, Search and the Me tab.
let starred: StoredPlace[] = [];
let starredRead: Promise<void> | null = null;
const starredListeners = new Set<() => void>();
const emitStarred = () => starredListeners.forEach((l) => l());

const samePlace = (a: StoredPlace, b: StoredPlace) =>
  a.name === b.name && Math.abs(a.lngLat[0] - b.lngLat[0]) < 1e-4 && Math.abs(a.lngLat[1] - b.lngLat[1]) < 1e-4;

function readStarred(): Promise<void> {
  starredRead ??= readJson(STARRED_STORE).then((raw) => {
    if (!Array.isArray(raw)) return;
    starred = raw.map(toPlace).filter((p): p is StoredPlace => p !== null).slice(0, MAX_STARRED_PLUS);
    emitStarred();
  });
  return starredRead;
}

function setStarred(next: StoredPlace[]) {
  starred = next;
  emitStarred();
  writeJson(STARRED_STORE, next);
}

export function isStarred(place: StoredPlace): boolean {
  return starred.some((p) => samePlace(p, place));
}

// Adds or removes a star. 'full' when the limit for this account is reached.
export function toggleStar(place: StoredPlace, plus: boolean): 'added' | 'removed' | 'full' {
  if (isStarred(place)) {
    setStarred(starred.filter((p) => !samePlace(p, place)));
    return 'removed';
  }
  if (starred.length >= (plus ? MAX_STARRED_PLUS : MAX_STARRED_FREE)) return 'full';
  setStarred([place, ...starred]);
  return 'added';
}

export function unstar(place: StoredPlace) {
  setStarred(starred.filter((p) => !samePlace(p, place)));
}

export function restoreStar(place: StoredPlace, index: number) {
  if (isStarred(place)) return;
  const next = [...starred];
  next.splice(Math.min(index, next.length), 0, place);
  setStarred(next);
}

export async function clearStarred(): Promise<void> {
  setStarred([]);
}

export function useStarred(): StoredPlace[] {
  const current = useSyncExternalStore(
    (l) => {
      starredListeners.add(l);
      return () => {
        starredListeners.delete(l);
      };
    },
    () => starred,
  );
  useEffect(() => {
    void readStarred();
  }, []);
  return current;
}

export function useRecentPlaces() {
  const [recent, setRecent] = useState<StoredPlace[]>([]);

  useEffect(() => {
    let alive = true;
    readJson(RECENT_STORE).then((raw) => {
      if (!alive || !Array.isArray(raw)) return;
      setRecent(raw.map(toPlace).filter((p): p is StoredPlace => p !== null).slice(0, MAX_RECENT));
    });
    const clear = () => setRecent([]);
    recentListeners.add(clear);
    return () => {
      alive = false;
      recentListeners.delete(clear);
    };
  }, []);

  const addRecent = useCallback((place: StoredPlace) => {
    setRecent((prev) => {
      const same = (p: StoredPlace) =>
        p.name === place.name && Math.abs(p.lngLat[0] - place.lngLat[0]) < 1e-4 && Math.abs(p.lngLat[1] - place.lngLat[1]) < 1e-4;
      const next = [place, ...prev.filter((p) => !same(p))].slice(0, MAX_RECENT);
      writeJson(RECENT_STORE, next);
      return next;
    });
  }, []);

  return { recent, addRecent };
}
