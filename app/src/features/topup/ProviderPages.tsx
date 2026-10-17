import { Delete, Lock } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { formatRm } from '../../i18n/format';
import { cappedContent } from '../../theme/layout';
import { colors, radius, shadow, spacing, touchTarget } from '../../theme/theme';
import { ProviderMark } from './ChooseSteps';
import { DemoStrip } from './DemoStrip';
import { TAC, type Provider } from './providers';

type PageProps = { p: Provider; rm: number; top: number; bottom: number; onCancel: () => void };

const DARK = '#1A1A2E';

// Step 4, bank (docs/screens/BankLogin.png): fields filled in and locked. Nothing is typed.
export function BankLogin({ p, rm, top, bottom, onCancel, onLogin }: PageProps & { onLogin: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.flex, { backgroundColor: p.page }]}>
      <DemoStrip kind="bank" background={DARK} color={colors.hazard} top={top} />
      <BankHeader p={p} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, styles.payTo]}>
          <View style={styles.flex}>
            <AppText color={colors.textMuted}>{t('topup.payTo')}</AppText>
            <AppText variant="heading" color={DARK}>
              {t('topup.langkahPoints')}
            </AppText>
          </View>
          <AppText variant="title" color={DARK}>
            {formatRm(rm)}
          </AppText>
        </View>
        <LockedField label={t('topup.userId')} value="demo.langkah" />
        <LockedField label={t('topup.password')} value="••••••••" hidden />
        <AppText color={colors.textMuted}>{t('topup.filledIn')}</AppText>
      </ScrollView>
      <Footer bottom={bottom}>
        <BigButton label={t('topup.logIn')} color={p.brand === '#F2B705' ? p.brand : colors.white} onPress={onLogin} />
        <CancelLink onPress={onCancel} />
      </Footer>
    </View>
  );
}

function BankHeader({ p }: { p: Provider }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.bankHeader, { backgroundColor: p.brand }]}>
      <ProviderMark p={{ ...p, brand: DARK, onBrand: p.brand === '#F2B705' ? p.brand : colors.white }} size={56} />
      <View style={styles.flex}>
        <AppText variant="title" color={p.onBrand}>
          {p.name}
        </AppText>
        <AppText color={p.onBrand}>{t('topup.onlineBanking', { product: p.product })}</AppText>
      </View>
    </View>
  );
}

function LockedField({ label, value, hidden }: { label: string; value: string; hidden?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.fieldWrap} accessible accessibilityLabel={`${label}, ${hidden ? t('topup.hidden') : value}, ${t('topup.locked')}`}>
      <AppText variant="bodyStrong" color={DARK}>
        {label}
      </AppText>
      <View style={styles.locked}>
        <AppText variant={hidden ? 'heading' : 'body'} color={DARK} style={styles.flex}>
          {value}
        </AppText>
        <Lock size={22} color={colors.textMuted} />
      </View>
    </View>
  );
}

// Step 5, bank (docs/screens/Tac.png): a fake notification drops in and fills the TAC.
export function BankTac({ p, rm, top, bottom, onCancel, onApprove }: PageProps & { onApprove: () => void }) {
  const { t } = useTranslation();
  const [drop] = useState(() => new Animated.Value(0));
  const [digits, setDigits] = useState(0);

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive) return;
      if (reduce) drop.setValue(1);
      else Animated.spring(drop, { toValue: 1, useNativeDriver: true, bounciness: 4 }).start();
      AccessibilityInfo.announceForAccessibility(t('topup.tacNotice', { name: p.name, tac: TAC.split('').join(' '), rm: formatRm(rm) }));
      for (let i = 1; i <= TAC.length; i++) timers.push(setTimeout(() => setDigits(i), 700 + i * 180));
    });
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [drop, p.name, rm, t]);

  const filled = digits === TAC.length;
  const translateY = drop.interpolate({ inputRange: [0, 1], outputRange: [-160, 0] });

  return (
    <View style={[styles.flex, { backgroundColor: p.page }]}>
      <DemoStrip kind="bank" background={DARK} color={colors.hazard} top={top} />
      <View style={[styles.noticeBand, { backgroundColor: p.brand }]}>
        <Animated.View style={[styles.notice, { transform: [{ translateY }] }]}>
          <ProviderMark p={{ ...p, brand: DARK, onBrand: p.brand === '#F2B705' ? p.brand : colors.white }} size={44} />
          <View style={styles.flex}>
            <View style={styles.noticeTop}>
              <AppText variant="label" color={colors.textMuted} style={styles.flex}>
                {t('topup.noticeFrom', { name: p.name })}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {t('topup.now')}
              </AppText>
            </View>
            <AppText color={DARK}>
              {t('topup.tacPrefix')}{' '}
              <AppText variant="bodyStrong" color={DARK}>
                {`${TAC.slice(0, 3)} ${TAC.slice(3)}`}
              </AppText>{' '}
              {t('topup.tacSuffix', { rm: formatRm(rm) })}
            </AppText>
          </View>
        </Animated.View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <InfoRow label={t('topup.from')} value={t('topup.savings')} />
          <InfoRow label={t('topup.to')} value={t('topup.langkahPoints')} />
          <InfoRow label={t('topup.amount')} value={formatRm(rm)} last />
        </View>
        <AppText variant="bodyStrong" color={DARK}>
          {t('topup.tacCode')}
        </AppText>
        <View style={styles.tacBox} accessible accessibilityLabel={`${t('topup.tacCode')}, ${TAC.slice(0, digits).split('').join(' ')}`}>
          <AppText variant="title" color={DARK} style={styles.tacText}>
            {TAC.slice(0, digits).split('').join(' ')}
          </AppText>
        </View>
        <AppText color={colors.textMuted}>{t('topup.tacFilled')}</AppText>
      </ScrollView>
      <Footer bottom={bottom}>
        <BigButton
          label={t('topup.approve', { rm: formatRm(rm) })}
          color={p.brand === '#F2B705' ? p.brand : colors.white}
          disabled={!filled}
          onPress={onApprove}
        />
        <CancelLink onPress={onCancel} />
      </Footer>
    </View>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.divider]}>
      <AppText color={colors.textMuted}>{label}</AppText>
      <AppText variant="bodyStrong" color={DARK} style={styles.right}>
        {value}
      </AppText>
    </View>
  );
}

