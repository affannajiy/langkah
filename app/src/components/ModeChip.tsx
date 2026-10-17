import { Moon, Sun } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import type { ScoringMode } from '../api/types';
import { colors, radius, shadow, spacing, touchTarget } from '../theme/theme';
import { AppText } from './AppText';

type Props = {
  mode: ScoringMode;
  onPress: () => void;
  // 'icon' is a round icon-only button (map home); 'long' says Night scoring / Day scoring (route sheet).
  size?: 'icon' | 'long';
  style?: ViewStyle;
};

// Day or night scoring chip (guide Section 6.3, screens 1 and 3). The moon or sun shape
// carries the state (the spoken label says the word); the navy fill is extra.
export function ModeChip({ mode, onPress, size = 'icon', style }: Props) {
  const { t } = useTranslation();
  const night = mode === 'night';
  const Icon = night ? Moon : Sun;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={night ? t('home.modeA11yNight') : t('home.modeA11yDay')}
      accessibilityHint={size === 'long' ? t('route.scoringHint') : night ? t('home.modeHintNight') : t('home.modeHintDay')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        size === 'icon' && styles.round,
        night ? styles.night : styles.day,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Icon size={size === 'icon' ? 26 : 22} color={night ? colors.white : colors.navy} />
      {size === 'long' && (
        <AppText variant="bodyStrong" color={night ? colors.white : colors.navy}>
          {night ? t('route.nightScoring') : t('route.dayScoring')}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Same height as the search pill beside it.
  round: { width: 64, height: 64, paddingHorizontal: 0, justifyContent: 'center', ...shadow.floating },
  night: { backgroundColor: colors.navy },
  day: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  pressed: { opacity: 0.85 },
});
