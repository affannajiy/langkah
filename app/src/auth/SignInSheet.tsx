import { Shield } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '../components/AppText';
import { Sheet } from '../components/Sheet';
import { colors, radius, spacing, touchTarget } from '../theme/theme';
import type { SignInResult } from './AuthProvider';

export type SignInReason = 'report' | 'vote' | 'queue' | 'me' | 'topup';

type Props = {
  reason: SignInReason | null;
  showDemo: boolean; // the server's demo switch is on and this is a plain guest
  onSignIn: () => Promise<SignInResult>;
  onDemo: () => Promise<boolean>;
  onClose: () => void;
};

// The standard four-colour Google "G", as Google's sign-in button guidelines ask.
function GoogleG() {
  return (
    <Svg width={22} height={22} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

// "Sign in so others can trust your report" (guide Section 5.2, screen 12;
// docs/screens/SignInSheet.png). A sheet, never a dialog, and only when the user tries
// to write or top up. Three choices: Google, the demo account (while the server's
// demo switch is on) and Not now.
export function SignInSheet({ reason, showDemo, onSignIn, onDemo, onClose }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Exclude<SignInResult, 'ok' | 'cancelled'> | 'demo' | null>(null);
  const visible = reason !== null;

  useEffect(() => {
    if (visible) setError(null);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy) onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, busy, onClose]);

  async function signIn() {
    setBusy(true);
    setError(null);
    const result = await onSignIn();
    setBusy(false);
    if (result !== 'ok' && result !== 'cancelled') setError(result);
  }

  async function demo() {
    setBusy(true);
    setError(null);
    const ok = await onDemo();
    setBusy(false);
    if (!ok) setError('demo');
  }

  const title = reason === 'vote' ? t('signIn.titleVote') : reason === 'topup' ? t('signIn.titleTopup') : t('signIn.title');

  return (
    <>
      {visible && (
        <Pressable
          style={styles.scrim}
          accessibilityRole="button"
          accessibilityLabel={t('signIn.notNow')}
          onPress={busy ? undefined : onClose}
        />
      )}
      <Sheet visible={visible}>
        <View style={[styles.body, { paddingBottom: insets.bottom }]}>
          <View style={styles.icon}>
            <Shield size={30} color={colors.interactiveText} />
          </View>
          <AppText variant="title" color={colors.navy} accessibilityRole="header">
            {title}
          </AppText>
          <AppText variant="body" color={colors.textMuted}>
            {t(`signIn.body.${reason ?? 'report'}`)}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {t('signIn.privacy')}
          </AppText>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={signIn}
            style={({ pressed }) => [styles.google, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <View style={styles.gBadge}>
                <GoogleG />
              </View>
            )}
            <AppText variant="bodyStrong" color={colors.white}>
              {t('signIn.google')}
            </AppText>
          </Pressable>

          {showDemo && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy, disabled: busy }}
              disabled={busy}
              onPress={demo}
              style={({ pressed }) => [styles.demo, pressed && styles.pressed]}
            >
              <AppText variant="bodyStrong" color={colors.navy}>
                {t('signIn.demo')}
              </AppText>
            </Pressable>
          )}

          {error && (
            <AppText variant="label" color={colors.hazardText} accessibilityLiveRegion="polite">
              {t(`signIn.error.${error}`)}
            </AppText>
          )}

          <Pressable accessibilityRole="button" onPress={onClose} disabled={busy} style={styles.notNow}>
            <AppText variant="bodyStrong" color={colors.interactiveText}>
              {t('signIn.notNow')}
            </AppText>
          </Pressable>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  body: { gap: spacing.md },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.interactiveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    minHeight: touchTarget + spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
  },
  gBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  demo: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget + spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.navy,
    backgroundColor: colors.white,
  },
  notNow: { minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
});
