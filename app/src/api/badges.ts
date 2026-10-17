import { supabase } from './supabase';

// Badges and the weekly walk streak (guide Section 16.5; migration 22). Worked out on
// the server from what is already stored; they pay no points.

export const BADGE_IDS = [
  'first_walk',
  'km10',
  'km50',
  'first_report',
  'hazards5',
  'checkin7',
  'street_checker',
  'got_fixed',
] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

export type Badge = { id: BadgeId; n: number; goal: number };
export type Badges = { weeks: number; thisWeek: boolean; badges: Badge[] };

const IDS = new Set<string>(BADGE_IDS);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const n0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export async function myBadges(): Promise<Badges> {
  const { data, error } = await supabase.rpc('my_badges');
  if (error) throw new Error(error.message);
  if (!isObj(data) || typeof data.error === 'string') throw new Error('bad_response');
  const list = Array.isArray(data.badges) ? data.badges.filter(isObj) : [];
  return {
    weeks: n0(data.weeks),
    thisWeek: data.thisWeek === true,
    badges: list.flatMap((b) =>
      typeof b.id === 'string' && IDS.has(b.id) ? [{ id: b.id as BadgeId, n: n0(b.n), goal: Math.max(1, n0(b.goal)) }] : [],
    ),
  };
}
