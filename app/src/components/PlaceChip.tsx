import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../theme/theme';
import { AppText } from './AppText';

type Props = {
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  onLongPress?: () => void;
  hint?: string;
  // An unset saved place gets a dashed outline, so "not set" shows by shape, not colour.
  unset?: boolean;
  floating?: boolean;
};

// Saved-place chip (Home, UTP, Work), guide Section 6.5.
export function PlaceChip({ label, icon: Icon, onPress, onLongPress, hint, unset, floating }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.chip,
        floating && styles.floating,
        unset && styles.unset,
        pressed && styles.pressed,
      ]}
    >
      {Icon && <Icon size={20} color={colors.navy} />}
      <AppText variant="bodyStrong" color={colors.navy}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  floating: { borderColor: colors.white, elevation: 2, shadowColor: colors.navy, shadowOpacity: 0.1, shadowRadius: 4 },
  unset: { borderStyle: 'dashed', borderColor: colors.textMuted },
  pressed: { opacity: 0.8 },
});
