import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { ScreenHeader } from '../../components/ScreenHeader';
import { formatPoints, formatRm } from '../../i18n/format';
import { cappedContent } from '../../theme/layout';
import { colors, fontFamily, radius, spacing, touchTarget } from '../../theme/theme';
import { PACKS } from './providers';

export type Choice = { rm: number; pack: boolean };

// Points a choice gives: a pack's fixed number, or 100 per RM with no bonus.
export function pointsFor(c: Choice): number {
  if (c.pack) return PACKS.find((p) => p.rm === c.rm)?.points ?? c.rm * 100;
  return c.rm * 100;
}

type Props = {
  balance: number | null;
  leftRm: number | null; // RM still allowed this month
  choice: Choice | null;
  custom: string;
  onPack: (rm: number) => void;
  onCustom: (text: string) => void;
  onNext: () => void;
  onBack: () => void;
  bottomInset: number;
};

// Step 1 of the mock top-up (docs/screens/TopUpAmount.png).
export function AmountStep({ balance, leftRm, choice, custom, onPack, onCustom, onNext, onBack, bottomInset }: Props) {
  const { t } = useTranslation();
  const customRm = Number(custom);
  const customBad = custom.length > 0 && (!Number.isInteger(customRm) || customRm < 1 || customRm > 100);
  const overCap = choice !== null && leftRm !== null && choice.rm > leftRm;
  const ready = choice !== null && !customBad && !overCap;

  return (
    <View style={styles.flex}>
      <ScreenHeader title={t('topup.title')} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {balance !== null && (
          <AppText color={colors.textMuted}>
            {t('topup.youHave')}{' '}
            <AppText variant="bodyStrong" color={colors.text}>
              {t('topup.points', { value: formatPoints(balance) })}
            </AppText>
          </AppText>
        )}

        <View style={styles.grid} accessibilityRole="radiogroup">
          {PACKS.map((p) => {
            const on = choice?.pack === true && choice.rm === p.rm;
            return (
              <Pressable
                key={p.rm}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${formatPoints(p.points)} ${t('points.title')}, ${formatRm(p.rm)}${p.bonus ? `, ${t('topup.bonus', { value: formatPoints(p.bonus) })}` : ''}`}
                onPress={() => onPack(p.rm)}
                style={[styles.pack, on && styles.packOn]}
              >
                {p.bonus > 0 && (
                  <View style={[styles.bonus, on && styles.bonusOn]}>
                    <AppText variant="label" color={on ? colors.white : colors.safeText}>
                      {t('topup.bonus', { value: formatPoints(p.bonus) })}
                    </AppText>
                  </View>
                )}
                <AppText variant="title" color={on ? colors.safeText : colors.navy}>
                  {formatPoints(p.points)}
                </AppText>
                <AppText variant={on ? 'bodyStrong' : 'body'} color={on ? colors.safeText : colors.textMuted}>
                  {on ? t('topup.selected', { rm: `RM${p.rm}` }) : `RM${p.rm}`}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <AppText variant="bodyStrong" color={colors.navy}>
          {t('topup.orType')}
        </AppText>
        <View style={[styles.input, choice?.pack === false && styles.inputOn, customBad && styles.inputBad]}>
          <AppText variant="bodyStrong" color={colors.textMuted}>
            RM
          </AppText>
          <TextInput
            value={custom}
            onChangeText={(v) => onCustom(v.replace(/[^0-9]/g, '').slice(0, 3))}
            placeholder={t('topup.customHint')}
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            accessibilityLabel={t('topup.orType')}
            style={styles.field}
          />
        </View>
        <AppText variant="caption" color={customBad || overCap ? colors.hazardText : colors.textMuted}>
          {customBad
            ? t('topup.customBad')
            : overCap
              ? t('topup.overCap', { rm: formatRm(leftRm ?? 0) })
              : t('topup.rate')}
        </AppText>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomInset + spacing.md }]}>
        <View style={styles.sumRow}>
          <AppText color={colors.textMuted}>{t('topup.youPay')}</AppText>
          <AppText variant="bodyStrong" color={colors.text}>
            {choice ? formatRm(choice.rm) : '-'}
          </AppText>
        </View>
        <View style={styles.sumRow}>
          <AppText color={colors.textMuted}>{t('topup.youGet')}</AppText>
          <AppText variant="heading" color={colors.safeText}>
            {choice ? t('topup.plusPoints', { value: formatPoints(pointsFor(choice)) }) : '-'}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={onNext}
          style={({ pressed }) => [styles.primary, !ready && styles.disabled, pressed && styles.pressed]}
        >
          <AppText variant="heading" color={colors.white}>
            {t('topup.choosePay')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { ...cappedContent, padding: spacing.md, gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingTop: spacing.sm },
  pack: {
    flexBasis: '45%',
    flexGrow: 1,
    minHeight: 96,
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  packOn: { borderColor: colors.safe, backgroundColor: colors.safeSoft },
  bonus: {
    position: 'absolute',
    top: -14,
    backgroundColor: colors.safeSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  bonusOn: { backgroundColor: colors.safeText },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget + spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  inputOn: { borderColor: colors.safe, borderWidth: 2 },
  inputBad: { borderColor: colors.hazard, borderWidth: 2 },
  field: { flex: 1, fontFamily, fontSize: 18, color: colors.text, minHeight: touchTarget },
  footer: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, gap: spacing.sm },
  sumRow: { ...cappedContent, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  primary: {
    ...cappedContent,
    minHeight: touchTarget + spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
});
