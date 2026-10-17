import { Ticket } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { shortDate } from '../../i18n/format';
import { colors, radius, spacing } from '../../theme/theme';
import { itemText, VOUCHERS } from './catalog';

// A redeemed voucher's code, to show at the counter. Goes inside a ScrimSheet.
export function VoucherBody({ item, code, at, onClose }: { item: string; code: string; at: string; onClose: () => void }) {
  const { t } = useTranslation();
  const look = VOUCHERS[item];
  return (
    <>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: look?.soft ?? colors.interactiveSoft }]}>
          <Ticket size={26} color={look?.text ?? colors.interactiveText} />
        </View>
        <View style={styles.flex}>
          <AppText variant="heading" color={colors.navy} accessibilityRole="header">
            {itemText(t, item, 'name')}
          </AppText>
          <AppText color={colors.textMuted}>
            {t('shop.voucherLine', { rm: look?.rm ?? 0, detail: itemText(t, item, 'detail') })}
          </AppText>
        </View>
      </View>
      <View style={styles.code} accessible accessibilityLabel={`${t('shop.code')}: ${code.split('').join(' ')}`}>
        <AppText variant="caption" color={colors.textMuted}>
          {t('shop.code')}
        </AppText>
        <AppText variant="instruction" color={colors.navy} style={styles.codeText}>
          {code}
        </AppText>
      </View>
      <AppText color={colors.text}>{t('shop.showCashier')}</AppText>
      <AppText variant="caption" color={colors.textMuted}>
        {t('shop.redeemedOn', { date: shortDate(at) })}
      </AppText>
      <Button label={t('common.close')} onPress={onClose} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 52, height: 52, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  code: {
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    paddingVertical: spacing.lg,
  },
  codeText: { letterSpacing: 3 },
});
