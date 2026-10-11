import { Search } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, shadow, spacing } from '../theme/theme';
import { AppText } from './AppText';

// "Where are you walking to?" pill on the map (guide Section 6.3, screen 1; Section 6.5).
// It is a button, not a field: tapping it opens the search sheet.
export function SearchPill({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
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
        {t('home.searchPlaceholder')}
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
