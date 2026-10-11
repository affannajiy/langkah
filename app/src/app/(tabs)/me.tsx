import { CloudUpload, ShieldCheck, UserRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthProvider';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { queuedCount, subscribeQueue } from '../../storage/reportQueue';
import { colors, radius, spacing } from '../../theme/theme';

// Phase 5 adds only the account card (sign in, sign out, what is waiting to send),
// needed to test with two accounts. My reports, saved places and stats are Phase 6.
export default function MeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { isFull, name, requireSignIn, signOut } = useAuth();
  const [waiting, setWaiting] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    queuedCount().then(setWaiting);
    return subscribeQueue(setWaiting);
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <AppText variant="title" color={colors.navy} accessibilityRole="header" style={styles.bigTitle}>
        {t('me.title')}
      </AppText>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: isFull ? colors.safeSoft : colors.neutralBadge }]}>
            {isFull ? <ShieldCheck size={28} color={colors.safeText} /> : <UserRound size={28} color={colors.textMuted} />}
          </View>
          <View style={styles.flex}>
            <AppText variant="heading" color={colors.text}>
              {isFull ? (name ? t('me.signedInAs', { name }) : t('me.signedIn')) : t('me.guest')}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {isFull ? t('me.signedInBody') : t('me.guestBody')}
            </AppText>
          </View>
        </View>

        {waiting > 0 && (
          <View style={styles.row} accessibilityLiveRegion="polite">
            <CloudUpload size={22} color={colors.interactiveText} />
            <AppText variant="label" color={colors.text} style={styles.flex}>
              {t('me.waiting', { count: waiting })}
            </AppText>
          </View>
        )}

        {isFull ? (
          <Button
            kind="secondary"
            label={busy ? t('me.signingOut') : t('me.signOut')}
            onPress={async () => {
              if (busy) return;
              setBusy(true);
              await signOut();
              setBusy(false);
            }}
          />
        ) : (
          <Button label={t('me.signIn')} onPress={() => void requireSignIn('me')} />
        )}
      </View>

      <AppText variant="body" color={colors.textMuted} style={styles.later}>
        {t('me.empty')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.md, gap: spacing.md },
  bigTitle: { fontSize: 32, lineHeight: 40 },
  card: { backgroundColor: colors.white, borderRadius: radius.sheet, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 56, height: 56, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  later: { paddingHorizontal: spacing.xs },
});
