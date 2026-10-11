import { Vibration } from 'react-native';

import { getSettings } from '../storage/settings';

// Haptics first, then text (CLAUDE.md UX rules). Android patterns are
// [wait, buzz, wait, buzz, ...] in milliseconds. Settings can turn them off;
// the banners and cards still show.
function buzz(pattern: number | number[]) {
  if (getSettings().vibration) Vibration.vibrate(pattern);
}

export const haptics = {
  // One short pulse for a turn.
  turn: () => buzz(150),
  // Two pulses for a hazard ahead.
  hazard: () => buzz([0, 150, 120, 150]),
  // One long pulse on arrival.
  arrive: () => buzz(700),
};
