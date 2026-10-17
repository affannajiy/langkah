import * as Speech from 'expo-speech';

import i18n from '../i18n';
import { getSettings } from '../storage/settings';

// Spoken guidance during a walk (guide Section 16.2). Haptics come first, then text,
// then this voice, a moment after the pulse. Off by default; the walk screen and
// Settings turn it on. Nothing is spoken outside a walk.

const AFTER_PULSE_MS = 300;
let timer: ReturnType<typeof setTimeout> | null = null;

// urgent: a hazard or arrival cuts off whatever is being said.
export function speak(text: string, urgent = false) {
  if (!getSettings().voice || !text) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (urgent) Speech.stop();
    Speech.speak(text, { language: i18n.language === 'ms' ? 'ms-MY' : 'en-GB', rate: 0.95 });
  }, AFTER_PULSE_MS);
}

export function stopSpeaking() {
  if (timer) clearTimeout(timer);
  timer = null;
  Speech.stop();
}
