import { Box, Compass, Navigation2, Radio, Share2, Volume2, VolumeX, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import type { LiveShare } from '../../nav/liveShare';
import type { WalkCamera } from '../../storage/settings';
import { colors, radius, shadow, spacing, touchTarget } from '../../theme/theme';

type Props = {
  share: LiveShare;
  onShare: () => void;
  voiceOn: boolean;
  onVoice: () => void;
  camera: WalkCamera;
  onCamera: () => void;
};

const SIZE = touchTarget + spacing.sm;

const CAMERA_ICONS: Record<WalkCamera, LucideIcon> = { '3d': Box, '2d': Navigation2, north: Compass };

// Small round buttons on the right of the walk map, above the bottom bar. They
// never cover the instruction card or the route ahead.
export function WalkTools({ share, onShare, voiceOn, onVoice, camera, onCamera }: Props) {
  const { t } = useTranslation();
  const live = share.status === 'live';
  const CameraIcon = CAMERA_ICONS[camera];

  return (
    <View style={styles.column} pointerEvents="box-none">
      {/* Map view: an icon and a word, so the mode never rests on the icon alone. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('nav.view.button', { mode: t(`nav.view.${camera}Name`) })}
        onPress={onCamera}
        style={({ pressed }) => [styles.round, styles.viewPill, pressed && styles.pressed]}
      >
        <CameraIcon size={20} color={colors.navy} />
        <AppText variant="label" color={colors.navy}>
          {t(`nav.view.${camera}`)}
        </AppText>
      </Pressable>
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
  viewPill: { paddingHorizontal: spacing.md },
  pressed: { opacity: 0.85 },
});
