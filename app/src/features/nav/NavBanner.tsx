import { CircleCheck, Route as RouteIcon, TriangleAlert } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { formatDistance } from '../../i18n/format';
import { hazardKey } from '../../map/MapPins';
import type { Banner } from '../../nav/useWalk';
import { colors, radius, shadow, spacing, touchTarget } from '../../theme/theme';

export const HAZARD_BANNER_MS = 6000;
const STATUS_BANNER_MS = 3000;

type Props = {
  banner: Banner;
  onAnswer: (vote: 'confirm' | 'gone') => void;
  onHide: () => void;
};

// Banners under the instruction card (guide Section 5.3). They never block the map,
// need no tap and hide themselves; the hazard one after about 6 s with a countdown line.
export function NavBanner({ banner, onAnswer, onHide }: Props) {
  const { t } = useTranslation();
  const progress = useRef(new Animated.Value(1)).current;
  const hideAfter = banner.kind === 'hazard' || banner.kind === 'rerouteFailed' ? HAZARD_BANNER_MS : banner.kind === 'back' ? STATUS_BANNER_MS : 0;

  useEffect(() => {
    if (!hideAfter) return;
    const timer = setTimeout(onHide, hideAfter);
    progress.setValue(1);
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!reduce) Animated.timing(progress, { toValue: 0, duration: hideAfter, easing: Easing.linear, useNativeDriver: false }).start();
    });
    return () => {
      clearTimeout(timer);
      progress.stopAnimation();
    };
  }, [banner, hideAfter, onHide, progress]);

  if (banner.kind !== 'hazard') {
    const failed = banner.kind === 'rerouteFailed';
    const text = t(banner.kind === 'rerouting' ? 'nav.reroute.finding' : failed ? 'nav.reroute.failed' : 'nav.reroute.back');
    return (
      <View style={[styles.card, styles.status, failed && styles.statusWarn]} accessibilityLiveRegion="polite">
        {banner.kind === 'back' ? (
          <CircleCheck size={24} color={colors.safeText} />
        ) : failed ? (
          <TriangleAlert size={24} color={colors.hazardText} />
        ) : (
          <RouteIcon size={24} color={colors.interactiveText} />
        )}
        <AppText variant="bodyStrong" color={colors.text} style={styles.flex}>
          {text}
        </AppText>
      </View>
    );
  }

  const { hazard, distM, landmark } = banner;
  const title = t('nav.hazard.title', { hazard: t(`hazard.${hazardKey(hazard.category)}`), distance: formatDistance(distM) });
  const sub =
    landmark?.k === 'beforeCrossing'
      ? t('nav.hazard.beforeCrossing')
      : landmark?.k === 'afterCrossing'
        ? t('nav.hazard.afterCrossing')
        : landmark?.k === 'street'
          ? t('nav.hazard.onStreet', { street: landmark.name })
          : null;

  return (
    <View style={[styles.card, styles.hazard]} accessibilityLiveRegion="assertive">
      <View style={styles.row}>
        <View style={styles.hazardIcon}>
          <TriangleAlert size={30} color={colors.text} strokeWidth={2.25} />
        </View>
        <View style={styles.flex}>
          <AppText variant="heading" color={colors.text}>
            {title}
          </AppText>
          {sub && (
            <AppText variant="body" color={colors.textMuted}>
              {sub}
            </AppText>
          )}
        </View>
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('nav.hazard.answerHint')}
          onPress={() => onAnswer('confirm')}
          style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
        >
          <AppText variant="bodyStrong" color={colors.white}>
            {t('nav.hazard.stillThere')}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('nav.hazard.answerHint')}
          onPress={() => onAnswer('gone')}
          style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && styles.pressed]}
        >
          <AppText variant="bodyStrong" color={colors.navy}>
            {t('nav.hazard.gone')}
          </AppText>
        </Pressable>
      </View>
      <Animated.View
        style={[styles.countdown, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.sheet,
    overflow: 'hidden',
    ...shadow.floating,
  },
  hazard: {
    borderWidth: 2,
    borderColor: colors.hazard,
    padding: spacing.md,
    paddingBottom: spacing.md + 4,
    gap: spacing.md,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.interactive,
  },
  statusWarn: { borderLeftColor: colors.hazard },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  hazardIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    backgroundColor: colors.hazard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btn: {
    flex: 1,
    minHeight: touchTarget + spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.navy },
  btnSecondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.85 },
  countdown: { position: 'absolute', left: 0, bottom: 0, height: 4, backgroundColor: colors.hazard },
});
