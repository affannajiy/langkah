import type { LngLat, LngLatBounds } from '@maplibre/maplibre-react-native';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from './supabase';
import type { HazardCategory, ImprovementCategory, ReportKind } from './types';

// Reports, votes and the Community lists (guide Sections 6.3 screens 6 and 7, 7.2).
// Writes go through report_create / report_vote, which run as the user, so RLS
// decides who may write. Reads come from community_reports, which never returns
// user ids, and a name only for reports that are not anonymous.

const TIMEOUT_MS = 15000;
const PHOTO_BUCKET = 'report-photos';
const PHOTO_WIDTH = 1280; // guide Section 7.4
const PHOTO_QUALITY = 0.7;

export type ReportStatus = 'pending' | 'active' | 'expired';
export type Vote = 'confirm' | 'gone' | 'upvote';
export type CommunitySort = 'top' | 'newest' | 'nearest';

export type CommunityReport = {
  id: string;
  kind: ReportKind;
  category: string;
  lngLat: LngLat;
  note: string | null;
  photoUrl: string | null;
  status: ReportStatus;
  createdAt: string;
  expiresAt: string | null;
  by: string | null; // first name, only when not posted anonymously
  confirms: number;
  gone: number;
  upvotes: number;
  mine: boolean;
  myVote: Vote | null;
  street: string | null;
  distM: number | null;
};

// Errors the UI words differently. Anything else counts as "network".
export type ReportErrorCode =
  | 'network'
  | 'not_signed_in'
  | 'not_allowed'
  | 'bad_category'
  | 'outside_ipoh'
  | 'bad_photo'
  | 'too_many_reports'
  | 'photo_failed'
  | 'too_big';

