import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Sheet } from './Sheet';

type Props = {
  visible: boolean;
  // 'ask': explain, then show the Android prompt. 'blocked': only Settings can turn it on.
  mode: 'ask' | 'blocked';
  onAllow: () => void;
  onClose: () => void;
};

// Explains why Langkah needs location before Android's own dialog appears.
// Reused by onboarding in Phase 6.
export function LocationSheet({ visible, mode, onAllow, onClose }: Props) {
  const { t } = useTranslation();
  const ask = mode === 'ask';

  return (
    <Sheet visible={visible}>
      <View style={styles.text}>
        <AppText variant="heading" color={colors.navy} accessibilityRole="header">
          {ask ? t('location.title') : t('location.offTitle')}
        </AppText>
        <AppText color={colors.textMuted}>{ask ? t('location.body') : t('location.offBody')}</AppText>
      </View>
      <View style={styles.actions}>
        <Button
          label={ask ? t('location.allow') : t('location.openSettings')}
          onPress={ask ? onAllow : () => Linking.openSettings()}
        />
        <Button kind="secondary" label={ask ? t('location.notNow') : t('location.dismiss')} onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  text: { gap: spacing.sm },
  actions: { gap: spacing.sm },
});