// Step 4, e-wallet (docs/screens/WalletPin.png): a 6-dot PIN that fills by itself.
export function WalletPin({ p, rm, top, bottom, onCancel, onDone }: PageProps & { onDone: () => void }) {
  const { t } = useTranslation();
  const [dots, setDots] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 6; i++) timers.push(setTimeout(() => setDots(i), 500 + i * 300));
    timers.push(setTimeout(() => done.current(), 500 + 7 * 300));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <View style={[styles.flex, { backgroundColor: p.page }]}>
      <DemoStrip kind="wallet" background="#FFE082" color={DARK} top={top} />
      <View style={styles.pinTop}>
        <ProviderMark p={p} size={72} invert />
        <AppText variant="title" color={colors.white}>
          {p.name}
        </AppText>
        <AppText color={colors.white}>{t('topup.walletPay', { rm: formatRm(rm) })}</AppText>
        <AppText variant="heading" color={colors.white} style={styles.pinLabel}>
          {t('topup.pin')}
        </AppText>
        <View style={styles.dots} accessible accessibilityLabel={t('topup.pinProgress', { count: dots })}>
          {[1, 2, 3, 4, 5, 6].map((d) => (
            <View key={d} style={[styles.dot, d <= dots ? styles.dotOn : styles.dotOff]} />
          ))}
        </View>
        <AppText color={colors.white}>{t('topup.pinFilling')}</AppText>
      </View>
      <View style={[styles.keypad, { paddingBottom: bottom + spacing.md }]} importantForAccessibility="no-hide-descendants">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k) => (
          <View key={k || 'blank'} style={[styles.key, k === '' && styles.keyBlank]}>
            {k === 'del' ? <Delete size={28} color={p.brand} /> : <AppText variant="title" color={p.brand}>{k}</AppText>}
          </View>
        ))}
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelWallet}>
          <AppText variant="bodyStrong" color={colors.textMuted}>
            {t('topup.cancel')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function Footer({ bottom, children }: { bottom: number; children: React.ReactNode }) {
  return <View style={[styles.footer, { paddingBottom: bottom + spacing.md }]}>{children}</View>;
}

function BigButton({ label, color, onPress, disabled }: { label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.big, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <AppText variant="heading" color={color}>
        {label}
      </AppText>
    </Pressable>
  );
}

function CancelLink({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.cancel}>
      <AppText variant="bodyStrong" color={DARK}>
        {t('topup.cancel')}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { ...cappedContent, padding: spacing.lg, gap: spacing.md },
  bankHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  card: { backgroundColor: colors.white, borderRadius: radius.sheet, borderWidth: 1, borderColor: '#EADFB8', paddingHorizontal: spacing.lg },
  payTo: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.md },
  fieldWrap: { gap: spacing.sm },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget + spacing.lg,
    borderRadius: radius.card,
    backgroundColor: 'rgba(26, 26, 46, 0.06)',
    paddingHorizontal: spacing.lg,
  },
  noticeBand: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl, overflow: 'hidden' },
  notice: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.sheet + 8, padding: spacing.md, ...shadow.floating },
  noticeTop: { flexDirection: 'row', alignItems: 'center' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  divider: { borderBottomWidth: 1, borderBottomColor: '#F1E8C9' },
  right: { flexShrink: 1, textAlign: 'right' },
  tacBox: {
    minHeight: touchTarget + spacing.xl,
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: DARK,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  tacText: { letterSpacing: 4 },
  pinTop: { flex: 1, alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl, paddingHorizontal: spacing.lg },
  pinLabel: { marginTop: spacing.lg },
  dots: { flexDirection: 'row', gap: spacing.md, marginVertical: spacing.sm },
  dot: { width: 28, height: 28, borderRadius: 14 },
  dotOn: { backgroundColor: '#FFE082' },
  dotOff: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)' },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet + 8,
    borderTopRightRadius: radius.sheet + 8,
    padding: spacing.lg,
  },
  key: { flexBasis: '29%', flexGrow: 1, minHeight: 60, borderRadius: radius.sheet, backgroundColor: '#EEF2F8', alignItems: 'center', justifyContent: 'center' },
  keyBlank: { backgroundColor: 'transparent' },
  cancelWallet: { flexBasis: '100%', minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  footer: { ...cappedContent, paddingHorizontal: spacing.lg, gap: spacing.sm },
  big: { minHeight: touchTarget + spacing.lg, borderRadius: radius.card, backgroundColor: DARK, alignItems: 'center', justifyContent: 'center' },
  cancel: { minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
});
