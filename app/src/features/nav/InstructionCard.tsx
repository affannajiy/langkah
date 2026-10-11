import type { TFunction } from 'i18next';
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Footprints,
  LocateFixed,
  Navigation2,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Step } from '../../api/types';
import { AppText } from '../../components/AppText';
import { formatDistance } from '../../i18n/format';
import type { WalkView } from '../../nav/useWalk';
import { colors, radius, shadow, spacing } from '../../theme/theme';

const ICONS: Record<Step['t'], LucideIcon> = {
  depart: Navigation2,
  left: CornerUpLeft,
  right: CornerUpRight,
  slight_left: ArrowUpLeft,
  slight_right: ArrowUpRight,
  straight: ArrowUp,
  cross: Footprints,
  arrive: Flag,
};

// What to do at a step, worded by street and landmark, never by side of the road
// (GPS is only good to 5 to 10 m).
export function stepText(step: Step, destName: string, t: TFunction): string {
  const street = step.n;
  switch (step.t) {
    case 'cross':
      return t(`nav.step.cross_${step.x ?? 'unmarked'}`);
    case 'arrive':
      return t('nav.step.arrive', { name: destName });
    default:
      return street ? t(`nav.step.${step.t}`, { street }) : t(`nav.step.${step.t}NoName`);
  }
}

function landmarkText(step: Step, t: TFunction): string | null {
  const l = step.l;
  if (!l) return null;
  if (l.k === 'place' || (l.k === 'bus_stop' && l.n)) return l.n ? t('nav.landmark.named', { name: l.n }) : null;
  return t(`nav.landmark.${l.k}`);
}

type Props = { view: WalkView; destName: string };

// Navy card at the top of the walking screen (docs/screens/Navigation.png).
export function InstructionCard({ view, destName }: Props) {
  const { t } = useTranslation();

  let Icon: LucideIcon = LocateFixed;
  let big: string;
  let line: string;
  let sub: string | null = null;

  if (view.arrived) {
    Icon = Flag;
    big = t('nav.arrivedTitle');
    line = destName;
  } else if (!view.at) {
    big = t('nav.waiting');
    line = t('nav.waitingBody');
  } else if (!view.joined) {
    Icon = Navigation2;
    big = formatDistance(view.offM ?? 0);
    line = t('nav.toRoute');
  } else if (view.next) {
    Icon = ICONS[view.next.step.t];
    big = view.next.distM < 10 ? t('nav.now') : formatDistance(view.next.distM);
    line = stepText(view.next.step, destName, t);
    sub = landmarkText(view.next.step, t);
  } else {
    big = formatDistance(view.remainingM);
    line = t('nav.step.arrive', { name: destName });
  }

  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="header"
      accessibilityLiveRegion="polite"
      accessibilityLabel={[big, line, sub].filter(Boolean).join('. ')}
    >
      <View style={styles.iconBox}>
        <Icon size={40} color={colors.white} strokeWidth={2.5} />
      </View>
      <View style={styles.text}>
        <AppText variant="instruction" color={colors.white}>
          {big}
        </AppText>
        <AppText variant="heading" color={colors.white}>
          {line}
        </AppText>
        {sub && (
          <AppText variant="body" color={colors.onNavyAccent}>
            {sub}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.navy,
    borderRadius: radius.sheet,
    padding: spacing.md,
    ...shadow.floating,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: radius.card,
    backgroundColor: colors.navyRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
