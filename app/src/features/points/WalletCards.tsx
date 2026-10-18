import type { TFunction } from 'i18next';
import { Check, CircleParking, Gift, MonitorPlay, Plus, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { LedgerLine, Wallet } from '../../api/points';
import { AppText } from '../../components/AppText';
import { colors, radius, spacing, touchTarget } from '../../theme/theme';
import { shortDate } from '../../i18n/format';
import { categoryKey } from '../report/categoryIcons';
import { itemText } from './catalog';

const AD_NAMES: Record<string, string> = {
  gfc: 'GFC',
  mcg: "McGuffin's",
  tealove: 'tealove',
  zas: 'ZAS kopi',
  secret: 'Secret Resipi',
  newtown: 'New Town Kopitiam',
};

// The Me tab's wallet (guide Section 15; docs/screens/Wallet.png): points card,
// daily check-in and the last 10 ledger lines.

export function PointsCard({
  wallet,
  onTopUp,
  onAd,
  onShop,
}: {
  wallet: Wallet;
  onTopUp: () => void;
  onAd: () => void;
  onShop: () => void;
}) {
  const { t, i18n } = useTranslation();
  const balance = wallet.balance.toLocaleString(i18n.language === 'ms' ? 'ms-MY' : 'en-MY');
  const rm = (wallet.balance / 100).toFixed(2);
  return (
    <View style={styles.points}>
      <View style={styles.pointsTop}>
        <View style={styles.flex} accessible accessibilityLabel={`${t('points.title')}: ${balance}. ${t('points.worth', { rm })}`}>
          <AppText variant="body" color={colors.onNavyAccent}>
            {t('points.title')}
          </AppText>
          <AppText variant="instruction" color={colors.white} style={styles.balance}>
            {balance}
          </AppText>
          <AppText variant="body" color={colors.onNavyAccent}>
            {t('points.worth', { rm })}
          </AppText>
        </View>
        <CircleParking size={44} color={colors.interactive} />
      </View>
      <View style={styles.actions}>
        <Action icon={Plus} label={t('points.topUp')} primary onPress={onTopUp} />
        {/* After the 5th ad the button says so; a tap still explains with a snackbar. */}
        <Action
          icon={MonitorPlay}
          label={wallet.adsLeft > 0 ? t('points.ad') : t('points.adDone')}
          muted={wallet.adsLeft <= 0}
          onPress={onAd}
        />
        <Action icon={Gift} label={t('points.shop')} onPress={onShop} />
      </View>
    </View>
  );
}

function Action({
  icon: Icon,
  label,
  primary,
  muted,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  primary?: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary ? styles.actionPrimary : styles.actionDark,
        muted && styles.actionMuted,
        pressed && styles.pressed,
      ]}
    >
      <Icon size={26} color={primary ? colors.navy : colors.white} />
      <AppText variant="bodyStrong" color={primary ? colors.navy : colors.white}>
        {label}
      </AppText>
    </Pressable>
  );
}

