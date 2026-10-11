import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../theme/theme';
import { AppText } from './AppText';

type Props = {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary';
};

// Primary: navy fill. Secondary: outlined. Both at least 48 dp tall.
export function Button({ label, onPress, kind = 'primary' }: Props) {
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        pressed && styles.pressed,
      ]}
    >
      <AppText variant="bodyStrong" color={primary ? colors.white : colors.navy}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget + spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.navy },
  secondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.85 },
});
