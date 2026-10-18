import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

// Where the phone faces, from expo-location's compass (guide Section 17.4). Null until a
// reading arrives, and on phones or emulators without one. Small wobbles are ignored.
const MIN_CHANGE_DEG = 4;

export function useCompass(enabled: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let sub: Location.LocationSubscription | null = null;
    let last: number | null = null;
    Location.watchHeadingAsync((h) => {
      const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      if (!alive || deg < 0 || h.accuracy === 0) return;
      if (last !== null && Math.abs(((deg - last + 540) % 360) - 180) < MIN_CHANGE_DEG) return;
      last = deg;
      setHeading(deg);
    })
      .then((s) => {
        if (alive) sub = s;
        else s.remove();
      })
      .catch((error) => console.warn('Compass unavailable', error));
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [enabled]);
  return heading;
}
