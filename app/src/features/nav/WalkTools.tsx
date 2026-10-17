import { Radio, Share2, Volume2, VolumeX } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import type { LiveShare } from '../../nav/liveShare';
import { colors, radius, shadow, spacing, touchTarget } from '../../theme/theme';

type Props = {
  share: LiveShare;
  onShare: () => void;
  voiceOn: boolean;
  onVoice: () => void;
};

const SIZE = touchTarget + spacing.sm;

// Small round buttons on the right of the walk map, above the bottom bar. They
// never cover the instruction card or the route ahead.
export function WalkTools({ share, onShare, voiceOn, onVoice }: Props) {
  const { t } = useTranslation();
  const live = share.status === 'live';

  return (
    <View style={styles.column} pointerEvents="box-none">
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: voiceOn }}
        accessibilityLabel={t('voice.button')}
        onPress={onVoice}
        style={({ pressed }) => [styles.round, pressed && styles.pressed]}
      >
        {voiceOn ? <Volume2 size={24} color={colors.navy} /> : <VolumeX size={24} color={colors.textMuted} />}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={live ? t('share.liveA11y') : t('share.button')}
        onPress={onShare}
        style={({ pressed }) => [styles.round, live && styles.livePill, pressed && styles.pressed]}
      >
        {share.status === 'starting' ? (
          <ActivityIndicator color={colors.navy} />
        ) : live ? (
          <>
            <Radio size={22} color={colors.white} />
            <AppText variant="label" color={colors.white}>
              {t('share.liveTag')}
            </AppText>
          </>
        ) : (
          <Share2 size={24} color={colors.navy} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'flex-end', gap: spacing.sm },
  round: {
    minWidth: SIZE,
    height: SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    ...shadow.floating,
  },
  // Live: a filled pill with a word, so the state never rests on colour alone.
  livePill: { backgroundColor: colors.safeText, paddingHorizontal: spacing.md },
  pressed: { opacity: 0.85 },
});
