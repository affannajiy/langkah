import { Vibration } from 'react-native';

// Haptics first, then text (CLAUDE.md UX rules). Android patterns are
// [wait, buzz, wait, buzz, ...] in milliseconds.
export const haptics = {
  // One short pulse for a turn.
  turn: () => Vibration.vibrate(150),
  // Two pulses for a hazard ahead.
  hazard: () => Vibration.vibrate([0, 150, 120, 150]),
  // One long pulse on arrival.
  arrive: () => Vibration.vibrate(700),
};
