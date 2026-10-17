import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, MapPin, Play, Route, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, BackHandler, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth, type SignInResult } from '../auth/AuthProvider';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { ENGLISH_ONLY, setLanguage } from '../i18n';
import { updateSettings, type Language } from '../storage/settings';
import { cappedContent } from '../theme/layout';
import { colors, radius, spacing, touchTarget } from '../theme/theme';

const MARK = require('../../assets/brand/splash-mark-white-512.png');

// First launch only (guide Section 5.2, screens 2 and 3; Section 5.5 step 1;
// Section 15 for the account step): language, then how to start (Google, guest or
// the demo; docs/screens/Welcome.png), then why Langkah needs location, then
// Android's permission prompt.
export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // English only: skip the language step and start at how to start.
  const firstStep = ENGLISH_ONLY ? 2 : 1;
  const [step, setStep] = useState<1 | 2 | 3>(firstStep);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > firstStep) {
        setStep(step === 3 ? 2 : 1);
        return true;
      }
      return false; // leave the app, as on any first screen
    });
    return () => sub.remove();
  }, [step, firstStep]);

  function pick(language: Language) {
    setLanguage(language);
    setStep(2);
  }

  function finish() {
    updateSettings({ onboarded: true, locationAsked: true });
    router.replace('/');
  }

  async function allow() {
    if (asking) return;
    setAsking(true);
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch (error) {
      console.warn('Location permission request failed', error);
    }
    // Allowed or not, the map works; it explains again from the recentre button.
    finish();
  }

  if (step === 2) return <AccountStep onDone={() => setStep(3)} />;

  const reasons: { icon: LucideIcon; text: string }[] = [
    { icon: Route, text: t('welcome.reasonRoute') },
    { icon: TriangleAlert, text: t('welcome.reasonHazard') },
    { icon: MapPin, text: t('welcome.reasonReport') },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.top}>
        {step === 3 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => setStep(2)} style={styles.back}>
            <ChevronLeft size={26} color={colors.navy} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <View style={styles.dots} accessible accessibilityLabel={t('welcome.stepOf', { step: step - firstStep + 1 })}>
          {!ENGLISH_ONLY && <View style={[styles.dot, styles.dotOn]} />}
          <View style={[styles.dot, step >= 2 && styles.dotOn]} />
          <View style={[styles.dot, step === 3 && styles.dotOn]} />
        </View>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.mark}>
          <Image source={MARK} style={styles.markImage} accessibilityIgnoresInvertColors />
        </View>

        {step === 1 ? (
          <>
            {/* Shown before a language is chosen, so each line is in its own language. */}
            <View style={styles.titles}>
              <AppText variant="title" color={colors.navy} accessibilityRole="header" style={styles.center}>
                {t('welcome.chooseTitle', { lng: 'en' })}
              </AppText>
              <AppText variant="heading" color={colors.textMuted} style={styles.center}>
                {t('welcome.chooseTitle', { lng: 'ms' })}
              </AppText>
            </View>
            <LanguageCard title={t('settings.langName', { lng: 'en' })} body={t('welcome.useIn', { lng: 'en' })} onPress={() => pick('en')} />
            <LanguageCard title={t('settings.langName', { lng: 'ms' })} body={t('welcome.useIn', { lng: 'ms' })} onPress={() => pick('ms')} />
          </>
        ) : (
          <>
            <View style={styles.titles}>
              <AppText variant="title" color={colors.navy} accessibilityRole="header" style={styles.center}>
                {t('welcome.locationTitle')}
              </AppText>
              <AppText variant="body" color={colors.textMuted} style={styles.center}>
                {t('welcome.pitch')}
              </AppText>
            </View>
            <View style={styles.card}>
              {reasons.map(({ icon: Icon, text }) => (
                <View key={text} style={styles.reason}>
                  <View style={styles.reasonIcon}>
                    <Icon size={24} color={colors.navy} />
                  </View>
                  <AppText variant="body" color={colors.text} style={styles.flex}>
                    {text}
                  </AppText>
                </View>
              ))}
            </View>
            <AppText variant="caption" color={colors.textMuted} style={styles.center}>
              {t('welcome.privacy')}
            </AppText>
          </>
        )}
      </ScrollView>

      {step === 3 && (
        <View style={styles.actions}>
          <Button label={asking ? t('welcome.asking') : t('location.allow')} onPress={allow} />
          <Button kind="secondary" label={t('location.notNow')} onPress={finish} />
        </View>
      )}
    </View>
  );
}

