import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme/theme';
import { AppText } from './AppText';

type Props = { title: string; body: string };

// First-use empty state for tabs that are built in later phases.
export function EmptyTab({ title, body }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <AppText variant="title" color={colors.navy} accessibilityRole="header">
        {title}
      </AppText>
      <AppText color={colors.textMuted}>{body}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, gap: spacing.sm },
});
