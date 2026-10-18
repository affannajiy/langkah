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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet } from 'react-native';

import type { Step } from '../../api/types';
import { AppText } from '../../components/AppText';
import { formatDistance } from '../../i18n/format';
import type { WalkView } from '../../nav/useWalk';
import { useCompactHeight } from '../../theme/layout';
import { motion, reduceMotion, useEnter } from '../../theme/motion';
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

// night: a light edge, so the navy card stands out on the navy night map (test note F17).
type Props = { view: WalkView; destName: string; night?: boolean };

// Under this distance the card says "Now" and pulses (with the turn haptic, as before).
const NOW_M = 10;
const COUNT_MS = 900;
const COUNT_FRAME_MS = 50;

// The distance runs down smoothly between GPS fixes instead of stepping (guide Section 17.5).
function useCountdown(target: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(shown);
  from.current = shown;
  useEffect(() => {
    const start = from.current;
    // A new step jumps straight to its distance; only a shrinking distance runs down.
    if (reduceMotion() || target > start || start - target > 200) {
      setShown(target);
      return;
    }
    const began = Date.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - began) / COUNT_MS);
      setShown(start + (target - start) * t);
      if (t >= 1) clearInterval(timer);
    }, COUNT_FRAME_MS);
    return () => clearInterval(timer);
  }, [target]);
  // A jump shows on this render, not one frame late with the old step's number.
  return target > shown || shown - target > 200 ? target : shown;
}

// Each new step slides up and fades in.
function StepIn({ children, style }: { children: ReactNode; style?: object }) {
  const enter = useEnter(0, motion.base);
  const lift = enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return <Animated.View style={[style, { opacity: enter, transform: [{ translateY: lift }] }]}>{children}</Animated.View>;
}

// A gentle pulse on the arrow box at "turn now".
function usePulse(on: boolean): Animated.Value {
  const scale = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    if (!on || reduceMotion()) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.1, duration: 350, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, scale]);
  return scale;
}

// Navy card at the top of the walking screen (docs/screens/Navigation.png).
export function InstructionCard({ view, destName, night = false }: Props) {
  const { t } = useTranslation();
  const compact = useCompactHeight();
  const nextM = useCountdown(view.next?.distM ?? 0);
  const now = !view.arrived && !!view.at && view.joined && !!view.next && view.next.distM < NOW_M;
  const pulse = usePulse(now);
  // The card slides down into place when the walk starts.
  const enter = useEnter(0, motion.slow);
  const drop = enter.interpolate({ inputRange: [0, 1], outputRange: [-32, 0] });
  const slide = { opacity: enter, transform: [{ translateY: drop }] };

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
    big = now ? t('nav.now') : formatDistance(nextM);
    line = stepText(view.next.step, destName, t);
    sub = landmarkText(view.next.step, t);
  } else {
    big = formatDistance(view.remainingM);
    line = t('nav.step.arrive', { name: destName });
  }

  // TalkBack reads the real distance, not the running number.
  const label = [view.next && !now && view.joined && !view.arrived && view.at ? formatDistance(view.next.distM) : big, line, sub]
    .filter(Boolean)
    .join('. ');
  // A new step (or state) swaps the text with a slide.
  const stepKey = view.arrived ? 'arrived' : !view.at ? 'waiting' : !view.joined ? 'join' : view.next ? `s${view.next.step.i}` : 'end';

  // Very short window: one line (arrow, distance, street) so the map keeps its room.
  if (compact) {
    return (
      <Animated.View
        style={[styles.card, styles.cardCompact, night && styles.cardNight, slide]}
        accessible
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        accessibilityLabel={label}
      >
        <Animated.View style={[styles.iconBox, styles.iconBoxCompact, { transform: [{ scale: pulse }] }]}>
          <Icon size={28} color={colors.white} strokeWidth={2.5} />
        </Animated.View>
        <AppText variant="heading" color={colors.white}>
          {big}
        </AppText>
        <AppText variant="bodyStrong" color={colors.white} numberOfLines={1} style={styles.text}>
          {line}
        </AppText>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[styles.card, night && styles.cardNight, slide]}
      accessible
      accessibilityRole="header"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.iconBox, { transform: [{ scale: pulse }] }]}>
        <Icon size={40} color={colors.white} strokeWidth={2.5} />
      </Animated.View>
      <StepIn key={stepKey} style={styles.text}>
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
      </StepIn>
    </Animated.View>
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
  cardCompact: { gap: spacing.sm, padding: spacing.sm },
  cardNight: { borderWidth: 1.5, borderColor: colors.onNavyAccent },
  iconBoxCompact: { width: 48, height: 48 },
});
