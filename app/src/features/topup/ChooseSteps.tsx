import { ChevronRight, Landmark, Smartphone, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { ScreenHeader } from '../../components/ScreenHeader';
import { formatRm } from '../../i18n/format';
import { cappedContent } from '../../theme/layout';
import { colors, radius, spacing, touchTarget } from '../../theme/theme';
import { BANKS, WALLETS, type Provider } from './providers';

// Step 2 (docs/screens/TopUpMethod.png): a bottom sheet over the amount step.
export function MethodSheetBody({ rm, onPick }: { rm: number; onPick: (m: 'bank' | 'wallet') => void }) {
  const { t } = useTranslation();
  const banks = BANKS.slice(0, 3).map((b) => b.name.replace(' Bank', ''));
  return (
    <>
      <AppText variant="heading" color={colors.navy} accessibilityRole="header">
        {t('topup.payWith', { rm: formatRm(rm) })}
      </AppText>
      <MethodRow
        icon={Landmark}
        tint={colors.interactiveSoft}
        iconColor={colors.interactiveText}
        title={t('topup.bank')}
        body={t('topup.bankList', { names: banks.join(', '), count: BANKS.length - 3 })}
        onPress={() => onPick('bank')}
      />
      <MethodRow
        icon={Smartphone}
        tint={colors.communitySoft}
        iconColor={colors.communityText}
        title={t('topup.wallet')}
        body={WALLETS.map((w) => w.name).join(', ')}
        onPress={() => onPick('wallet')}
      />
      <AppText variant="caption" color={colors.textMuted}>
        {t('topup.methodNote')}
      </AppText>
    </>
  );
}

function MethodRow(props: { icon: LucideIcon; tint: string; iconColor: string; title: string; body: string; onPress: () => void }) {
  const Icon = props.icon;
  return (
    <Pressable accessibilityRole="button" onPress={props.onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.methodIcon, { backgroundColor: props.tint }]}>
        <Icon size={26} color={props.iconColor} />
      </View>
      <View style={styles.flex}>
        <AppText variant="heading" color={colors.navy}>
          {props.title}
        </AppText>
        <AppText color={colors.textMuted}>{props.body}</AppText>
      </View>
      <ChevronRight size={24} color={colors.textMuted} />
    </Pressable>
  );
}

// Step 3 (docs/screens/BankList.png): the parody banks or e-wallets.
export function ProviderList({ method, rm, onPick, onBack }: { method: 'bank' | 'wallet'; rm: number; onPick: (p: Provider) => void; onBack: () => void }) {
  const { t } = useTranslation();
  const list = method === 'bank' ? BANKS : WALLETS;
  return (
    <View style={styles.flex}>
      <ScreenHeader title={method === 'bank' ? t('topup.chooseBank') : t('topup.chooseWallet')} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText color={colors.textMuted}>
          {(method === 'bank' ? t('topup.bank') : t('topup.wallet')) + ' · ' + formatRm(rm)}
        </AppText>
        {list.map((p) => (
          <Pressable key={p.name} accessibilityRole="button" onPress={() => onPick(p)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <ProviderMark p={p} size={56} />
            <View style={styles.flex}>
              <AppText variant="heading" color={colors.navy}>
                {p.name}
              </AppText>
              <AppText color={colors.textMuted}>{method === 'bank' ? t('topup.online', { product: p.product }) : t('topup.ewallet')}</AppText>
            </View>
            <ChevronRight size={24} color={colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// Our own simple logo: the initials on the brand colour.
export function ProviderMark({ p, size, invert }: { p: Provider; size: number; invert?: boolean }) {
  return (
    <View
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: size / 4, backgroundColor: invert ? colors.white : p.brand },
      ]}
      importantForAccessibility="no-hide-descendants"
    >
      <AppText variant="bodyStrong" color={invert ? p.brand : p.onBrand} style={{ fontSize: size * 0.34, lineHeight: size * 0.44 }}>
        {p.initials}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { ...cappedContent, padding: spacing.md, gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget + spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  methodIcon: { width: 56, height: 56, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  mark: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
});
