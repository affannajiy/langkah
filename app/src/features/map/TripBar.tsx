import { ArrowUpDown, ChevronLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { IconButton } from '../../components/IconButton';
import { colors, radius, shadow, spacing, touchTarget } from '../../theme/theme';

type Props = {
  fromLabel: string | null; // null: no start chosen yet
  toLabel: string;
  onBack: () => void;
  onFrom: () => void;
  onTo: () => void;
  onSwap: () => void;
  onLayout: (bottom: number) => void;
};

// Compact From and To bar at the top of route compare (guide Section 6.3, screen 3).
// The dot and the square mark start and end by shape as well as colour.
export function TripBar({ fromLabel, toLabel, onBack, onFrom, onTo, onSwap, onLayout }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const from = fromLabel ?? t('route.chooseStart');

  return (
    <View
      style={[styles.bar, { top: insets.top + spacing.sm }]}
      onLayout={(e) => onLayout(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
    >
      <IconButton icon={ChevronLeft} kind="plain" size={touchTarget} label={t('route.back')} onPress={onBack} />
      <View style={styles.ends}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('route.fromA11y', { name: from })}
          accessibilityHint={t('route.changeHint')}
          onPress={onFrom}
          style={styles.end}
        >
          <View style={styles.dot} />
          <AppText color={fromLabel ? colors.textMuted : colors.interactiveText} numberOfLines={1} style={styles.endText}>
            {from}
          </AppText>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('route.toA11y', { name: toLabel })}
          accessibilityHint={t('route.changeHint')}
          onPress={onTo}
          style={styles.end}
        >
          <View style={styles.square} />
          <AppText variant="bodyStrong" color={colors.text} numberOfLines={1} style={styles.endText}>
            {toLabel}
          </AppText>
        </Pressable>
      </View>
      <IconButton icon={ArrowUpDown} kind="soft" label={t('route.swap')} onPress={onSwap} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.sheet,
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow.floating,
  },
  ends: { flex: 1 },
  end: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  endText: { flex: 1 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.xl },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.interactiveText },
  square: { width: 14, height: 14, borderRadius: 2, backgroundColor: colors.navy },
});
