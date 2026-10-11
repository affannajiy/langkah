import type { LngLat } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { LocationAccess } from './useLocationPermission';

// The user's position while the Map tab is open, for search distances and the route start.
// Foreground only, kept in memory, never stored or sent anywhere except as a route start.
export function useHere(access: LocationAccess): LngLat | null {
  const [here, setHere] = useState<LngLat | null>(null);

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
  }, [access]);

  return here;
}
