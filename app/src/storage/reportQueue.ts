import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LngLat } from '@maplibre/maplibre-react-native';

import { castVote, createReport, ReportError } from '../api/reports';
import type { HazardCategory } from '../api/types';

// Quick reports and Still there / Gone answers wait here, on the phone, until they
// can be sent: sending needs a Google-signed-in account (RLS, guide Section 7.2) and
// a connection. flushQueue() sends them after sign-in and whenever the app opens.

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

// Screens that show "N waiting" listen here.
const listeners = new Set<(n: number) => void>();
export function subscribeQueue(fn: (n: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
async function notify() {
  const n = await queuedCount();
  listeners.forEach((fn) => fn(n));
}

async function writeList<T>(key: string, list: T[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(list.slice(-MAX_ITEMS)));
    void notify();
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

export async function queuedCount(): Promise<number> {
  const [reports, votes] = await Promise.all([readQueuedReports(), readQueuedVotes()]);
  return reports.length + votes.length;
}

// A network failure keeps the item for next time. A refusal (the report expired,
// it is your own, the place is outside Ipoh) drops it, since retrying cannot help.
const keep = (error: unknown) => !(error instanceof ReportError) || error.code === 'network';

let flushing: Promise<number> | null = null;

// Sends what is waiting. Only call when the user is signed in with Google.
// Returns how many items were sent.
export function flushQueue(): Promise<number> {
  flushing ??= (async () => {
    let sent = 0;
    const reports = await readQueuedReports();
    const leftReports: QueuedReport[] = [];
    for (const r of reports) {
      try {
        await createReport({ kind: 'hazard', category: r.category, at: r.lngLat });
        sent += 1;
      } catch (error) {
        if (keep(error)) leftReports.push(r);
      }
    }
    // Keep anything queued while we were sending.
    const newReports = (await readQueuedReports()).filter((x) => !reports.some((r) => r.localId === x.localId));
    if (reports.length) await writeList(REPORTS, [...leftReports, ...newReports]);

    const votes = await readQueuedVotes();
    const leftVotes: QueuedVote[] = [];
    for (const v of votes) {
      try {
        await castVote(v.reportId, v.vote);
        sent += 1;
      } catch (error) {
        if (keep(error)) leftVotes.push(v);
      }
    }
    const newVotes = (await readQueuedVotes()).filter((x) => !votes.some((v) => v.createdAt === x.createdAt && v.reportId === x.reportId));
    if (votes.length) await writeList(VOTES, [...leftVotes.filter((v) => !newVotes.some((x) => x.reportId === v.reportId)), ...newVotes]);
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
