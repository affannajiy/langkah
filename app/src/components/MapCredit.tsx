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
      // The pill is about 20 dp tall; this makes the tap area 48 dp (Section 5.4).
      hitSlop={{ top: 14, bottom: 14, left: spacing.sm, right: spacing.sm }}
      style={styles.pill}
    >
      {/* The one place text is under 14 sp: a legal credit, not UI copy. It keeps a fixed
          size, so on narrow phones it never breaks inside "OpenStreetMap". */}
      <Text style={styles.text} allowFontScaling={false}>
        {t('map.credit')}
      </Text>
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
  text: { fontFamily, fontSize: 14, lineHeight: 18, color: colors.textMuted },
});
