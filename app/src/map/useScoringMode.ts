import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { ScoringMode } from '../api/types';
import { useSettings } from '../storage/settings';

// Night scoring from 19:30 to 07:00 phone time. Ipoh sunset is about 19:20 all year,
// so this starts just after dark (guide Section 6.1, "Night is different").
const NIGHT_FROM_MIN = 19 * 60 + 30;
const NIGHT_TO_MIN = 7 * 60;
const CHECK_EVERY_MS = 60_000;

export function clockMode(now = new Date()): ScoringMode {
  const min = now.getHours() * 60 + now.getMinutes();
  return min >= NIGHT_FROM_MIN || min < NIGHT_TO_MIN ? 'night' : 'day';
}

// Shared by every screen, so the chip, route scoring and the map style always agree.
// The clock decides until the user taps the chip; their choice then holds until the
// app restarts.
let clock: ScoringMode = clockMode();
let override: ScoringMode | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function tick() {
  const next = clockMode();
  if (next !== clock) {
    clock = next;
    emit();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => `${clock}:${override ?? ''}`;

export function useScoringMode() {
  const { autoNight } = useSettings();
  useSyncExternalStore(subscribe, snapshot);

  useEffect(() => {
    const timer = setInterval(tick, CHECK_EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  // Automatic day and night off (Settings): day, unless the chip says otherwise.
  const mode: ScoringMode = override ?? (autoNight ? clock : 'day');
  const toggle = useCallback(() => {
    override = mode === 'day' ? 'night' : 'day';
    emit();
  }, [mode]);

  return { mode, toggle };
}
