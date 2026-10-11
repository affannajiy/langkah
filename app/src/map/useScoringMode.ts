import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { ScoringMode } from '../api/types';

// Night scoring from 19:30 to 07:00 phone time. Ipoh sunset is about 19:20 all year,
// so this starts just after dark (guide Section 6.1, "Night is different").
const NIGHT_FROM_MIN = 19 * 60 + 30;
const NIGHT_TO_MIN = 7 * 60;
const CHECK_EVERY_MS = 60_000;

export function clockMode(now = new Date()): ScoringMode {
  const min = now.getHours() * 60 + now.getMinutes();
  return min >= NIGHT_FROM_MIN || min < NIGHT_TO_MIN ? 'night' : 'day';
}

// Follows the clock until the user taps the chip; their choice then holds for this session.
export function useScoringMode() {
  const [auto, setAuto] = useState<ScoringMode>(clockMode);
  const [override, setOverride] = useState<ScoringMode | null>(null);

  useEffect(() => {
    const tick = () => setAuto(clockMode());
    const timer = setInterval(tick, CHECK_EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  const mode = override ?? auto;
  const toggle = useCallback(() => setOverride(mode === 'day' ? 'night' : 'day'), [mode]);

  return { mode, toggle };
}
