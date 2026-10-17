import type { TFunction } from 'i18next';
import { Crown, Footprints, Moon, Sunrise, type LucideIcon } from 'lucide-react-native';

import { offerText, partnerOf } from '../../points/partners';
import { colors } from '../../theme/theme';

// How each shop item looks (guide Sections 15.2 and 15.6). Prices come from the
// server's shop_items table. A voucher's shop name and offer come from its partner
// (server data); cosmetic names from shop.item.<id> in the translation files.

export function itemText(t: TFunction, id: string, part: 'name' | 'detail'): string {
  const p = partnerOf(id);
  if (p) return part === 'name' ? p.name : offerText(p);
  // Cosmetic ids come from the server, so the key is built at run time.
  return t(`shop.item.${id}.${part}` as 'shop.item.frame_teal.name', { defaultValue: part === 'name' ? t('shop.voucher') : '' });
}

export type VoucherLook = { rm: number; soft: string; text: string };
export type FrameLook = { ring: string; width: number; dashed?: boolean; double?: boolean };
export type BadgeLook = { icon: LucideIcon; fill: string; color: string };

// Voucher stub colours, picked from the id so a shop keeps its colour everywhere.
const VOUCHER_TINTS = [
  { soft: colors.hazardSoft, text: colors.hazardText },
  { soft: colors.safeSoft, text: colors.safeText },
  { soft: colors.communitySoft, text: colors.communityText },
  { soft: colors.interactiveSoft, text: colors.interactiveText },
];

export function voucherLook(id: string): VoucherLook {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return { rm: partnerOf(id)?.rm ?? 0, ...VOUCHER_TINTS[h % VOUCHER_TINTS.length]! };
}

export const PLUS_GOLD = '#C99A1E';

export const FRAMES: Record<string, FrameLook> = {
  frame_teal: { ring: colors.safe, width: 4 },
  frame_batik: { ring: colors.community, width: 4, dashed: true },
  frame_limestone: { ring: '#7C8794', width: 3, double: true },
  plus_frame: { ring: PLUS_GOLD, width: 5 },
};

export const BADGES: Record<string, BadgeLook> = {
  badge_early: { icon: Sunrise, fill: colors.hazardSoft, color: colors.hazardText },
  badge_night: { icon: Moon, fill: colors.interactiveSoft, color: colors.navy },
  badge_kinta: { icon: Footprints, fill: colors.safeSoft, color: colors.safeText },
  plus_badge: { icon: Crown, fill: '#FBEFC8', color: '#7A5A00' },
};
