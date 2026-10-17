import { useSyncExternalStore } from 'react';

// Whether Langkah Plus is on, from the last wallet the app loaded. Screens without
// a wallet of their own (the star on the route sheet) read it here. The server
// decides what Plus unlocks; this only sizes phone-side limits.

let active = false;
const listeners = new Set<() => void>();

export function setPlusActive(next: boolean) {
  if (next === active) return;
  active = next;
  listeners.forEach((l) => l());
}

export function isPlusActive() {
  return active;
}

export function usePlusActive() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => active,
  );
}
