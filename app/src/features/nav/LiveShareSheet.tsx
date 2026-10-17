import { Radio, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import type { LiveShare } from '../../nav/liveShare';
import { colors, spacing, touchTarget } from '../../theme/theme';

type Props = {
  visible: boolean;
  share: LiveShare;
  onShare: () => void; // start, or send the link again
  onStop: () => void;
  onClose: () => void;
};

// Live walk share (guide Section 16.1). Before sharing, it says what the friend sees
// and when it stops, so the tap on Share link is the consent. While live, it offers
// the link again or Stop. A sheet, never a dialog, since a walk is on.
export function LiveShareSheet({ visible, share, onShare, onStop, onClose }: Props) {
  const { t } = useTranslation();
  const live = share.status === 'live';

  return (
    <>
      {visible && (
        <Pressable style={styles.scrim} accessibilityRole="button" accessibilityLabel={t('share.close')} onPress={onClose} />
      )}
      <Sheet visible={visible} overSystemBar>
        <View style={styles.header}>
          <View style={styles.flex}>
            {live && (
              <View style={styles.liveRow}>
                <Radio size={18} color={colors.safeText} />
                <AppText variant="label" color={colors.safeText}>
                  {t('share.liveTag')}
                </AppText>
              </View>
            )}
            <AppText variant="heading" color={colors.navy} accessibilityRole="header">
              {live ? t('share.liveTitle') : t('share.askTitle')}
            </AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('share.close')} onPress={onClose} style={styles.close}>
            <X size={24} color={colors.navy} />
          </Pressable>
        </View>
        <AppText color={colors.textMuted}>{live ? t('share.liveBody') : t('share.askBody')}</AppText>
        <View style={styles.actions}>
          <Button label={live ? t('share.again') : share.status === 'starting' ? t('share.starting') : t('share.start')} onPress={onShare} />
          {live && <Button kind="secondary" label={t('share.stop')} onPress={onStop} />}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xs },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  close: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: -spacing.sm },
  actions: { gap: spacing.sm },
});
