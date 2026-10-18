import type { LngLat, LngLatBounds } from '@maplibre/maplibre-react-native';

import { decodePolyline } from '../map/polyline';
import { supabase } from './supabase';
import {
  MAP_AMENITY_KINDS,
  type MapAmenityKind,
  type MapView,
  type Place,
  type Route,
  type RouteError,
  type RouteOptions,
  type RoutePair,
  type RouteStats,
  type ScoringMode,
  type Step,
  type StreetQuest,
} from './types';

// The app's only door to the Langkah functions (search_places, route_safe, map_in_view).
// Every call has a timeout, and every response is checked before the UI trusts it.

const TIMEOUT_MS = 12000;

export class ApiError extends Error {
  constructor(
    readonly code: RouteError | 'network' | 'bad_response' | 'too_big',
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

type RpcName = 'search_places' | 'route_safe' | 'map_in_view';

async function rpc(name: RpcName, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const { data, error } = await supabase.rpc(name, args).abortSignal(controller.signal);
    if (error) throw new ApiError('network', error.message);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('network', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// --- small checks for untrusted JSON ------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new ApiError('bad_response', 'expected a number');
  return n;
};
const str = (v: unknown): string => {
  if (typeof v !== 'string') throw new ApiError('bad_response', 'expected a string');
  return v;
};
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

// --- search -------------------------------------------------------------

export async function searchPlaces(query: string, near: LngLat | null, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const data = await rpc(
    'search_places',
    { q, near_lon: near ? round5(near[0]) : null, near_lat: near ? round5(near[1]) : null },
    signal,
  );
  if (!Array.isArray(data)) throw new ApiError('bad_response', 'search');
  return data.filter(isObj).map((row) => ({
    name: str(row.name),
    area: optStr(row.area) ?? null,
    category: optStr(row.category) ?? null,
    lngLat: [num(row.lon), num(row.lat)] as LngLat,
    distM: row.dist_m == null ? null : num(row.dist_m),
  }));
}

// --- routing ------------------------------------------------------------

const STEP_TYPES = new Set(['depart', 'left', 'right', 'slight_left', 'slight_right', 'straight', 'cross', 'arrive']);
const ROUTE_ERRORS = new Set([
  'bad_mode',
  'bad_point',
  'too_far',
  'too_close',
  'start_off_network',
  'end_off_network',
  'no_route',
  'no_step_free',
  'rate_limited',
]);

function parseStats(v: unknown): RouteStats {
  if (!isObj(v)) throw new ApiError('bad_response', 'stats');
  return {
    sw: num(v.sw),
    lit: num(v.lit),
    unk: num(v.unk),
    nosw: num(v.nosw),
    am: typeof v.am === 'number' ? v.am : 0,
    mx: num(v.mx),
    ux: num(v.ux),
    hz: num(v.hz),
    // Older servers send no cov: read as 0.
    cov: v.cov == null ? 0 : num(v.cov),
    kx: v.kx == null ? null : num(v.kx),
  };
}

function parseStep(v: unknown): Step | null {
  if (!isObj(v) || !STEP_TYPES.has(v.t as string)) return null;
  const step: Step = { t: v.t as Step['t'], i: num(v.i) };
  const n = optStr(v.n);
  if (n) step.n = n;
  if (v.d != null) step.d = num(v.d);
  if (v.x === 'marked' || v.x === 'signals' || v.x === 'unmarked') step.x = v.x;
  if (isObj(v.l) && typeof v.l.k === 'string') step.l = { k: v.l.k as NonNullable<Step['l']>['k'], n: optStr(v.l.n) };
  return step;
}

function parseRoute(v: unknown): Route {
  if (!isObj(v)) throw new ApiError('bad_response', 'route');
  const points = decodePolyline(str(v.poly));
  if (points.length < 2) throw new ApiError('bad_response', 'route has no line');
  const last = points.length - 1;
  const unchecked = Array.isArray(v.u)
    ? v.u
        .filter((r): r is unknown[] => Array.isArray(r) && r.length === 2)
        .map(([a, b]) => [Math.max(0, num(a)), Math.min(last, num(b))] as [number, number])
        .filter(([a, b]) => b > a)
    : [];
  return {
    points,
    distM: num(v.dist),
    timeS: num(v.time),
    score: Math.max(0, Math.min(100, num(v.score))),
    stats: parseStats(v.stats),
    steps: Array.isArray(v.steps) ? v.steps.map(parseStep).filter((s): s is Step => s !== null) : [],
    unchecked,
    covered: polylines(v.cv),
    quests: quests(v.q),
  };
}

// Street questions; anything malformed is skipped. Older servers send none.
function quests(v: unknown): StreetQuest[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).flatMap((q) =>
    Array.isArray(q.w) &&
    q.w.length > 0 &&
    q.w.every((w) => typeof w === 'number') &&
    typeof q.n === 'string' &&
    (q.a === 'sidewalk' || q.a === 'lit' || q.a === 'covered')
      ? [{ ways: (q.w as number[]).slice(0, 10), name: q.n, attr: q.a }]
      : [],
  );
}

// A list of encoded polylines; anything broken is skipped.
function polylines(v: unknown): LngLat[][] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p): p is string => typeof p === 'string')
    .map((p) => decodePolyline(p))
    .filter((pts) => pts.length >= 2);
}

