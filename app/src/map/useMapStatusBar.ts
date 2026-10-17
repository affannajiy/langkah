import { setStatusBarStyle } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { MAP_LAND } from './useLangkahMapStyle';

// Light status bar icons over the night map, dark ones otherwise. Only while the
// screen is focused, so the light Me and Community tabs keep dark icons.
export function useMapStatusBar(land: string) {
  const dark = land !== MAP_LAND.day;
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(dark ? 'light' : 'dark');
      return () => setStatusBarStyle('dark');
    }, [dark]),
  );
}
