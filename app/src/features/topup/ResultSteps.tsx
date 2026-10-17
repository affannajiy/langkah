import { Check, CircleX } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { TopupResult } from '../../api/points';
import { AppText } from '../../components/AppText';
import { dateTime, formatPoints, formatRm } from '../../i18n/format';
import { cappedContent } from '../../theme/layout';
import { colors, radius, spacing, touchTarget } from '../../theme/theme';
import { ProviderMark } from './ChooseSteps';
import type { Provider } from './providers';

// Step 6: 2 s of "processing", the server call runs underneath.
export function Processing({ p, rm }: { p: Provider; rm: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.navy} />
      <AppText variant="heading" color={colors.navy}>
        {t('topup.processing')}
      </AppText>
      <AppText color={colors.textMuted}>{t('topup.processingBody', { name: p.name, rm: formatRm(rm) })}</AppText>
    </View>
  );
}

// Step 7 (docs/screens/Receipt.png).
export function Receipt({ p, rm, r, bottom, onShop, onDone }: { p: Provider; rm: number; r: TopupResult; bottom: number; onShop: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.halo}>
          <View style={styles.tick}>
            <Check size={40} color={colors.white} strokeWidth={3} />
          </View>
        </View>
        <AppText variant="heading" color={colors.safeText} accessibilityRole="header">
          {t('topup.done')}
        </AppText>
        <AppText variant="instruction" color={colors.navy} style={styles.big}>
          {t('topup.plusPoints', { value: formatPoints(r.points) })}
        </AppText>
        <AppText color={colors.textMuted}>{t('topup.newBalance', { value: formatPoints(r.balance) })}</AppText>

        <View style={styles.card}>
          <View style={[styles.row, styles.divider]}>
            <AppText color={colors.textMuted}>{t('topup.paidWith')}</AppText>
            <View style={styles.paid}>
              <ProviderMark p={p} size={32} />
              <AppText variant="bodyStrong" color={colors.text}>
                {p.name}
              </AppText>
            </View>
          </View>
          <Line label={t('topup.amount')} value={formatRm(rm)} />
          <Line
            label={t('topup.pack')}
            value={r.bonus > 0 ? t('topup.packBonus', { base: formatPoints(r.base), bonus: formatPoints(r.bonus) }) : formatPoints(r.base)}
          />
          <Line label={t('topup.reference')} value={r.ref} />
          <Line label={t('topup.date')} value={dateTime(r.at)} last />
        </View>
        <AppText variant="caption" color={colors.textMuted}>
          {t('topup.noMoney')}
        </AppText>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: bottom + spacing.md }]}>
        <Pressable accessibilityRole="button" onPress={onShop} style={({ pressed }) => [styles.btn, styles.outline, pressed && styles.pressed]}>
          <AppText variant="heading" color={colors.navy}>
            {t('topup.spend')}
          </AppText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onDone} style={({ pressed }) => [styles.btn, styles.solid, pressed && styles.pressed]}>
          <AppText variant="heading" color={colors.white}>
            {t('topup.doneButton')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function Line({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <AppText color={colors.textMuted}>{label}</AppText>
      <AppText variant="bodyStrong" color={colors.text} style={styles.right}>
        {value}
      </AppText>
    </View>
  );
}

// Offline or refused: nothing added, nothing taken.
export function Failed({ message, bottom, onBack }: { message: string; bottom: number; onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.flex}>
      <View style={styles.center} accessibilityLiveRegion="assertive">
        <CircleX size={56} color={colors.hazardText} />
        <AppText variant="heading" color={colors.text} style={styles.centerText}>
          {t('topup.failed')}
        </AppText>
        <AppText color={colors.textMuted} style={styles.centerText}>
          {message}
        </AppText>
      </View>
      <View style={[styles.footer, { paddingBottom: bottom + spacing.md }]}>
        <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.btn, styles.solid, pressed && styles.pressed]}>
          <AppText variant="heading" color={colors.white}>
            {t('topup.backToWallet')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { ...cappedContent, alignItems: 'center', padding: spacing.lg, gap: spacing.md, paddingTop: spacing.xxl },
  halo: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.safeSoft, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.safe, alignItems: 'center', justifyContent: 'center' },
  big: { fontSize: 48, lineHeight: 58, textAlign: 'center' },
  card: { alignSelf: 'stretch', backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, minHeight: touchTarget + spacing.md, paddingVertical: spacing.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  paid: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  right: { flexShrink: 1, textAlign: 'right' },
  footer: { ...cappedContent, paddingHorizontal: spacing.lg, gap: spacing.md },
  btn: { minHeight: touchTarget + spacing.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  outline: { borderWidth: 2, borderColor: colors.navy, backgroundColor: colors.white },
  solid: { backgroundColor: colors.navy },
  pressed: { opacity: 0.85 },
});