// Seven chips: past days green, today solid green, later days grey, day 7 amber.
export function CheckinCard({ day }: { day: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <AppText variant="heading" color={colors.text} style={styles.flex}>
          {t('points.checkin')}
        </AppText>
        {day > 0 && (
          <AppText variant="bodyStrong" color={colors.safeText}>
            {t('points.dayOf', { day })}
          </AppText>
        )}
      </View>
      <View style={styles.chips}>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => {
          const last = d === 7;
          const done = d < day;
          const today = d === day;
          return (
            <View
              key={d}
              accessible
              accessibilityLabel={`${t('points.chip', { day: d, points: last ? 50 : 5 })}${done ? `, ${t('points.chipDone')}` : ''}`}
              accessibilityState={{ selected: today }}
              style={[styles.chip, last ? styles.chipLast : done ? styles.chipDone : today ? styles.chipToday : styles.chipLater]}
            >
              {/* Done days get a tick, so the state is not shown by colour alone (F14). */}
              {done ? (
                <Check size={18} color={colors.safeText} strokeWidth={3} />
              ) : (
                <AppText
                  variant={today || last ? 'bodyStrong' : 'body'}
                  color={today ? colors.white : last ? colors.hazardText : colors.textMuted}
                >
                  {last ? '+50' : '+5'}
                </AppText>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function LedgerCard({ lines }: { lines: LedgerLine[] }) {
  const { t } = useTranslation();
  if (lines.length === 0) {
    return (
      <View style={styles.card}>
        <AppText variant="body" color={colors.textMuted}>
          {t('points.empty')}
        </AppText>
      </View>
    );
  }
  return (
    <View style={[styles.card, styles.ledger]}>
      {lines.map((l, i) => {
        const { title, sub } = describe(l, t);
        const sign = l.amount > 0 ? '+' : '';
        return (
          <View key={l.id} style={[styles.line, i < lines.length - 1 && styles.lineDivider]} accessible>
            <View style={styles.flex}>
              <AppText variant="bodyStrong" color={colors.text}>
                {title}
              </AppText>
              {sub && (
                <AppText variant="body" color={colors.textMuted}>
                  {sub}
                </AppText>
              )}
            </View>
            <AppText variant="bodyStrong" color={l.amount > 0 ? colors.safeText : colors.text}>
              {sign}
              {l.amount.toLocaleString('en-MY')}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

type T = TFunction;

const s = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);

// Ledger lines are worded on the phone, so they follow the chosen language.
function describe(l: LedgerLine, t: T): { title: string; sub: string | null } {
  const m = l.meta;
  const cat = s(m.cat);
  const street = s(m.street);
  const place = (kind: 'hazard' | 'improvement') =>
    [cat ? t(categoryKey(kind, cat)) : null, street].filter(Boolean).join(', ') || null;
  switch (l.reason) {
    case 'walk': {
      const km = (Number(m.m) || 0) / 1000;
      const to = s(m.to);
      return { title: t('ledger.walk', { km: km.toFixed(1) }), sub: to ? t('ledger.walkTo', { to }) : null };
    }
    case 'hazard_confirmed': {
      const by = s(m.by);
      return { title: by ? t('ledger.confirmedBy', { name: by }) : t('ledger.confirmed'), sub: place('hazard') };
    }
    case 'improvement_photo':
      return { title: t('ledger.improvementPhoto'), sub: place('improvement') };
    case 'vote':
      return { title: t('ledger.vote'), sub: cat ? t(categoryKey('hazard', cat)) : null };
    case 'rating':
      return { title: t('ledger.rating'), sub: null };
    case 'checkin':
      return { title: t('ledger.checkin', { day: Number(m.day) || 1 }), sub: null };
    case 'ad': {
      const brand = s(m.brand);
      return { title: t('ledger.ad', { count: Number(m.count) || 1 }), sub: brand ? t('ledger.adBrand', { brand: AD_NAMES[brand] ?? brand }) : null };
    }
    case 'topup':
      return {
        title: t('ledger.topup', { via: s(m.via) ?? '' }),
        sub: t('ledger.topupSub', { rm: s(m.rm) ?? '0.00', ref: l.ref ?? '' }),
      };
    case 'welcome':
      return { title: t('ledger.welcome'), sub: null };
    case 'voucher':
    case 'cosmetic': {
      // Vouchers bought since Phase 12 keep the shop name on the line.
      const item = s(m.item);
      return { title: l.reason === 'voucher' ? t('ledger.voucher') : t('ledger.cosmetic'), sub: s(m.name) ?? (item ? itemText(t, item, 'name') : null) };
    }
    case 'report_fixed':
      return { title: t('ledger.reportFixed'), sub: place('improvement') };
    case 'quest':
      return { title: t('ledger.quest'), sub: street };
    case 'report_deleted':
      return { title: t('ledger.reportDeleted'), sub: place(m.kind === 'improvement' ? 'improvement' : 'hazard') };
    case 'plus':
      return { title: t('ledger.plus'), sub: s(m.until) ? t('ledger.plusUntil', { date: shortDate(String(m.until)) }) : null };
    default:
      return { title: t('ledger.other'), sub: null };
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  points: { backgroundColor: colors.navy, borderRadius: radius.card, padding: spacing.lg, gap: spacing.md },
  pointsTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  balance: { fontSize: 48, lineHeight: 56 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flex: 1,
    minHeight: touchTarget + spacing.xl,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  actionPrimary: { backgroundColor: colors.white },
  actionDark: { backgroundColor: colors.navyAction },
  actionMuted: { opacity: 0.6 },
  card: { backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.xs },
  chip: { flex: 1, minHeight: touchTarget, borderRadius: radius.card - 4, alignItems: 'center', justifyContent: 'center' },
  chipDone: { backgroundColor: colors.safeSoft },
  chipToday: { backgroundColor: colors.safe },
  chipLater: { backgroundColor: colors.neutralBadge },
  chipLast: { backgroundColor: colors.hazardSoft },
  ledger: { paddingVertical: spacing.xs, gap: 0 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md },
  lineDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pressed: { opacity: 0.85 },
});
