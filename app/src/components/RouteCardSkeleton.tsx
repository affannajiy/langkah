import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { reduceMotion } from '../theme/motion';
import { colors, radius, spacing } from '../theme/theme';

// Grey stand-in with the same size as a RouteCard, shown while routes load, so the
// sheet does not jump when the real cards land (guide Section 17.1).
export function RouteCardSkeleton({ ring }: { ring?: boolean }) {
  const pulse = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    if (reduceMotion()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.card, { opacity: pulse }]} importantForAccessibility="no-hide-descendants">
      <View style={styles.top}>
        <View style={styles.main}>
          <View style={[styles.block, styles.badge]} />
          <View style={[styles.block, styles.title]} />
        </View>
        {ring && <View style={styles.ring} />}
      </View>
      <View style={styles.chips}>
        <View style={[styles.block, styles.chip]} />
        <View style={[styles.block, styles.chip]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    gap: spacing.sm,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  main: { flex: 1, gap: spacing.sm },
  block: { backgroundColor: colors.neutralBadge, borderRadius: radius.pill },
  // Badge (28) and the time line (32), as on the real card.
  badge: { width: 96, height: 28 },
  title: { width: '70%', height: 28, borderRadius: radius.card / 2 },
  ring: { width: 60, height: 60, borderRadius: 30, borderWidth: 7, borderColor: colors.neutralBadge },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: { width: 120, height: 32 },
});
