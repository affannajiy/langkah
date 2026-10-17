import { Check, TriangleAlert, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { formatDistance, minutes } from '../../i18n/format';
import { colors, radius, shadow, spacing, touchTarget } from '../../theme/theme';

type Props = {
  remainingM: number;
  remainingS: number;
  destName: string;
  arrived: boolean;
  onEnd: () => void;
  onQuickReport: () => void;
  onHeight: (h: number) => void;
};

// Slim bar at the bottom of the walking screen: End, time and distance left, and
// Quick report one tap away (docs/screens/Navigation.png).
export function NavBottomBar({ remainingM, remainingS, destName, arrived, onEnd, onQuickReport, onHeight }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.bar, { paddingBottom: insets.bottom + spacing.md }]}
      onLayout={(e: LayoutChangeEvent) => onHeight(e.nativeEvent.layout.height)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={arrived ? t('nav.done') : t('nav.endA11y')}
        onPress={onEnd}
        style={({ pressed }) => [styles.end, arrived && styles.done, pressed && styles.pressed]}
      >
        {arrived ? <Check size={22} color={colors.white} strokeWidth={2.5} /> : <X size={22} color={colors.navy} strokeWidth={2.5} />}
        <AppText variant="bodyStrong" color={arrived ? colors.white : colors.navy}>
          {arrived ? t('nav.done') : t('nav.end')}
        </AppText>
      </Pressable>

      <View style={styles.middle} accessible accessibilityLiveRegion="none">
        {arrived ? (
          <AppText variant="bodyStrong" color={colors.safeText} numberOfLines={2}>
            {t('nav.arrivedTitle')}
          </AppText>
        ) : (
          <>
            {/* One line always: on narrow phones the time shrinks a little instead of wrapping. */}
            <AppText variant="title" color={colors.safeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t('units.min', { count: minutes(remainingS) })}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} numberOfLines={2}>
              {t('nav.left', { distance: formatDistance(remainingM), name: destName })}
            </AppText>
          </>
        )}
      </View>

      {!arrived && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('nav.quickReport')}
          onPress={onQuickReport}
          style={({ pressed }) => [styles.report, pressed && styles.pressed]}
        >
          <TriangleAlert size={30} color={colors.text} strokeWidth={2.25} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...shadow.floating,
  },
  end: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchTarget + spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  done: { backgroundColor: colors.navy, borderColor: colors.navy },
  middle: { flex: 1, alignItems: 'center' },
  report: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.hazard,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.floating,
  },
  pressed: { opacity: 0.85 },
});
