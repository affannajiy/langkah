import type { LngLat } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { colors } from '../theme/theme';

// Location during an active walk only (guide Section 5.2, screen 8).
// A foreground service with a visible notification keeps fixes coming when the
// screen is off. Android allows that with "while using the app" permission, so
// Langkah never asks for "all the time" location. Fixes stay in memory on the
// phone; only a reroute sends one as the new start point.

export type Fix = {
  lngLat: LngLat;
  accuracy: number | null; // metres
  heading: number | null; // degrees, from GPS course; null when standing still
  speed: number | null; // m/s
  time: number;
};

const TASK = 'langkah-walk-location';
const listeners = new Set<(fix: Fix) => void>();

function toFix(l: Location.LocationObject): Fix {
  const { longitude, latitude, accuracy, heading, speed } = l.coords;
  return {
    lngLat: [longitude, latitude],
    accuracy: accuracy ?? null,
    heading: heading !== null && heading >= 0 ? heading : null,
    speed: speed ?? null,
    time: l.timestamp,
  };
}

function emit(l: Location.LocationObject) {
  const fix = toFix(l);
  listeners.forEach((fn) => fn(fix));
}

// Must run at app start (imported by the root layout), before Android delivers a fix.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Walk location task failed', error.message);
    return;
  }
  data?.locations.forEach(emit);
});

export function subscribeFixes(fn: (fix: Fix) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let watcher: Location.LocationSubscription | null = null;

const OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 3,
  timeInterval: 1000,
};

export type WalkNotice = { title: string; body: string };

// Starts the foreground service. If Android refuses (for example the app went to the
// background before the walk started), falls back to updates while the app is open.
export async function startWalkLocation(notice: WalkNotice): Promise<'service' | 'foreground'> {
  await stopWalkLocation();
  try {
    await Location.startLocationUpdatesAsync(TASK, {
      ...OPTIONS,
      foregroundService: {
        notificationTitle: notice.title,
        notificationBody: notice.body,
        notificationColor: colors.navy,
        killServiceOnDestroy: true,
      },
    });
    return 'service';
  } catch (error) {
    console.warn('Walk foreground service not started, using foreground updates', error);
    watcher = await Location.watchPositionAsync(OPTIONS, emit);
    return 'foreground';
  }
}

export async function stopWalkLocation(): Promise<void> {
  watcher?.remove();
  watcher = null;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
  } catch (error) {
    console.warn('Could not stop walk location', error);
  }
}
