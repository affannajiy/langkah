import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fontFamily, radius, spacing } from '../theme/theme';

type Props = { onPress: () => void };

// ODbL: "© OpenStreetMap contributors" must always stay visible on the map.
// Tapping it opens the full credits (OpenFreeMap, OpenMapTiles, OSM).
export function MapCredit({ onPress }: Props) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('map.creditA11yHint')}
      onPress={onPress}
      hitSlop={spacing.sm}
      style={styles.pill}
    >
      {/* The one place text is under 14 sp: a legal credit, not UI copy. */}
      <Text style={styles.text}>{t('map.credit')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: radius.card / 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  text: { fontFamily, fontSize: 12, lineHeight: 16, color: colors.textMuted },
});
