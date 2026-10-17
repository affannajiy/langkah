import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Sheet } from './Sheet';

// Brands whose battery savers often stop a walk's location with the screen off,
// even with the walk notification showing (see dontkillmyapp.com).
const STRICT_BRANDS = ['honor', 'huawei', 'xiaomi', 'redmi', 'poco', 'oppo', 'realme', 'oneplus', 'vivo', 'samsung'];

export function hasStrictBatterySaver(): boolean {
  if (Platform.OS !== 'android') return false;
  const c = Platform.constants;
  const name = `${c.Manufacturer} ${c.Brand}`.toLowerCase();
  return STRICT_BRANDS.some((b) => name.includes(b));
}

type Props = {
  visible: boolean;
  onStart: () => void;
};

// Shown once, before the first walk on those brands. It never blocks: Start walk
// goes on at once, and Open Settings leaves the walk ready to start on return.
export function BatteryTipSheet({ visible, onStart }: Props) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} overSystemBar>
      <View style={styles.text}>
        <AppText variant="heading" color={colors.navy} accessibilityRole="header">
          {t('batteryTip.title')}
        </AppText>
        <AppText color={colors.textMuted}>{t('batteryTip.body')}</AppText>
        <AppText color={colors.text}>{t('batteryTip.steps')}</AppText>
      </View>
      <View style={styles.actions}>
        <Button label={t('batteryTip.start')} onPress={onStart} />
        <Button kind="secondary" label={t('batteryTip.openSettings')} onPress={() => Linking.openSettings()} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  text: { gap: spacing.sm },
  actions: { gap: spacing.sm },
});