export const NO_OPTIONS: RouteOptions = { cover: false, stepFree: false };

export async function routeSafe(
  from: LngLat,
  to: LngLat,
  mode: ScoringMode,
  options: RouteOptions = NO_OPTIONS,
  signal?: AbortSignal,
): Promise<RoutePair> {
  const data = await rpc(
    'route_safe',
    {
      start_lon: round5(from[0]),
      start_lat: round5(from[1]),
      end_lon: round5(to[0]),
      end_lat: round5(to[1]),
      mode,
      p_cover: options.cover,
      p_step_free: options.stepFree,
    },
    signal,
  );
  if (!isObj(data)) throw new ApiError('bad_response', 'route_safe');
  if (typeof data.error === 'string') {
    throw new ApiError(ROUTE_ERRORS.has(data.error) ? (data.error as RouteError) : 'no_route', data.error);
  }
  return {
    mode: data.mode === 'night' ? 'night' : 'day',
    same: data.same === true,
    options: { cover: data.cover === true, stepFree: data.stepFree === true },
    safest: parseRoute(data.safest),
    fastest: parseRoute(data.fastest),
  };
}

// --- map view -----------------------------------------------------------

const AMENITY_KINDS = new Set<string>(MAP_AMENITY_KINDS);

export async function mapInView(bounds: LngLatBounds, zoom: number, signal?: AbortSignal): Promise<MapView> {
  const [west, south, east, north] = bounds;
  const data = await rpc(
    'map_in_view',
    { min_lon: round5(west), min_lat: round5(south), max_lon: round5(east), max_lat: round5(north) },
    signal,
  );
  if (!isObj(data)) throw new ApiError('bad_response', 'map_in_view');
  if (data.error === 'too_big') throw new ApiError('too_big');
  if (typeof data.error === 'string') throw new ApiError('bad_response', data.error);
  const rows = (v: unknown) => (Array.isArray(v) ? v.filter(Array.isArray) : []);
  const counts = isObj(data.n) ? data.n : {};
  return {
    hazards: rows(data.hz).map((r) => ({ id: str(r[0]), lngLat: [num(r[1]), num(r[2])] as LngLat, category: str(r[3]) })),
    amenities: rows(data.am)
      .filter((r) => AMENITY_KINDS.has(r[0] as string))
      .map((r) => ({ kind: r[0] as MapAmenityKind, lngLat: [num(r[1]), num(r[2])] as LngLat })),
    covered: polylines(data.cv),
    zoom,
    sponsored: rows(data.sp)
      .slice(0, 3)
      .map((r) => ({
        id: str(r[0]),
        lngLat: [num(r[1]), num(r[2])] as LngLat,
        name: str(r[3]),
        offer: { en: str(r[4]), ms: str(r[5]) },
        rm: num(r[6]),
        item: str(r[7]),
        cost: num(r[8]),
        address: str(r[9]),
      })),
    counts: { hazards: num(counts.hz ?? 0), improvements: num(counts.im ?? 0) },
  };
}
