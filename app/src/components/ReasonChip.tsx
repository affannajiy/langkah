import { TriangleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../theme/theme';
import { AppText } from './AppText';

type Props = { label: string; tone: 'good' | 'warn' };

// One plain reason a route is better or worse (guide Section 6.3, screen 3).
// Warnings carry a triangle icon as well as the orange tint, never colour alone.
export function ReasonChip({ label, tone }: Props) {
  const warn = tone === 'warn';
  return (
    <View style={[styles.chip, warn ? styles.warn : styles.good]}>
      {warn && <TriangleAlert size={14} color={colors.hazardText} />}
      <AppText variant="label" color={warn ? colors.hazardText : colors.text}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  good: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  warn: { backgroundColor: colors.hazardSoft },
});
