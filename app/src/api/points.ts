import { rememberPartners, type PartnerInfo } from '../points/partners';
import { setPlusActive } from '../points/plus';
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
  | 'topup'
  | 'voucher'
  | 'cosmetic'
  | 'plus'
  | 'report_deleted'
  | 'report_fixed'
  | 'quest';

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
  adsLeft: number;
  topupLeftRm: number; // ringgit still allowed this month (RM500 cap)
  plusUntil: string | null; // set only while Plus is on
  frame: string | null;
  badge: string | null;
};

const TIMEOUT_MS = 10000;

// The server's error word (not_enough, owned, month_cap, sign_in_needed...), or the
// raw message for anything else, such as a network failure.
export class PointsError extends Error {
  code: string;
  constructor(message: string) {
    super(message);
    this.code = message.match(/^[a-z_]+$/) ? message : 'network';
  }
}

export const pointsErrorCode = (e: unknown) => (e instanceof PointsError ? e.code : 'network');

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);

async function rpc(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await supabase.rpc(name, args).abortSignal(controller.signal);
    if (error) throw new PointsError(error.message);
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
  const wallet: Wallet = {
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
    adsLeft: num(w.ads_left),
    topupLeftRm: num(w.topup_left),
    plusUntil: str(w.plus_until),
    frame: str(w.frame),
    badge: str(w.badge),
  };
  setPlusActive(wallet.plusUntil !== null);
  return wallet;
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

// Mock top-up (guide Section 15.5). No bank is contacted; the server picks the points.
export type TopupResult = { points: number; base: number; bonus: number; balance: number; ref: string; at: string };

export async function topupMock(rm: number, pack: boolean, via: string): Promise<TopupResult> {
  const d = await rpc('topup_mock', { p_rm: Math.round(rm), p_pack: pack, p_via: via });
  const r = isObj(d) ? d : {};
  return {
    points: num(r.points),
    base: num(r.base),
    bonus: num(r.bonus),
    balance: num(r.balance),
    ref: str(r.ref) ?? '',
    at: str(r.at) ?? new Date().toISOString(),
  };
}

export type AdBrand = 'gfc' | 'mcg' | 'tealove' | 'zas' | 'secret' | 'newtown';

export async function adFinish(brand: AdBrand): Promise<{ points: number; left: number }> {
  const d = await rpc('ad_finish', { p_brand: brand });
  const r = isObj(d) ? d : {};
  return { points: num(r.points), left: num(r.left) };
}

export async function shopBuy(item: string): Promise<{ id: string; code: string | null; balance: number }> {
  const d = await rpc('shop_buy', { p_item: item });
  const r = isObj(d) ? d : {};
  return { id: String(r.id), code: str(r.code), balance: num(r.balance) };
}

export async function plusBuy(): Promise<{ until: string; balance: number }> {
  const d = await rpc('plus_buy');
  const r = isObj(d) ? d : {};
  return { until: String(r.until), balance: num(r.balance) };
}

export async function cosmeticUse(slot: 'frame' | 'badge', item: string | null): Promise<void> {
  await rpc('cosmetic_use', { p_slot: slot, p_item: item });
}

export type ShopItem = { id: string; kind: 'voucher' | 'frame' | 'badge'; cost: number };
export type OwnedItem = { id: string; item: string; code: string | null; at: string };

function partnerInfo(v: unknown): PartnerInfo | null {
  if (!isObj(v)) return null;
  const name = str(v.name);
  if (!name) return null;
  return { name, en: str(v.en ?? v.offer_en) ?? '', ms: str(v.ms ?? v.offer_ms) ?? '', rm: num(v.rm ?? v.rm_off), address: str(v.addr ?? v.address) ?? '' };
}

// The shop list. Vouchers show only while their partner shop is open (the server
// filters), and bring the shop's name and offer with them.
export async function shopItems(): Promise<ShopItem[]> {
  const { data, error } = await supabase
    .from('shop_items')
    .select('id, kind, cost, partner:partners(name, offer_en, offer_ms, rm_off, address)')
    .order('sort');
  if (error) throw new PointsError(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  const partners: Record<string, PartnerInfo> = {};
  const items: ShopItem[] = [];
  for (const r of rows) {
    const kind = r.kind as ShopItem['kind'];
    const p = partnerInfo(r.partner);
    // A voucher whose shop is closed comes back without its partner: skip it.
    if (kind === 'voucher' && !p) continue;
    if (p) partners[String(r.id)] = p;
    items.push({ id: String(r.id), kind, cost: num(r.cost) });
  }
  rememberPartners(partners);
  return items;
}

export async function myItems(): Promise<OwnedItem[]> {
  const d = await rpc('my_items');
  const rows = Array.isArray(d) ? d.filter(isObj) : [];
  const partners: Record<string, PartnerInfo> = {};
  const items = rows.map((r) => {
    const item = String(r.item);
    const p = partnerInfo(r.p);
    if (p) partners[item] = p;
    return { id: String(r.id), item, code: str(r.code), at: String(r.at) };
  });
  rememberPartners(partners);
  return items;
}

// Sponsored pins that were on screen, or tapped, for the partner report. Counted
// once per shop a day on the server, so a failure here is only logged.
export async function partnerSeen(ids: string[], kind: 'view' | 'tap'): Promise<void> {
  if (ids.length === 0) return;
  await rpc('partner_seen', { p_ids: ids.slice(0, 5), p_kind: kind });
}
