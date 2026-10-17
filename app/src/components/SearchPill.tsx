import { useFocusEffect } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, shadow, spacing } from '../theme/theme';
import { AppText } from './AppText';

const LINES = ['searchLine0', 'searchLine1', 'searchLine2', 'searchLine3', 'searchLine4', 'searchLine5'] as const;

// A different line each time, never the same one twice in a row.
function nextLine(current: number): number {
  const step = 1 + Math.floor(Math.random() * (LINES.length - 1));
  return (current + step) % LINES.length;
}

// Search pill on the map (guide Section 6.3, screen 1; Section 6.5).
// It is a button, not a field: tapping it opens the search sheet.
// The line changes when the map tab comes into view, never while it is on screen.
export function SearchPill({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const [line, setLine] = useState(() => Math.floor(Math.random() * LINES.length));
  useFocusEffect(useCallback(() => () => setLine(nextLine), []));

  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={t('home.searchPlaceholder')}
      accessibilityHint={t('home.searchHint')}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <Search size={24} color={colors.navy} />
      <AppText color={colors.textMuted} numberOfLines={1} style={styles.text}>
        {t(`home.${LINES[line] ?? LINES[0]}`)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadow.floating,
  },
  text: { flex: 1 },
  pressed: { opacity: 0.9 },
});
