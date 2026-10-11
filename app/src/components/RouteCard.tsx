import { Shield } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Route } from '../api/types';
import { formatDistance, minutes } from '../i18n/format';
import { routeReasons } from '../route/reasons';
import { colors, radius, spacing } from '../theme/theme';
import { AppText } from './AppText';
import { ReasonChip } from './ReasonChip';
import { ScoreRing } from './ScoreRing';

type Props = {
  kind: 'safest' | 'fastest';
  route: Route;
  selected: boolean;
  // Both routes are the same path: one card says so.
  both?: boolean;
  onPress: () => void;
};

// Safest or Fastest route card (guide Section 6.3, screen 3; Section 6.5 RouteCard).
// Selection shows by border weight and tint, and is announced, not shown by colour alone.
export function RouteCard({ kind, route, selected, both, onPress }: Props) {
  const { t } = useTranslation();
  const safest = kind === 'safest';
  const reasons = routeReasons(route.stats, kind, t);
  const min = minutes(route.timeS);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityHint={t('route.cardHint')}
      onPress={onPress}
      style={[styles.card, selected ? (safest ? styles.selectedSafe : styles.selectedFast) : styles.idle]}
    >
      <View style={styles.top}>
        <View style={styles.main}>
          <View style={[styles.badge, safest ? styles.badgeSafe : styles.badgeFast]}>
            {safest ? <Shield size={18} color={colors.safeText} /> : <DashIcon />}
            <AppText variant="label" color={safest ? colors.safeText : colors.navy}>
              {both ? t('route.bothTag', { count: min }) : safest ? t('route.safest') : t('route.fastest')}
            </AppText>
          </View>
          <View style={styles.numbers}>
            <AppText variant="title" color={colors.text}>
              {t('units.min', { count: min })}
            </AppText>
            <AppText color={colors.textMuted} style={styles.meta}>
              {safest
                ? t('route.meta', { distance: formatDistance(route.distM) })
                : t('route.metaScore', { distance: formatDistance(route.distM), score: route.score })}
            </AppText>
          </View>
        </View>
        {safest && <ScoreRing score={route.score} />}
      </View>
      {reasons.length > 0 && (
        <View style={styles.chips}>
          {reasons.map((r) => (
            <ReasonChip key={r.label} label={r.label} tone={r.tone} />
          ))}
        </View>
      )}
    </Pressable>
  );
}

// Two short dashes, matching the dashed fastest line on the map.
function DashIcon() {
  return (
    <View style={styles.dash} importantForAccessibility="no">
      <View style={styles.dashBit} />
      <View style={styles.dashBit} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + spacing.xs, gap: spacing.sm },
  idle: { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  selectedSafe: { borderWidth: 3, borderColor: colors.safe, backgroundColor: colors.safeSoft },
  selectedFast: { borderWidth: 3, borderColor: colors.routeFastest, backgroundColor: colors.surface },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  main: { flex: 1, gap: spacing.xs },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  badgeSafe: { backgroundColor: colors.safeBadge },
  badgeFast: { backgroundColor: colors.neutralBadge },
  numbers: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  meta: { marginStart: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dash: { flexDirection: 'row', gap: 3 },
  dashBit: { width: 7, height: 3, borderRadius: 1, backgroundColor: colors.navy },
});
