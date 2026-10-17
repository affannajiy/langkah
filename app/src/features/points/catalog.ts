import type { TFunction } from 'i18next';
import { Crown, Footprints, Moon, Sunrise, type LucideIcon } from 'lucide-react-native';

import { colors } from '../../theme/theme';

// How each shop item looks (guide Section 15.2). Prices come from the server's
// shop_items table; names and wording from shop.item.<id> in the translation files.

// Shop item ids come from the server, so the key is built at run time.
export function itemText(t: TFunction, id: string, part: 'name' | 'detail'): string {
  return t(`shop.item.${id}.${part}` as 'shop.item.kopi_kinta.name');
}

export type VoucherLook = { rm: number; soft: string; text: string };
export type FrameLook = { ring: string; width: number; dashed?: boolean; double?: boolean };
export type BadgeLook = { icon: LucideIcon; fill: string; color: string };

export const VOUCHERS: Record<string, VoucherLook> = {
  kopi_kinta: { rm: 2, soft: colors.hazardSoft, text: colors.hazardText },
  roti_pak_mat: { rm: 3, soft: colors.safeSoft, text: colors.safeText },
  tau_fu_fa: { rm: 1, soft: colors.communitySoft, text: colors.communityText },
  kinta_bookstop: { rm: 5, soft: colors.interactiveSoft, text: colors.interactiveText },
};

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
