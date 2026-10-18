import AsyncStorage from '@react-native-async-storage/async-storage';

import { pointsErrorCode, walkFinish } from '../api/points';
import { rateWalk, ReportError } from '../api/reports';

// Finished walks (and their ratings) that could not be sent yet (test notes F4, F11).
// Each walk has an id made on the phone, so a retry never counts it twice. Guests
// send walks too, so this flushes for every signed-in session.

export type QueuedRating = {
  rating: number;
  mode: 'day' | 'night';
  kind: 'safest' | 'fastest';
  score: number;
  distanceM: number;
};

export type QueuedWalk = {
  id: string;
  gpsM: number;
  durationS: number;
  to: string;
  sent: boolean; // the walk is saved; only the rating is left
  rating?: QueuedRating;
  createdAt: string;
};

const KEY = 'langkah.queue.walks.v1';
const MAX_ITEMS = 20;

async function readList(): Promise<QueuedWalk[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as QueuedWalk[]) : [];
  } catch (error) {
    console.warn('Could not read the walk queue', error);
    return [];
  }
}

async function writeList(list: QueuedWalk[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_ITEMS)));
  } catch (error) {
    console.warn('Could not save the walk queue', error);
  }
}

// Adds or updates one walk (by id).
export async function queueWalk(walk: QueuedWalk): Promise<void> {
  const list = (await readList()).filter((w) => w.id !== walk.id);
  await writeList([...list, walk]);
}

export async function dropWalk(id: string): Promise<void> {
  await writeList((await readList()).filter((w) => w.id !== id));
}

// Only a network failure is worth another try; a refusal (too many walks) is final.
const keep = (error: unknown) =>
  error instanceof ReportError ? error.code === 'network' : pointsErrorCode(error) === 'network';

let flushing: Promise<number> | null = null;

// Sends what is waiting. Returns how many walks were saved.
export function flushWalks(): Promise<number> {
  flushing ??= (async () => {
    let saved = 0;
    const list = await readList();
    for (const w of list) {
      let left: QueuedWalk | null = w;
      try {
        if (!w.sent) {
          await walkFinish(w.id, w.gpsM, w.durationS, w.to);
          saved += 1;
          left = { ...w, sent: true };
        }
        if (w.rating) await rateWalk({ ...w.rating, walk: w.id });
        left = null;
      } catch (error) {
        if (!keep(error)) left = null;
      }
      if (left) await queueWalk(left);
      else await dropWalk(w.id);
    }
    return saved;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
