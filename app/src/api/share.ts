import type { LngLat } from '@maplibre/maplibre-react-native';

import { supabase } from './supabase';

// Live walk share (guide Section 16.1; migration 18). Opt-in: nothing is sent until
// the walker taps Share. The server keeps only the latest position and wipes it when
// the walk ends.

const TIMEOUT_MS = 10000;
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await supabase.rpc(name, args).abortSignal(controller.signal);
    if (error) throw new Error(error.message);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('bad_response');
    const body = data as Record<string, unknown>;
    if (typeof body.error === 'string') throw new Error(body.error);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function shareStart(args: {
  destName: string;
  dest: LngLat;
  route: string; // encoded polyline
  at: LngLat | null;
  etaS: number;
}): Promise<string> {
  const body = await call('share_start', {
    p_dest_name: args.destName,
    p_dest_lon: round5(args.dest[0]),
    p_dest_lat: round5(args.dest[1]),
    p_route: args.route,
    p_lon: args.at ? round5(args.at[0]) : null,
    p_lat: args.at ? round5(args.at[1]) : null,
    p_eta_s: Math.round(args.etaS),
  });
  if (typeof body.token !== 'string' || !/^[0-9a-f]{32}$/.test(body.token)) throw new Error('bad_response');
  return body.token;
}

export async function shareUpdate(at: LngLat, etaS: number, route: string | null): Promise<boolean> {
  const body = await call('share_update', {
    p_lon: round5(at[0]),
    p_lat: round5(at[1]),
    p_eta_s: Math.round(etaS),
    p_route: route,
  });
  return body.ok === true;
}

export async function shareStop(arrived: boolean): Promise<void> {
  await call('share_stop', { p_arrived: arrived });
}
