import { useEffect } from 'react';

// "Points arrived" notices from places with no snackbar of their own (the daily
// check-in runs in AuthProvider; the ad, top-up and shop screens close before the
// result shows). The root layout shows them; the Me tab reloads.

export type PointsNotice = { kind: 'checkin'; points: number; day: number } | { kind: 'text'; text: string };

const listeners = new Set<(n: PointsNotice) => void>();

export function notifyPoints(notice: PointsNotice) {
  listeners.forEach((l) => l(notice));
}

export function usePointsNotice(fn: (n: PointsNotice) => void) {
  useEffect(() => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, [fn]);
}
