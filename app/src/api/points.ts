import { supabase } from './supabase';

// Langkah Points (guide Section 15; migration 12). The app only reads its own
// wallet and calls the earn functions; the server decides every amount and cap.

export type LedgerReason =
  | 'welcome'
  | 'walk'
  | 'hazard_confirmed'
  | 'improvement_photo'
  | 'vote'
  | 'rating'
  | 'checkin'
  | 'ad'
  | 'topup';

export type LedgerLine = {
  id: number;
  amount: number;
  reason: LedgerReason;
  ref: string | null;
  meta: Record<string, unknown>;
  at: string;
};

export type Wallet = {
  balance: number;
  lines: LedgerLine[];
  checkin: { day: number; today: boolean };
  demo: boolean;
  name: string | null; // demo profile name only
  code: string | null;
};

const TIMEOUT_MS = 10000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);

async function rpc(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await supabase.rpc(name, args).abortSignal(controller.signal);
    if (error) throw new Error(error.message);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function myWallet(): Promise<Wallet> {
  const d = await rpc('my_wallet');
  const w = isObj(d) ? d : {};
  const c = isObj(w.checkin) ? w.checkin : {};
  const lines = Array.isArray(w.lines) ? w.lines : [];
  return {
    balance: num(w.balance),
    lines: lines.filter(isObj).map((l) => ({
      id: num(l.id),
      amount: num(l.amount),
      reason: String(l.reason) as LedgerReason,
      ref: str(l.ref),
      meta: isObj(l.meta) ? l.meta : {},
      at: String(l.at),
    })),
    checkin: { day: num(c.day), today: c.today === true },
    demo: w.demo === true,
    name: str(w.name),
    code: str(w.code),
  };
}

// Once per Malaysian day. Points 0 when already checked in today.
export async function dailyCheckin(): Promise<{ day: number; points: number }> {
  const d = await rpc('daily_checkin');
  const r = isObj(d) ? d : {};
  return { day: num(r.day), points: num(r.points) };
}

// Metres from the phone's GPS track (see walkLocation), seconds, and where to.
export async function walkFinish(distanceM: number, durationS: number, to: string): Promise<{ walk: string | null; points: number }> {
  const d = await rpc('walk_finish', {
    p_distance: Math.round(Math.min(50000, Math.max(0, distanceM))),
    p_duration: Math.round(Math.min(86400, Math.max(0, durationS))),
    p_to: to.slice(0, 80),
  });
  const r = isObj(d) ? d : {};
  return { walk: str(r.walk), points: num(r.points) };
}

export async function isDemoUser(): Promise<boolean> {
  return (await rpc('is_demo_user')) === true;
}

export async function demoStart(): Promise<void> {
  await rpc('demo_start');
}

export async function demoReset(): Promise<void> {
  await rpc('demo_reset');
}