export class ReportError extends Error {
  constructor(readonly code: ReportErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

// The codes raised by the database checks, and RLS refusals.
function toReportError(message: string): ReportError {
  for (const code of ['bad_category', 'outside_ipoh', 'bad_photo', 'too_many_reports'] as const) {
    if (message.includes(code)) return new ReportError(code);
  }
  if (message.includes('row-level security') || message.includes('permission denied')) {
    return new ReportError('not_allowed', message);
  }
  return new ReportError('network', message);
}

async function rpc(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const { data, error } = await supabase.rpc(name, args).abortSignal(controller.signal);
    if (error) throw toReportError(error.message);
    return data;
  } catch (error) {
    if (error instanceof ReportError) throw error;
    throw new ReportError('network', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const n0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const optStr = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);

export function photoUrl(path: string): string {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

function parseReport(v: unknown): CommunityReport | null {
  if (!isObj(v) || typeof v.id !== 'string') return null;
  const kind: ReportKind = v.kind === 'improvement' ? 'improvement' : 'hazard';
  const status: ReportStatus = v.status === 'active' || v.status === 'expired' ? v.status : 'pending';
  const vote = v.myVote === 'confirm' || v.myVote === 'gone' || v.myVote === 'upvote' ? v.myVote : null;
  const photo = optStr(v.photo);
  return {
    id: v.id,
    kind,
    category: typeof v.cat === 'string' ? v.cat : 'other',
    lngLat: [n0(v.lon), n0(v.lat)],
    note: optStr(v.note),
    photoUrl: photo ? photoUrl(photo) : null,
    status,
    createdAt: typeof v.created === 'string' ? v.created : new Date().toISOString(),
    expiresAt: optStr(v.expires),
    by: optStr(v.by),
    confirms: n0(v.confirms),
    gone: n0(v.gone),
    upvotes: n0(v.upvotes),
    mine: v.mine === true,
    myVote: vote,
    street: optStr(v.street),
    distM: v.dist == null ? null : n0(v.dist),
  };
}

function parseItems(data: unknown): CommunityReport[] {
  if (!isObj(data)) throw new ReportError('network', 'bad response');
  if (data.error === 'too_big') throw new ReportError('too_big');
  if (typeof data.error === 'string') throw new ReportError('network', data.error);
  return Array.isArray(data.items) ? data.items.map(parseReport).filter((r): r is CommunityReport => r !== null) : [];
}

export const PAGE_SIZE = 30;

export async function communityReports(
  opts: { kind: ReportKind; sort: CommunitySort; near: LngLat | null; offset?: number; box?: LngLatBounds },
  signal?: AbortSignal,
): Promise<CommunityReport[]> {
  const data = await rpc(
    'community_reports',
    {
      p_kind: opts.kind,
      p_sort: opts.sort,
      p_lon: opts.near ? round5(opts.near[0]) : null,
      p_lat: opts.near ? round5(opts.near[1]) : null,
      p_box: opts.box ? opts.box.map(round5) : null,
      p_offset: opts.offset ?? 0,
      p_limit: PAGE_SIZE,
    },
    signal,
  );
  return parseItems(data);
}

export async function reportDetail(id: string, near: LngLat | null): Promise<CommunityReport | null> {
  const data = await rpc('community_reports', {
    p_id: id,
    p_lon: near ? round5(near[0]) : null,
    p_lat: near ? round5(near[1]) : null,
  });
  return parseItems(data)[0] ?? null;
}

export async function streetAt(at: LngLat, signal?: AbortSignal): Promise<string | null> {
  const data = await rpc('street_at', { p_lon: round5(at[0]), p_lat: round5(at[1]) }, signal);
  return optStr(data);
}

// --- writing --------------------------------------------------------------

export type NewReport = {
  kind: ReportKind;
  category: HazardCategory | ImprovementCategory;
  at: LngLat;
  note?: string | null;
  photoPath?: string | null;
  anonymous?: boolean;
};

export async function createReport(r: NewReport): Promise<string> {
  const id = await rpc('report_create', {
    p_kind: r.kind,
    p_category: r.category,
    p_lon: round5(r.at[0]),
    p_lat: round5(r.at[1]),
    p_note: r.note?.trim().slice(0, 500) || null,
    p_photo: r.photoPath ?? null,
    p_anonymous: r.anonymous ?? true,
  });
  if (typeof id !== 'string') throw new ReportError('network', 'no id');
  return id;
}

// null removes the vote (tap the same button again).
export async function castVote(reportId: string, vote: Vote | null): Promise<void> {
  await rpc('report_vote', { p_id: reportId, p_vote: vote });
}

export async function sendExport(): Promise<unknown[]> {
  const data = await rpc('community_export', {});
  return Array.isArray(data) ? data.filter(isObj) : [];
}

// --- photos ---------------------------------------------------------------

// Random v4-style id for the file name. It only needs to be unique and say nothing
// about the reporter (the bucket is public).
function randomId(): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const variant = '89ab'[Math.floor(Math.random() * 4)];
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

// Resizes to about 1280 px wide at 70% JPEG (Section 7.4). Re-encoding also drops
// EXIF, so the photo carries no GPS or camera details.
export async function preparePhoto(uri: string, width: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (width > PHOTO_WIDTH) context.resize({ width: PHOTO_WIDTH });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
  return result.uri;
}

export async function uploadPhoto(jpegUri: string): Promise<string> {
  const path = `${randomId()}.jpg`;
  try {
    const bytes = await new File(jpegUri).arrayBuffer();
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new ReportError('photo_failed', error.message);
    return path;
  } catch (error) {
    if (error instanceof ReportError) throw error;
    throw new ReportError('photo_failed', error instanceof Error ? error.message : String(error));
  }
}

// --- Me tab and Arrival (migration 10) ------------------------------------

export type MyStats = { reports: number; votes: number; agreed: number };

export async function myReports(offset = 0, signal?: AbortSignal): Promise<CommunityReport[]> {
  return parseItems(await rpc('my_reports', { p_offset: offset, p_limit: PAGE_SIZE }, signal));
}

export async function myStats(signal?: AbortSignal): Promise<MyStats> {
  const data = await rpc('my_stats', {}, signal);
  const d = isObj(data) ? data : {};
  return { reports: n0(d.reports), votes: n0(d.votes), agreed: n0(d.agreed) };
}

// Own report only (RLS). The report goes first: if removing the photo then fails, the
// file is only orphaned, never shown on a report.
export async function deleteReport(r: CommunityReport): Promise<void> {
  const { error, count } = await supabase.from('reports').delete({ count: 'exact' }).eq('id', r.id);
  if (error) throw toReportError(error.message);
  if (count === 0) throw new ReportError('not_allowed');
  const path = r.photoUrl ? r.photoUrl.split('/').pop() : null;
  if (path) {
    const removed = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (removed.error) console.warn('Could not remove report photo', removed.error.message);
  }
}

// Adds a photo to the user's own report. A hazard with a photo needs only one
// confirmation (Section 7.2); the database applies that at once.
export async function setReportPhoto(id: string, photoPath: string): Promise<void> {
  const { error, count } = await supabase.from('reports').update({ photo_path: photoPath }, { count: 'exact' }).eq('id', id);
  if (error) throw toReportError(error.message);
  if (count === 0) throw new ReportError('not_allowed');
}

// "How safe did this walk feel?" (1 to 5). Guests may rate. No place or route is sent.
export async function rateWalk(r: {
  rating: number;
  mode: 'day' | 'night';
  kind: 'safest' | 'fastest';
  score: number;
  distanceM: number;
  walk: string | null; // from walk_finish; +5 points once per walk
}): Promise<number> {
  const points = await rpc('rate_walk', {
    p_rating: r.rating,
    p_mode: r.mode,
    p_kind: r.kind,
    p_score: Math.round(Math.min(100, Math.max(0, r.score))),
    p_distance: Math.round(Math.min(50000, Math.max(0, r.distanceM))),
    p_walk: r.walk,
  });
  return n0(points);
}
