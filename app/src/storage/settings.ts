import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

// App settings (guide Section 5.2, screens 2, 3, 18 and 19), kept on the phone only.
// One small store shared by every screen, so a change in Settings shows at once on
// the map and during a walk. A wrong or old value falls back to the default.

export type Language = 'en' | 'ms';

export type LayerToggles = {
  crossings: boolean;
  busStops: boolean;
  shelters: boolean;
  covered: boolean; // covered walkways (five-foot ways, arcades)
  kerbs: boolean; // kerb ramps and tactile paving
  rest: boolean; // benches, toilets, drinking water
};

export type Settings = {
  language: Language | null; // null: follow the phone until the user picks one
  autoNight: boolean; // night scoring and the dark map after 19:30
  vibration: boolean; // turn, hazard and arrival pulses
  layers: LayerToggles;
  onboarded: boolean;
  locationAsked: boolean; // the map asks for location by itself only once
  batteryTipSeen: boolean; // the keep-running tip before a first walk, on some brands
};

const STORE = 'langkah.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  language: null,
  autoNight: true,
  vibration: true,
  // The map stays calm: the newer, busier layers start off.
  layers: { crossings: true, busStops: true, shelters: true, covered: true, kerbs: false, rest: false },
  onboarded: false,
  locationAsked: false,
  batteryTipSeen: false,
};

let current: Settings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

function parse(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS;
  const r = raw as Record<string, unknown>;
  const l = (typeof r.layers === 'object' && r.layers !== null ? r.layers : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    language: r.language === 'en' || r.language === 'ms' ? r.language : null,
    autoNight: bool(r.autoNight, d.autoNight),
    vibration: bool(r.vibration, d.vibration),
    layers: {
      crossings: bool(l.crossings, d.layers.crossings),
      busStops: bool(l.busStops, d.layers.busStops),
      shelters: bool(l.shelters, d.layers.shelters),
      covered: bool(l.covered, d.layers.covered),
      kerbs: bool(l.kerbs, d.layers.kerbs),
      rest: bool(l.rest, d.layers.rest),
    },
    onboarded: bool(r.onboarded, d.onboarded),
    locationAsked: bool(r.locationAsked, d.locationAsked),
    batteryTipSeen: bool(r.batteryTipSeen, d.batteryTipSeen),
  };
}

function emit() {
  for (const l of listeners) l();
}

let loading: Promise<Settings> | null = null;

// Read once at start-up. Safe to call again; later calls share the first read.
export function loadSettings(): Promise<Settings> {
  loading ??= AsyncStorage.getItem(STORE)
    .then((raw) => parse(raw ? JSON.parse(raw) : null))
    .catch((error: unknown) => {
      console.warn('Could not read settings', error);
      return DEFAULT_SETTINGS;
    })
    .then((s) => {
      current = s;
      loaded = true;
      emit();
      return s;
    });
  return loading;
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  emit();
  AsyncStorage.setItem(STORE, JSON.stringify(current)).catch((error: unknown) => {
    console.warn('Could not save settings', error);
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings);
}

export function useSettingsLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => loaded);
}
