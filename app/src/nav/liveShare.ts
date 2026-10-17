import type { LngLat } from '@maplibre/maplibre-react-native';
import { useSyncExternalStore } from 'react';

import { shareStart, shareStop, shareUpdate } from '../api/share';
import { SHARE_PAGE_URL } from '../map/config';
import { encodePolyline } from '../map/polyline';
import { metres } from './geo';
import { subscribeFixes, type Fix } from './walkLocation';

// The live share of the current walk (guide Section 16.1). It listens to the same
// fixes as the walk, so it keeps going with the screen off, and sends the latest
// position at most every 15 s. Only that point leaves the phone, never a track.

export type LiveShare = { status: 'off' } | { status: 'starting' } | { status: 'live'; url: string };

const MIN_GAP_MS = 15000; // never more often than this
const IDLE_GAP_MS = 60000; // standing still: one update a minute keeps "last seen" fresh
const MOVED_M = 20;
const MAX_ACCURACY_M = 40;

let state: LiveShare = { status: 'off' };
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;
let lastSent: { at: LngLat; time: number } | null = null;
let sending = false;
let etaS = 0;
let pendingRoute: string | null = null;

function set(next: LiveShare) {
  state = next;
  listeners.forEach((fn) => fn());
}

export function getLiveShare(): LiveShare {
  return state;
}

export function useLiveShare(): LiveShare {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getLiveShare,
  );
}

// The walk screen keeps these fresh; they ride along with the next position.
export function setShareEta(seconds: number) {
  etaS = seconds;
}

export function setShareRoute(points: LngLat[]) {
  if (state.status !== 'live') return;
  pendingRoute = encodePolyline(points);
  lastSent = null; // send the new line with the next fix
}

function onFix(fix: Fix) {
  if (state.status !== 'live' || sending) return;
  if (fix.accuracy !== null && fix.accuracy > MAX_ACCURACY_M) return;
  const now = Date.now();
  if (lastSent) {
    const gap = now - lastSent.time;
    if (gap < MIN_GAP_MS) return;
    if (gap < IDLE_GAP_MS && metres(lastSent.at, fix.lngLat) < MOVED_M) return;
  }
  sending = true;
  const route = pendingRoute;
  pendingRoute = null;
  lastSent = { at: fix.lngLat, time: now };
  shareUpdate(fix.lngLat, etaS, route)
    .then((ok) => {
      // The server ended it (2 h limit): stop sending.
      if (!ok) stopListening();
    })
    .catch(() => {
      // No signal: try again with a later fix, and keep the new line for it.
      if (route && !pendingRoute) pendingRoute = route;
      lastSent = null;
    })
    .finally(() => {
      sending = false;
    });
}

function stopListening() {
  unsubscribe?.();
  unsubscribe = null;
  lastSent = null;
  pendingRoute = null;
  set({ status: 'off' });
}

// Returns the link to send. Throws when the server could not start the share.
export async function startLiveShare(args: {
  destName: string;
  dest: LngLat;
  route: LngLat[];
  at: LngLat | null;
  etaS: number;
}): Promise<string> {
  if (state.status === 'live') return state.url;
  set({ status: 'starting' });
  try {
    etaS = args.etaS;
    const token = await shareStart({ ...args, route: encodePolyline(args.route) });
    // The walk ended while the link was being made: end the share too.
    if (state.status !== 'starting') {
      shareStop(false).catch(() => undefined);
      throw new Error('walk_ended');
    }
    const url = `${SHARE_PAGE_URL}?t=${token}`;
    lastSent = args.at ? { at: args.at, time: Date.now() } : null;
    unsubscribe?.();
    unsubscribe = subscribeFixes(onFix);
    set({ status: 'live', url });
    return url;
  } catch (error) {
    if (state.status === 'starting') set({ status: 'off' });
    throw error;
  }
}

// Arrived or ended: the server wipes the position now. If this fails (no signal),
// the server still deletes the share 2 hours after it started.
export function stopLiveShare(arrived: boolean) {
  if (state.status === 'off') return;
  const wasLive = state.status === 'live';
  stopListening();
  // Still starting: startLiveShare ends it once the link comes back.
  if (!wasLive) return;
  shareStop(arrived).catch((error: unknown) => console.warn('Could not stop the live share', error));
}
