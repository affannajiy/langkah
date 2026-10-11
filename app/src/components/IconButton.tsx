import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { colors, radius, shadow, touchTarget } from '../theme/theme';

type Props = {
  icon: LucideIcon;
  label: string; // spoken name, since the button shows no text
  hint?: string;
  onPress: () => void;
  // 'floating' sits on the map with a shadow; 'soft' sits inside a sheet or bar.
  kind?: 'floating' | 'soft' | 'plain';
  size?: number;
  style?: ViewStyle;
};

export function IconButton({ icon: Icon, label, hint, onPress, kind = 'floating', size = 56, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      hitSlop={Math.max(0, (touchTarget - size) / 2)}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size },
        kind === 'floating' && styles.floating,
        kind === 'soft' && styles.soft,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Icon size={24} color={colors.navy} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  floating: { backgroundColor: colors.white, ...shadow.floating },
  soft: { backgroundColor: colors.surface },
  pressed: { opacity: 0.8 },
});
