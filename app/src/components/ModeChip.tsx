import { Moon, Sun } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, type ViewStyle } from 'react-native';

import type { ScoringMode } from '../api/types';
import { colors, radius, shadow, spacing, touchTarget } from '../theme/theme';
import { AppText } from './AppText';
import { ScalePressable } from './ScalePressable';

type Props = {
  mode: ScoringMode;
  onPress: () => void;
  // 'icon' is the big round button on the map home; 'small' the 48 dp round one beside the
  // star on the route sheet (guide Section 17.3); 'long' says Night scoring / Day scoring.
  size?: 'icon' | 'small' | 'long';
  style?: ViewStyle;
};

// Day or night scoring chip (guide Section 6.3, screens 1 and 3). The moon or sun shape
// carries the state (the spoken label says the word); the navy fill is extra.
export function ModeChip({ mode, onPress, size = 'icon', style }: Props) {
  const { t } = useTranslation();
  const night = mode === 'night';
  const Icon = night ? Moon : Sun;

  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={night ? t('home.modeA11yNight') : t('home.modeA11yDay')}
      accessibilityHint={size === 'icon' ? (night ? t('home.modeHintNight') : t('home.modeHintDay')) : t('route.scoringHint')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        size === 'icon' && styles.round,
        size === 'small' && styles.small,
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
    </ScalePressable>
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
  small: { width: touchTarget, height: touchTarget, paddingHorizontal: 0, justifyContent: 'center' },
  night: { backgroundColor: colors.navy },
  day: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  pressed: { opacity: 0.85 },
});
