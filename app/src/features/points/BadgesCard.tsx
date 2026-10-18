import {
  BadgeCheck,
  CalendarCheck,
  Flag,
  Flame,
  Footprints,
  Lock,
  Map as MapIcon,
  Mountain,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { BadgeId, Badges } from '../../api/badges';
import { AppText } from '../../components/AppText';
import { colors, radius, spacing } from '../../theme/theme';

const ICONS: Record<BadgeId, LucideIcon> = {
  first_walk: Footprints,
  km10: Flag,
  km50: Mountain,
  first_report: TriangleAlert,
  hazards5: ShieldCheck,
  checkin7: CalendarCheck,
  street_checker: MapIcon,
  got_fixed: BadgeCheck,
};

// Badges and the weekly streak on the Me tab (guide Section 16.5). An earned badge
// says "Earned" with a tick; one still to earn shows a lock and its progress, so the
// state never rests on colour alone.
export function BadgesCard({ data }: { data: Badges }) {
  const { t } = useTranslation();
  const earned = data.badges.filter((b) => b.n >= b.goal).length;

  return (
    <View style={styles.card}>
      <View style={styles.streak} accessible accessibilityLabel={streakText()}>
        <View style={[styles.flame, data.weeks > 0 && styles.flameOn]}>
          <Flame size={24} color={data.weeks > 0 ? colors.hazardText : colors.textMuted} />
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong" color={colors.navy}>
            {data.weeks > 0 ? t('badges.weeks', { count: data.weeks }) : t('badges.noWeeks')}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {data.weeks > 0 && !data.thisWeek ? t('badges.keepGoing') : t('badges.streakNote')}
          </AppText>
        </View>
      </View>

      <AppText variant="label" color={colors.textMuted}>
        {t('badges.count', { count: earned, total: data.badges.length })}
      </AppText>
      <View style={styles.grid}>
        {data.badges.map((b) => {
          const done = b.n >= b.goal;
          const Icon = ICONS[b.id];
          // A one-step badge says what is left, not "0 of 1" (test note F14).
          const progress = b.id.startsWith('km')
            ? t('badges.km', { n: (b.n / 1000).toFixed(1), goal: b.goal / 1000 })
            : b.goal === 1
              ? t(`badges.left.${b.id}`, { defaultValue: t('badges.notYet') })
              : t('badges.progress', { n: b.n, goal: b.goal });
          return (
            <View
              key={b.id}
              style={[styles.badge, done && styles.badgeOn]}
              accessible
              accessibilityLabel={`${t(`badges.name.${b.id}`)}. ${t(`badges.how.${b.id}`)}. ${done ? t('badges.earned') : progress}`}
            >
              <View style={[styles.icon, done && styles.iconOn]}>
                <Icon size={22} color={done ? colors.white : colors.textMuted} />
              </View>
              <AppText variant="label" color={colors.text} style={styles.center} numberOfLines={2}>
                {t(`badges.name.${b.id}`)}
              </AppText>
              <View style={styles.state}>
                {done ? <BadgeCheck size={14} color={colors.safeText} /> : <Lock size={14} color={colors.textMuted} />}
                <AppText variant="caption" color={done ? colors.safeText : colors.textMuted}>
                  {done ? t('badges.earned') : progress}
                </AppText>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );

  function streakText() {
    return data.weeks > 0 ? t('badges.weeks', { count: data.weeks }) : t('badges.noWeeks');
  }
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  streak: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flame: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  flameOn: { backgroundColor: colors.hazardSoft },
  flex: { flex: 1, gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeOn: { borderColor: colors.safe, backgroundColor: colors.safeSoft },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  iconOn: { backgroundColor: colors.safeText },
  center: { textAlign: 'center' },
  state: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
