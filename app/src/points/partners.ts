import AsyncStorage from '@react-native-async-storage/async-storage';

import i18n from '../i18n';

// Partner shops the app has seen, by voucher id (guide Section 15.6). Shop names and
// offers come from the server, so a new partner needs no app update. Kept on the
// phone so a ledger line or an old voucher still reads right offline or after the
// partner has closed.

export type PartnerInfo = { name: string; en: string; ms: string; rm: number; address: string };

const STORE = 'langkah.partners.v1';
let known: Record<string, PartnerInfo> = {};

AsyncStorage.getItem(STORE)
  .then((raw) => {
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) known = { ...(parsed as Record<string, PartnerInfo>), ...known };
  })
  .catch(() => {});

export function rememberPartners(list: Record<string, PartnerInfo>) {
  if (Object.keys(list).length === 0) return;
  known = { ...known, ...list };
  AsyncStorage.setItem(STORE, JSON.stringify(known)).catch(() => {});
}

export function partnerOf(item: string): PartnerInfo | null {
  return known[item] ?? null;
}

// The offer in the app's language.
export function offerText(p: { en: string; ms: string }): string {
  return i18n.language === 'ms' ? p.ms : p.en;
}
