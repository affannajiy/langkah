import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import i18n, { ENGLISH_ONLY, setLanguage } from '../i18n';
import { layerRows } from '../features/map/LayersSheet';
import { updateSettings, useSettings, type Language } from '../storage/settings';
import { cappedContent } from '../theme/layout';
import { colors, radius, spacing, touchTarget } from '../theme/theme';

const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

// Settings (guide Section 5.2, screen 18): language, automatic day and night, alert
// vibration, map layers, privacy notice and credits. The demo now lives in the
// welcome screen and the Me tab (Phase 10).
export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const language: Language = i18n.language === 'ms' ? 'ms' : 'en';

  const layers = layerRows(t);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={styles.back}>
          <ChevronLeft size={26} color={colors.navy} />
        </Pressable>
        <AppText variant="title" color={colors.navy} accessibilityRole="header">
          {t('settings.title')}
        </AppText>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        {!ENGLISH_ONLY && (
          <Section title={t('settings.language')}>
            <View style={styles.choices} accessibilityRole="radiogroup">
              {(['en', 'ms'] as const).map((code) => {
                const on = language === code;
                return (
                  <Pressable
                    key={code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setLanguage(code)}
                    style={[styles.choice, on && styles.choiceOn]}
                  >
                    <AppText variant="bodyStrong" color={on ? colors.navy : colors.text}>
                      {t('settings.langName', { lng: code })}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </Section>
        )}

        <Section title={t('settings.walking')}>
          <SwitchRow
            label={t('settings.autoNight')}
            body={t('settings.autoNightBody')}
            value={settings.autoNight}
            onChange={(autoNight) => updateSettings({ autoNight })}
          />
          <SwitchRow
            label={t('settings.vibration')}
            body={t('settings.vibrationBody')}
            value={settings.vibration}
            onChange={(vibration) => updateSettings({ vibration })}
          />
        </Section>

        <Section title={t('layers.title')}>
          {layers.map((r) => (
            <SwitchRow
              key={r.key}
              label={r.label}
              value={settings.layers[r.key]}
              onChange={(v) => updateSettings({ layers: { ...settings.layers, [r.key]: v } })}
            />
          ))}
          <AppText variant="caption" color={colors.textMuted}>
            {t('layers.note')}
          </AppText>
        </Section>

        <Section title={t('settings.privacy')}>
          <AppText color={colors.text}>{t('settings.privacyLocation')}</AppText>
          <AppText color={colors.text}>{t('settings.privacyReports')}</AppText>
          <AppText color={colors.text}>{t('settings.privacyPhotos')}</AppText>
          <AppText color={colors.text}>{t('settings.privacyRatings')}</AppText>
        </Section>

        <Section title={t('settings.about')}>
          <AppText color={colors.text}>{t('settings.version', { version: Constants.expoConfig?.version ?? '' })}</AppText>
          <AppText color={colors.text}>{t('settings.credits')}</AppText>
          <AppText color={colors.text}>{t('settings.photoCredits')}</AppText>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(OSM_COPYRIGHT)} style={styles.link}>
            <AppText variant="bodyStrong" color={colors.interactiveText}>
              {t('settings.osm')}
            </AppText>
          </Pressable>
        </Section>
      </ScrollView>

    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="heading" color={colors.navy} accessibilityRole="header">
        {title}
      </AppText>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function SwitchRow(p: { label: string; body?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" color={colors.text}>
          {p.label}
        </AppText>
        {p.body && (
          <AppText variant="caption" color={colors.textMuted}>
            {p.body}
          </AppText>
        )}
      </View>
      <Switch
        accessibilityLabel={p.label}
        value={p.value}
        onValueChange={p.onChange}
        trackColor={{ true: colors.interactive, false: colors.border }}
        thumbColor={colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  back: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  content: {
    ...cappedContent, padding: spacing.md, gap: spacing.lg },
  section: { gap: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  choices: { flexDirection: 'row', gap: spacing.sm },
  choice: {
    flex: 1,
    minHeight: touchTarget + spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceOn: { borderWidth: 2, borderColor: colors.navy, backgroundColor: colors.interactiveSoft },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touchTarget },
  flex: { flex: 1, gap: 2 },
  link: { minHeight: touchTarget, justifyContent: 'center' },
});
