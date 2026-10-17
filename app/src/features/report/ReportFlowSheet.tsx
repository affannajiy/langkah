import type { LngLat } from '@maplibre/maplibre-react-native';
import { Camera, Check, ChevronLeft, Image as ImageIcon, Lightbulb, MapPin, TriangleAlert, X, type LucideProps } from 'lucide-react-native';
import { useEffect, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createReport, preparePhoto, ReportError, uploadPhoto } from '../../api/reports';
import {
  HAZARD_CATEGORIES,
  IMPROVEMENT_CATEGORIES,
  type HazardCategory,
  type ImprovementCategory,
  type ReportKind,
} from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { useSideInset } from '../../theme/layout';
import { colors, fontFamily, radius, shadow, spacing, touchTarget, type as typeScale } from '../../theme/theme';
import { categoryKey, HAZARD_ICONS, IMPROVEMENT_ICONS } from './categoryIcons';
import { pickPhoto } from './pickPhoto';

export type ReportStep = 1 | 2 | 3 | 4;
const STEPS = ['type', 'category', 'place', 'details'] as const;
const NOTE_MAX = 500;

type Props = {
  pin: LngLat | null; // the map point under the centre pin (step 3)
  street: string | null;
  onStep: (step: ReportStep) => void;
  onHeight: (h: number) => void;
  onClose: () => void;
  onDone: (message: string) => void;
};

