import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LngLat } from '@maplibre/maplibre-react-native';

import type { HazardCategory } from '../api/types';

// Quick reports and Still there / Gone answers wait here, on the phone, until they
// can be sent. Sending needs a signed-in account (RLS, guide Section 7.2), which
// arrives in Phase 5; the queue is flushed then. Nothing here leaves the phone yet.

export type QueuedReport = {
  localId: string;
  kind: 'hazard';
  category: HazardCategory;
  lngLat: LngLat; // rounded to 5 decimals (guide Section 7.4)
  createdAt: string;
};

export type QueuedVote = { reportId: string; vote: 'confirm' | 'gone'; createdAt: string };

const REPORTS = 'langkah.queue.reports.v1';
const VOTES = 'langkah.queue.votes.v1';
const MAX_ITEMS = 50;

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

async function readList<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as T[]) : [];
  } catch (error) {
    console.warn(`Could not read ${key}`, error);
    return [];
  }
}

async function writeList<T>(key: string, list: T[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(list.slice(-MAX_ITEMS)));
    return true;
  } catch (error) {
    console.warn(`Could not save ${key}`, error);
    return false;
  }
}

export async function queueReport(category: HazardCategory, at: LngLat): Promise<boolean> {
  const item: QueuedReport = {
    localId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'hazard',
    category,
    lngLat: [round5(at[0]), round5(at[1])],
    createdAt: new Date().toISOString(),
  };
  return writeList(REPORTS, [...(await readList<QueuedReport>(REPORTS)), item]);
}

// One answer per report: a newer tap replaces the older one.
export async function queueVote(reportId: string, vote: QueuedVote['vote']): Promise<boolean> {
  const list = (await readList<QueuedVote>(VOTES)).filter((v) => v.reportId !== reportId);
  return writeList(VOTES, [...list, { reportId, vote, createdAt: new Date().toISOString() }]);
}

export const readQueuedReports = () => readList<QueuedReport>(REPORTS);
export const readQueuedVotes = () => readList<QueuedVote>(VOTES);