// How to start: Google, guest, or the demo account while the server allows it.
function AccountStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { demo, signInGoogle, startDemo } = useAuth();
  const [busy, setBusy] = useState<'google' | 'demo' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function google() {
    if (busy) return;
    setBusy('google');
    setError(null);
    const result: SignInResult = await signInGoogle();
    setBusy(null);
    if (result === 'ok') onDone();
    else if (result !== 'cancelled') setError(t(`signIn.error.${result}`));
  }

  async function tryDemo() {
    if (busy) return;
    setBusy('demo');
    setError(null);
    const ok = await startDemo();
    setBusy(null);
    if (ok) onDone();
    else setError(t('signIn.error.demo'));
  }

  return (
    <View style={[styles.navyRoot, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.md }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.navyContent}>
        <Image source={MARK} style={styles.navyMark} accessibilityIgnoresInvertColors />
        <View style={styles.titles}>
          <AppText variant="instruction" color={colors.white} style={[styles.center, styles.wordmark]} accessibilityRole="header">
            {t('brand.name')}
          </AppText>
          <AppText variant="body" color={colors.onNavyAccent} style={[styles.center, styles.tagline]}>
            {t('brand.tagline')}
          </AppText>
        </View>
        <View style={styles.titles}>
          <AppText variant="title" color={colors.white} style={styles.center}>
            {t('account.headline')}
          </AppText>
          <AppText variant="body" color={colors.onNavyAccent} style={styles.center}>
            {t('account.body')}
          </AppText>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        {error && (
          <AppText variant="label" color={colors.white} style={styles.center} accessibilityLiveRegion="polite">
            {error}
          </AppText>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: busy === 'google', disabled: !!busy }}
          onPress={google}
          style={({ pressed }) => [styles.pill, styles.pillWhite, pressed && styles.pressed]}
        >
          {busy === 'google' && <ActivityIndicator color={colors.navy} />}
          <AppText variant="bodyStrong" color={colors.navy}>
            {t('signIn.google')}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!!busy}
          onPress={onDone}
          style={({ pressed }) => [styles.pill, styles.pillOutline, pressed && styles.pressed]}
        >
          <AppText variant="bodyStrong" color={colors.white}>
            {t('account.guest')}
          </AppText>
        </Pressable>
        {demo.available && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: busy === 'demo', disabled: !!busy }}
              onPress={tryDemo}
              style={({ pressed }) => [styles.demoLink, pressed && styles.pressed]}
            >
              {busy === 'demo' ? <ActivityIndicator color={colors.onNavyAccent} /> : <Play size={22} color={colors.onNavyAccent} />}
              <AppText variant="bodyStrong" color={colors.onNavyAccent}>
                {t('account.demo')}
              </AppText>
            </Pressable>
            <AppText variant="caption" color={colors.onNavyAccent} style={styles.center}>
              {t('account.demoNote')}
            </AppText>
          </>
        )}
      </View>
    </View>
  );
}

function LanguageCard({ title, body, onPress }: { title: string; body: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.language, pressed && styles.pressed]}>
      <AppText variant="heading" color={colors.navy}>
        {title}
      </AppText>
      <AppText variant="body" color={colors.textMuted}>
        {body}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: spacing.sm },
  dot: { width: 24, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.navy },
  content: {
    ...cappedContent, gap: spacing.lg, paddingVertical: spacing.xl },
  mark: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: radius.sheet + 8,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markImage: { width: 64, height: 64 },
  titles: { gap: spacing.sm },
  center: { textAlign: 'center' },
  language: {
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
    minHeight: touchTarget * 2,
    justifyContent: 'center',
  },
  card: { backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  reason: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reasonIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.interactiveSoft, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  actions: { gap: spacing.sm },
  navyRoot: { flex: 1, backgroundColor: colors.navy, paddingHorizontal: spacing.lg },
  navyContent: { ...cappedContent, gap: spacing.xl, paddingVertical: spacing.xl, alignItems: 'center' },
  navyMark: { width: 96, height: 96 },
  wordmark: { fontSize: 44, lineHeight: 52 },
  tagline: { fontSize: 20, lineHeight: 28 },
  pill: {
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: touchTarget + spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillWhite: { backgroundColor: colors.white },
  pillOutline: { borderWidth: 2, borderColor: colors.white },
  demoLink: { flexDirection: 'row', gap: spacing.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
});