// Report flow (guide Section 6.3, screen 6; docs/screens/ReportFlow.png): four short
// steps in a sheet. Step 3 shrinks the sheet so the user can move the map under a pin.
// Sign-in is asked for only at Submit.
export function ReportFlowSheet({ pin, street, onStep, onHeight, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const side = useSideInset();
  const { requireSignIn } = useAuth();

  const [step, setStep] = useState<ReportStep>(1);
  const [kind, setKind] = useState<ReportKind>('hazard');
  const [category, setCategory] = useState<HazardCategory | ImprovementCategory | null>(null);
  const [anonymous, setAnonymous] = useState(true);
  const [photo, setPhoto] = useState<{ uri: string; width: number } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onStep(step), [step, onStep]);

  function back() {
    if (busy) return;
    if (step === 1) onClose();
    else setStep((s) => (s - 1) as ReportStep);
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  });

  async function pick(from: 'camera' | 'library') {
    setError(null);
    const picked = await pickPhoto(from);
    if (picked === 'denied') setError(t('report.cameraDenied'));
    else if (picked) setPhoto(picked);
  }

  async function submit() {
    if (!category || !pin || busy) return;
    setError(null);
    const allowed = await requireSignIn('report');
    if (!allowed) return;
    setBusy(true);
    try {
      let photoPath: string | null = null;
      if (photo) photoPath = await uploadPhoto(await preparePhoto(photo.uri, photo.width));
      await createReport({ kind, category, at: pin, note, photoPath, anonymous });
      onDone(
        kind === 'improvement'
          ? t('report.doneImprovement')
          : photoPath
            ? t('report.doneHazardPhoto')
            : t('report.doneHazard'),
      );
    } catch (e) {
      const code = e instanceof ReportError ? e.code : 'network';
      setError(t(`report.error.${code}`, { defaultValue: t('report.error.network') }));
    } finally {
      setBusy(false);
    }
  }

  const categories = kind === 'hazard' ? HAZARD_CATEGORIES : IMPROVEMENT_CATEGORIES;
  const icons: Record<string, ComponentType<LucideProps>> = kind === 'hazard' ? HAZARD_ICONS : IMPROVEMENT_ICONS;
  const compact = step === 3;

  return (
    <View
      style={[styles.sheet, { left: side, right: side, paddingBottom: insets.bottom + spacing.md, maxHeight: screenH - insets.top - spacing.xxl }]}
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
    >
      <View style={styles.handle} />
      <View style={styles.header}>
        {step > 1 && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('report.back')} onPress={back} style={styles.round}>
            <ChevronLeft size={24} color={colors.navy} />
          </Pressable>
        )}
        <AppText variant="label" color={colors.textMuted} style={styles.flex}>
          {t('report.stepOf', { step })}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('report.close')} onPress={onClose} disabled={busy} style={styles.round}>
          <X size={24} color={colors.navy} />
        </Pressable>
      </View>

      {!compact && (
        <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 4, now: step }}>
          {STEPS.map((s, i) => (
            <View key={s} style={styles.progressItem}>
              <View style={[styles.bar, i < step && styles.barOn]} />
              <AppText variant={i + 1 === step ? 'bodyStrong' : 'caption'} color={i + 1 === step ? colors.navy : colors.textMuted}>
                {t(`report.steps.${s}`)}
              </AppText>
            </View>
          ))}
        </View>
      )}

      <ScrollView style={styles.flexShrink} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <>
            <AppText variant="title" color={colors.navy} accessibilityRole="header">
              {t('report.typeTitle')}
            </AppText>
            {(['hazard', 'improvement'] as const).map((k) => {
              const on = kind === k;
              const hazard = k === 'hazard';
              return (
                <Pressable
                  key={k}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    if (kind !== k) setCategory(null);
                    setKind(k);
                  }}
                  style={[styles.kindCard, on && (hazard ? styles.kindOnHazard : styles.kindOnImprovement)]}
                >
                  <View style={[styles.kindIcon, { backgroundColor: hazard ? colors.hazard : colors.communitySoft }]}>
                    {hazard ? (
                      <TriangleAlert size={32} color={colors.text} strokeWidth={2.25} />
                    ) : (
                      <Lightbulb size={30} color={colors.communityText} />
                    )}
                  </View>
                  <View style={styles.flex}>
                    <AppText variant="heading" color={colors.text}>
                      {t(`report.kind.${k}.title`)}
                    </AppText>
                    <AppText variant="body" color={colors.textMuted}>
                      {t(`report.kind.${k}.body`)}
                    </AppText>
                    <View style={[styles.tag, { backgroundColor: hazard ? colors.hazardSoft : colors.communitySoft }]}>
                      <AppText variant="label" color={hazard ? colors.hazardText : colors.communityText}>
                        {t(`report.kind.${k}.tag`)}
                      </AppText>
                    </View>
                  </View>
                  <View style={[styles.radio, on && { backgroundColor: hazard ? colors.hazard : colors.community, borderColor: 'transparent' }]}>
                    {on && <Check size={18} color={hazard ? colors.text : colors.white} strokeWidth={3} />}
                  </View>
                </Pressable>
              );
            })}
            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong" color={colors.text}>
                  {t('report.anonymous')}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {t('report.anonymousHint')}
                </AppText>
              </View>
              <Switch
                accessibilityLabel={t('report.anonymous')}
                value={anonymous}
                onValueChange={setAnonymous}
                trackColor={{ true: colors.safe, false: colors.border }}
                thumbColor={colors.white}
              />
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <AppText variant="title" color={colors.navy} accessibilityRole="header">
              {t(`report.categoryTitle.${kind}`)}
            </AppText>
            <View style={styles.grid}>
              {categories.map((c) => {
                const Icon = icons[c] ?? Camera;
                const on = category === c;
                return (
                  <Pressable
                    key={c}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setCategory(c)}
                    style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && styles.pressed]}
                  >
                    {on && (
                      <View style={styles.tileCheck}>
                        <Check size={16} color={colors.white} strokeWidth={3} />
                      </View>
                    )}
                    <Icon size={30} color={colors.navy} />
                    <AppText variant="bodyStrong" color={colors.text} style={styles.center}>
                      {t(categoryKey(kind, c))}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <AppText variant="heading" color={colors.navy} accessibilityRole="header">
              {t('report.placeTitle')}
            </AppText>
            <View style={styles.placeRow}>
              <MapPin size={20} color={colors.interactiveText} />
              <AppText variant="body" color={colors.text} style={styles.flex} accessibilityLiveRegion="polite">
                {!pin ? t('report.placeWaiting') : street ? t('report.placeStreet', { street }) : t('report.placeNoStreet')}
              </AppText>
            </View>
            <AppText variant="caption" color={colors.textMuted}>
              {t('report.placeHint')}
            </AppText>
          </>
        )}

        {step === 4 && (
          <>
            <AppText variant="title" color={colors.navy} accessibilityRole="header">
              {t('report.detailsTitle')}
            </AppText>
            {photo ? (
              <View style={styles.photoRow}>
                <Image source={{ uri: photo.uri }} style={styles.photo} accessibilityIgnoresInvertColors />
                <Button kind="secondary" label={t('report.removePhoto')} onPress={() => setPhoto(null)} />
              </View>
            ) : (
              <View style={styles.photoButtons}>
                <Pressable accessibilityRole="button" onPress={() => pick('camera')} style={styles.photoButton}>
                  <Camera size={26} color={colors.navy} />
                  <AppText variant="bodyStrong" color={colors.navy}>
                    {t('report.takePhoto')}
                  </AppText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => pick('library')} style={styles.photoButton}>
                  <ImageIcon size={26} color={colors.navy} />
                  <AppText variant="bodyStrong" color={colors.navy}>
                    {t('report.choosePhoto')}
                  </AppText>
                </Pressable>
              </View>
            )}
            <AppText variant="caption" color={colors.textMuted}>
              {kind === 'hazard' ? t('report.photoHintHazard') : t('report.photoHintImprovement')}
            </AppText>
            <TextInput
              accessibilityLabel={t('report.noteLabel')}
              placeholder={t('report.notePlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={(v) => setNote(v.slice(0, NOTE_MAX))}
              maxLength={NOTE_MAX}
              multiline
              style={styles.note}
            />
            <AppText variant="caption" color={colors.textMuted} style={styles.right}>
              {t('report.noteCount', { count: note.length, max: NOTE_MAX })}
            </AppText>
          </>
        )}

        {error && (
          <AppText variant="label" color={colors.hazardText} accessibilityLiveRegion="polite">
            {error}
          </AppText>
        )}
      </ScrollView>

      {busy ? (
        <View style={styles.busy} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.navy} />
          <AppText variant="bodyStrong" color={colors.navy}>
            {t('report.sending')}
          </AppText>
        </View>
      ) : step === 4 ? (
        <Button label={t('report.submit')} onPress={submit} />
      ) : (
        <Button
          label={t('report.continue')}
          onPress={() => {
            if (step === 2 && !category) {
              setError(t('report.pickCategory'));
              return;
            }
            if (step === 3 && !pin) return;
            setError(null);
            setStep((s) => (s + 1) as ReportStep);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
    ...shadow.floating,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.handle },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  round: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
  progress: { flexDirection: 'row', gap: spacing.sm },
  progressItem: { flex: 1, gap: spacing.sm },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.neutralBadge },
  barOn: { backgroundColor: colors.navy },
  content: { gap: spacing.md, paddingBottom: spacing.xs },
  kindCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  kindOnHazard: { borderWidth: 2, borderColor: colors.hazard, backgroundColor: colors.hazardSoft },
  kindOnImprovement: { borderWidth: 2, borderColor: colors.community, backgroundColor: colors.communitySoft },
  kindIcon: { width: 56, height: 56, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  tag: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.sm + 4, paddingVertical: 2, marginTop: spacing.sm },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touchTarget },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48.5%',
    minHeight: 96,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  tileOn: { borderWidth: 2, borderColor: colors.navy, backgroundColor: colors.interactiveSoft },
  tileCheck: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photoButtons: { flexDirection: 'row', gap: spacing.sm },
  photoButton: {
    flex: 1,
    minHeight: 88,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photo: { width: 120, height: 90, borderRadius: radius.card, backgroundColor: colors.surface },
  note: {
    minHeight: 96,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    textAlignVertical: 'top',
    color: colors.text,
    fontFamily,
    ...typeScale.body,
  },
  busy: { minHeight: touchTarget + spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
