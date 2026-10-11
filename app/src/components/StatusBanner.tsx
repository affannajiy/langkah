import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, shadow, spacing, touchTarget } from '../theme/theme';
import { AppText } from './AppText';

type Props = {
  icon: LucideIcon;
  text: string;
  tone?: 'caution' | 'info';
  action?: { label: string; onPress: () => void };
  style?: ViewStyle;
};

// Slim, non-blocking banner for a state the user should know about: offline, location
// off (guide Section 5.3). Icon, word and colour together, never colour alone.
export function StatusBanner({ icon: Icon, text, tone = 'caution', action, style }: Props) {
  const caution = tone === 'caution';
  return (
    <View
      style={[styles.banner, { borderLeftColor: caution ? colors.hazard : colors.interactive }, style]}
      accessibilityLiveRegion="polite"
    >
      <Icon size={20} color={caution ? colors.hazardText : colors.interactiveText} />
      <AppText variant="label" color={colors.navy} style={styles.text}>
        {text}
      </AppText>
      {action && (
        <Pressable accessibilityRole="button" onPress={action.onPress} style={styles.action}>
          <AppText variant="label" color={colors.interactiveText}>
            {action.label}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderLeftWidth: 4,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.floating,
  },
  text: { flex: 1, paddingVertical: spacing.sm },
  action: { minHeight: touchTarget, paddingHorizontal: spacing.md, justifyContent: 'center' },
});
