import type { LngLat } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { LocationAccess } from './useLocationPermission';

// While there is no fix, check this often whether location services came back on.
const RETRY_MS = 5000;

// The locate button asks for a new try (the only retry after "No thanks", test note F3).
const retryListeners = new Set<() => void>();
export function retryHere() {
  retryListeners.forEach((fn) => fn());
}

// The user's position while the Map tab is open, for search distances and the route start.
// Foreground only, kept in memory, never stored or sent anywhere except as a route start.
export function useHere(access: LocationAccess): LngLat | null {
  const [here, setHere] = useState<LngLat | null>(null);
  // Bumped to start the watch again (location turned on, app back in front).
  const [attempt, setAttempt] = useState(0);
  const waiting = access === 'granted' && here === null;

  useEffect(() => {
    if (access !== 'granted') {
      setHere(null);
      return;
    }
    let sub: Location.LocationSubscription | null = null;
    let alive = true;

    Location.getLastKnownPositionAsync()
      .then((pos) => alive && pos && setHere([pos.coords.longitude, pos.coords.latitude]))
      .catch((error: unknown) => console.warn('No last known position', error));

    Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 20 }, (pos) =>
      setHere([pos.coords.longitude, pos.coords.latitude]),
    )
      .then((s) => {
        if (alive) sub = s;
        else s.remove();
      })
      .catch((error: unknown) => console.warn('Could not watch position', error));

    return () => {
      alive = false;
      sub?.remove();
    };
  }, [access, attempt]);

  // With location services off the watch never starts. Try again only when they come
  // back on (checked now and then, and when the app comes to the front) or on the
  // locate button. Closing Google's "Turn on location?" dialog with No thanks also
  // makes the app active, so a plain 'active' retry asked again and again (F3).
  useEffect(() => {
    if (!waiting) return;
    let wasOn: boolean | null = null;
    const check = () =>
      Location.hasServicesEnabledAsync()
        .then((on) => {
          if (on && wasOn === false) setAttempt((n) => n + 1);
          wasOn = on;
        })
        .catch(() => undefined);
    void check();
    const timer = setInterval(check, RETRY_MS);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    const retry = () => setAttempt((n) => n + 1);
    retryListeners.add(retry);
    return () => {
      clearInterval(timer);
      app.remove();
      retryListeners.delete(retry);
    };
  }, [waiting]);

  return here;
}
