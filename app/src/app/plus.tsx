import { useFocusEffect, useRouter } from 'expo-router';
import { Check, ChevronLeft, Clock, ShieldCheck } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cosmeticUse, myWallet, plusBuy, pointsErrorCode, type Wallet } from '../api/points';
import { AppText } from '../components/AppText';
import { ScrimSheet } from '../components/ScrimSheet';
import { Snackbar, useSnackbar } from '../components/Snackbar';
import { LowPointsBody } from '../features/points/LowPointsSheet';
import { useOpenTopUp } from '../features/points/useOpenTopUp';
import { formatPoints, shortDate } from '../i18n/format';
import { MAX_STARRED_PLUS } from '../storage/places';
import { cappedContent } from '../theme/layout';
import { colors, radius, spacing, touchTarget } from '../theme/theme';

const PRICE = 690;

// Langkah Plus (guide Section 15.2; docs/screens/Plus.png). 690 points for 30 days,
// no auto-renew. Perks: more starred places, the gold frame and Plus badge. Live
// walk share comes later. Routes, alerts and reports are never behind Plus, and
// Plus never sells points.
export default function PlusScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();
  const openTopUp = useOpenTopUp();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [low, setLow] = useState(false);

  const load = useCallback(() => {
    myWallet()
      .then(setWallet)
      .catch((e: unknown) => console.warn('Could not load the wallet', e));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const on = wallet?.plusUntil != null;

  function buy() {
    if (!wallet || busy) return;
    if (wallet.balance < PRICE) {
      setLow(true);
      return;
    }
    // Spending points cannot be undone, so a dialog (guide Section 5.3).
    Alert.alert(on ? t('plus.extendTitle') : t('plus.confirmTitle'), t('plus.confirmBody', { cost: formatPoints(PRICE) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('plus.confirm'),
        onPress: async () => {
          setBusy(true);
          try {
            const r = await plusBuy();
            // First time: put on the gold frame and badge, unless something is already worn.
            if (!on) {
              if (!wallet.frame) await cosmeticUse('frame', 'plus_frame').catch(() => undefined);
              if (!wallet.badge) await cosmeticUse('badge', 'plus_badge').catch(() => undefined);
            }
            snackbar.show({ text: t('plus.done', { date: shortDate(r.until) }) });
            load();
          } catch (e) {
            const code = pointsErrorCode(e);
            snackbar.show({ text: t(`shop.error.${code}`, { defaultValue: t('shop.error.network') }) });
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  const perks = [
    { title: t('plus.perkShare'), body: t('plus.perkShareBody'), later: true },
    { title: t('plus.perkPlaces'), body: t('plus.perkPlacesBody', { count: MAX_STARRED_PLUS }), later: false },
    { title: t('plus.perkBadge'), body: t('plus.perkBadgeBody'), later: false },
  ];

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={styles.back}>
          <ChevronLeft size={28} color={colors.white} />
        </Pressable>
        <View style={styles.heroTitle}>
          <AppText color={colors.white} style={styles.big} accessibilityRole="header">
            Langkah
          </AppText>
          <View style={styles.plusChip}>
            <AppText variant="heading" color={colors.text}>
              Plus
            </AppText>
          </View>
        </View>
        <AppText color={colors.onNavyAccent} style={styles.heroBody}>
          {t('plus.tagline')}
        </AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {on && wallet?.plusUntil && (
          <View style={styles.active} accessibilityLiveRegion="polite">
            <Check size={22} color={colors.safeText} />
            <AppText variant="bodyStrong" color={colors.safeText} style={styles.flex}>
              {t('plus.activeUntil', { date: shortDate(wallet.plusUntil) })}
            </AppText>
          </View>
        )}
        {perks.map((p) => (
          <View key={p.title} style={styles.perk} accessible>
            <View style={styles.perkIcon}>
              {p.later ? <Clock size={24} color={colors.textMuted} /> : <Check size={24} color={colors.interactiveText} />}
            </View>
            <View style={styles.flex}>
              <AppText variant="heading" color={colors.navy}>
                {p.title}
              </AppText>
              <AppText color={colors.textMuted}>{p.body}</AppText>
              {p.later && (
                <View style={styles.laterChip}>
                  <AppText variant="label" color={colors.textMuted}>
                    {t('plus.later')}
                  </AppText>
                </View>
              )}
            </View>
          </View>
        ))}
        <View style={styles.free}>
          <ShieldCheck size={24} color={colors.safeText} />
          <AppText variant="bodyStrong" color={colors.safeText} style={styles.flex}>
            {t('plus.free')}
          </AppText>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.priceRow}>
          <AppText color={colors.textMuted}>{t('plus.month')}</AppText>
          <AppText variant="title" color={colors.navy}>
            {t('topup.points', { value: formatPoints(PRICE) })}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!wallet || busy}
          onPress={buy}
          style={({ pressed }) => [styles.primary, (!wallet || busy) && styles.disabled, pressed && styles.pressed]}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <AppText variant="heading" color={colors.white}>
              {on ? t('plus.extend', { cost: formatPoints(PRICE) }) : t('plus.get', { cost: formatPoints(PRICE) })}
            </AppText>
          )}
        </Pressable>
        {wallet && (
          <AppText variant="caption" color={colors.textMuted} style={styles.center}>
            {t('plus.youHave', { value: formatPoints(wallet.balance) })}
          </AppText>
        )}
      </View>

      <ScrimSheet visible={low} onClose={() => setLow(false)}>
        {wallet && (
          <LowPointsBody
            need={{ item: t('plus.itemName'), cost: PRICE, have: wallet.balance }}
            adsLeft={wallet.adsLeft}
            checkinDay={wallet.checkin.day}
            onAd={() => {
              setLow(false);
              router.push('/ad');
            }}
            onTopUp={() => {
              setLow(false);
              void openTopUp();
            }}
            onClose={() => setLow(false)}
          />
        )}
      </ScrimSheet>

      <Snackbar message={snackbar.message} onHide={snackbar.hide} bottom={insets.bottom + spacing.md} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  hero: { backgroundColor: colors.navy, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  back: { width: touchTarget, height: touchTarget, marginLeft: -spacing.sm, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  big: { fontSize: 44, lineHeight: 52, fontWeight: '700' },
  plusChip: { backgroundColor: colors.hazard, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  heroBody: { fontSize: 18, lineHeight: 26 },
  content: { ...cappedContent, padding: spacing.md, gap: spacing.md },
  active: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.safeSoft, borderRadius: radius.card, padding: spacing.md },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  perkIcon: { width: 52, height: 52, borderRadius: radius.card, backgroundColor: colors.interactiveSoft, alignItems: 'center', justifyContent: 'center' },
  laterChip: { alignSelf: 'flex-start', backgroundColor: colors.neutralBadge, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, marginTop: spacing.xs },
  free: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.safeSoft, borderRadius: radius.card, padding: spacing.md },
  footer: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, gap: spacing.sm },
  priceRow: { ...cappedContent, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  primary: { ...cappedContent, minHeight: touchTarget + spacing.md, borderRadius: radius.pill, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
