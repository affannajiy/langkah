import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

// Motion tokens and the phone's Reduce Motion setting (guide Section 17). Every
// animation in the app checks reduceMotion() and jumps straight to its end when it is on.

export const motion = {
  fast: 120,
  base: 220,
  slow: 420,
  // Press feedback: buttons and chips shrink a little while held.
  pressScale: 0.96,
  easeOut: Easing.out(Easing.cubic),
} as const;

let reduce = false;
const listeners = new Set<() => void>();
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    reduce = v;
    listeners.forEach((l) => l());
  })
  .catch(() => undefined);
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
  reduce = v;
  listeners.forEach((l) => l());
});

export const reduceMotion = () => reduce;

export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => reduce,
  );
}

// A value that eases from 0 to 1 once, after delayMs. With Reduce Motion it starts at 1.
export function useEnter(delayMs = 0, duration: number = motion.base): Animated.Value {
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    const anim = Animated.timing(v, { toValue: 1, duration, delay: delayMs, easing: motion.easeOut, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [v, delayMs, duration]);
  return v;
}

// Scale for a pressable: call onPressIn/onPressOut from the Pressable, put scale in an Animated.View.
export function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (toValue: number) => {
    if (reduce) return;
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  return { scale, onPressIn: () => to(motion.pressScale), onPressOut: () => to(1) };
}
