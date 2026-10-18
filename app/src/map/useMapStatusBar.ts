import { setStatusBarStyle } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { MAP_LAND } from './useLangkahMapStyle';

// The style the focused screen asked for. The loading screen hands over to it when it
// fades, so a night map opened on first launch keeps light icons (test note N2).
let wanted: 'light' | 'dark' = 'dark';
export const wantedStatusBarStyle = () => wanted;

function apply(style: 'light' | 'dark') {
  wanted = style;
  setStatusBarStyle(style);
}

// Light status bar icons over the night map, dark ones otherwise. Only while the
// screen is focused, so the light Me and Community tabs keep dark icons.
export function useMapStatusBar(land: string) {
  const dark = land !== MAP_LAND.day;
  useFocusEffect(
    useCallback(() => {
      apply(dark ? 'light' : 'dark');
      return () => apply('dark');
    }, [dark]),
  );
}
