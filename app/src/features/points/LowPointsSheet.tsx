import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { formatPoints } from '../../i18n/format';
import { colors, radius, spacing, touchTarget } from '../../theme/theme';

export type LowPoints = { item: string; cost: number; have: number };

type Props = {
  need: LowPoints;
  adsLeft: number;
  checkinDay: number;
  onAd: () => void;
  onTopUp: () => void;
  onClose: () => void;
};

// Not enough points (docs/screens/LowPoints.png): a bottom sheet, not a dialog,
// with the ways to earn and a top-up button. Goes inside a ScrimSheet.
export function LowPointsBody({ need, adsLeft, checkinDay, onAd, onTopUp, onClose }: Props) {
  const { t } = useTranslation();
  const short = Math.max(0, need.cost - need.have);
  const progress = need.cost > 0 ? Math.min(1, need.have / need.cost) : 0;
  const nextDay = (checkinDay % 7) + 1;
  return (
    <>
      <AppText variant="title" color={colors.navy} accessibilityRole="header">
        {t('low.title', { value: formatPoints(short) })}
      </AppText>
      <AppText color={colors.textMuted}>
        {t('low.body', { item: need.item, cost: formatPoints(need.cost), have: formatPoints(need.have) })}
      </AppText>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: need.cost, now: Math.min(need.have, need.cost) }}
      >
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <Way
        title={t('low.ad')}
        body={adsLeft > 0 ? t('low.adLeft', { count: adsLeft }) : t('low.adNone')}
        points="+20"
        onPress={adsLeft > 0 ? onAd : undefined}
      />
      <Way title={t('low.walk')} body={t('low.walkBody')} points={t('low.perKm')} />
      <Way title={t('low.vote')} body={t('low.voteBody')} points="+2" />
      <Way title={t('low.checkin')} body={t('low.checkinBody', { day: nextDay })} points={nextDay === 7 ? '+50' : '+5'} />
      <Pressable accessibilityRole="button" onPress={onTopUp} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <AppText variant="heading" color={colors.white}>
          {t('low.topUp')}
        </AppText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.link}>
        <AppText variant="bodyStrong" color={colors.interactiveText}>
          {t('low.notNow')}
        </AppText>
      </Pressable>
    </>
  );
}

function Way({ title, body, points, onPress }: { title: string; body: string; points: string; onPress?: () => void }) {
  const content = (
    <>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" color={colors.navy}>
          {title}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {body}
        </AppText>
      </View>
      <AppText variant="bodyStrong" color={colors.safeText}>
        {points}
      </AppText>
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.way} accessible>
        {content}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.way, styles.wayTap, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  track: { height: 12, borderRadius: 6, backgroundColor: colors.neutralBadge, overflow: 'hidden' },
  fill: { height: 12, borderRadius: 6, backgroundColor: colors.safe },
  way: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget + spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  wayTap: { borderColor: colors.interactive, borderWidth: 2 },
  primary: { minHeight: touchTarget + spacing.md, borderRadius: radius.pill, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
});
