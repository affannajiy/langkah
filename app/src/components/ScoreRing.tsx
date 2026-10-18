import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { motion, reduceMotion } from '../theme/motion';
import { colors, fontFamily } from '../theme/theme';
import { AppText } from './AppText';

type Props = { score: number; size?: number };

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// 0 to 100 safety score as a ring, with the number inside (guide Section 6.3, screen 3).
// The ring fills up to the score when it appears or the score changes (Section 17.3).
export function ScoreRing({ score, size = 60 }: Props) {
  const { t } = useTranslation();
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(100, score)) / 100;
  const fill = useState(() => new Animated.Value(reduceMotion() ? target : 0))[0];

  useEffect(() => {
    if (reduceMotion()) {
      fill.setValue(target);
      return;
    }
    const anim = Animated.timing(fill, { toValue: target, duration: motion.slow * 2, easing: motion.easeOut, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [fill, target]);

  const offset = fill.interpolate({ inputRange: [0, 1], outputRange: [c, 0] });

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('route.scoreA11y', { score })}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.safeSoft} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.safe}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          // Start at 12 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.center}>
          <AppText style={styles.number} color={colors.safeText}>
            {score}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  number: { fontFamily, fontSize: 20, lineHeight: 26, fontWeight: '700' },
});
