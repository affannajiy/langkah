import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

export type LocationAccess =
  | 'checking'
  | 'undetermined' // never asked, or can still ask
  | 'granted'
  | 'blocked'; // denied and Android will not ask again; only Settings can fix it

function toAccess(res: Location.LocationPermissionResponse): LocationAccess {
  if (res.granted) return 'granted';
  return res.canAskAgain ? 'undetermined' : 'blocked';
}

// Foreground location only. Background location is asked for at the first walk (Phase 4).
// Also reports whether location is switched on for the whole phone (no GPS state).
export function useLocationPermission() {
  const [access, setAccess] = useState<LocationAccess>('checking');
  const [servicesOn, setServicesOn] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setAccess(toAccess(await Location.getForegroundPermissionsAsync()));
      setServicesOn(await Location.hasServicesEnabledAsync());
    } catch (error) {
      console.warn('Could not read location permission', error);
      setAccess('undetermined');
    }
  }, []);

  // Android's own "Turn on location?" prompt. Resolves once the user answers.
  const turnOnServices = useCallback(async () => {
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      // Declined: the banner stays.
    }
    await refresh();
  }, [refresh]);

  const request = useCallback(async () => {
    try {
      const next = toAccess(await Location.requestForegroundPermissionsAsync());
      setAccess(next);
      return next;
    } catch (error) {
      console.warn('Location permission request failed', error);
      return 'undetermined' as const;
    }
  }, []);

  useEffect(() => {
    refresh();
    // Re-check when the user comes back from the Settings app or the quick settings.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { access, request, servicesOn, turnOnServices };
}
