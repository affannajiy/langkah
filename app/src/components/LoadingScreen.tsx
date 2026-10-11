import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Image, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../theme/theme';
import { AppText } from './AppText';

const SHOW_MS = 1500;

type Props = {
  onLayout: () => void; // native splash hides once this screen is drawn
  onDone: () => void;
};

// JS copy of docs/screens/Splash.png. Runs over the app for about 1.5 s
// while the map loads behind it, then fades away.
export function LoadingScreen({ onLayout, onDone }: Props) {
  const { t } = useTranslation();
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: SHOW_MS, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0, duration: reduce ? 0 : 200, useNativeDriver: true }),
      ]).start(({ finished }) => finished && onDone());
    });
    return () => {
      cancelled = true;
    };
  }, [progress, opacity, onDone]);

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Animated.View style={[styles.root, { opacity }]} onLayout={onLayout} accessibilityLabel={t('brand.name')}>
      <View style={styles.center}>
        <Image
          source={require('../../assets/brand/splash-mark-white-512.png')}
          style={styles.mark}
          accessibilityIgnoresInvertColors
        />
        <AppText style={styles.word} color={colors.white}>
          {t('brand.name')}
        </AppText>
        <AppText variant="heading" style={styles.tagline} color={colors.onNavyAccent}>
          {t('brand.tagline')}
        </AppText>
      </View>
      <View style={styles.footer}>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { width: barWidth }]} />
        </View>
        <AppText variant="caption" color={colors.onNavyAccent}>
          {t('brand.pilot')}
        </AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.navy, zIndex: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  mark: { width: 200, height: 200, marginBottom: -spacing.lg },
  word: { fontSize: 48, lineHeight: 56, fontWeight: '700' },
  tagline: { fontWeight: '400' },
  footer: { alignItems: 'center', gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  track: {
    width: 120,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: '#1F3F66',
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.interactive },
});
