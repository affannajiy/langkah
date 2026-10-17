import { Redirect, useRouter } from 'expo-router';
import { Check, CircleParking } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { walkFinish } from '../api/points';
import { rateWalk } from '../api/reports';
import { useAuth } from '../auth/AuthProvider';
import { AppText } from '../components/AppText';
import { StreetChecks } from '../features/arrival/StreetChecks';
import { formatDistance, minutes } from '../i18n/format';
import { getArrival, setArrival, setReportAfterWalk, type Arrival } from '../nav/walkStore';
import { cappedContent } from '../theme/layout';
import { colors, radius, spacing, touchTarget } from '../theme/theme';

const FACES = [1, 2, 3, 4, 5] as const;
type Rating = (typeof FACES)[number];

// Journey complete (guide Section 6.3, screen 8; docs/screens/Arrival.png).
export default function ArrivalScreen() {
  const [arrival] = useState(getArrival);
  // Opened without a finished walk (for example after a reload): back to the map.
  if (!arrival) return <Redirect href="/" />;
  return <ArrivalView arrival={arrival} />;
}

// A round face whose mouth bends from a deep frown (1) to a wide smile (5).
function Face({ level, color }: { level: Rating; color: string }) {
  const bend = (level - 3) * 2.2; // mouth curve, negative frowns
  const mouthY = 15.5 - bend / 3;
  return (
    <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round">
      <Circle cx={12} cy={12} r={10} />
      <Circle cx={8.8} cy={9.5} r={0.6} fill={color} />
      <Circle cx={15.2} cy={9.5} r={0.6} fill={color} />
      {level === 3 ? (
        <Path d="M8.5 15.5h7" />
      ) : (
        <Path d={`M8 ${mouthY} Q12 ${mouthY + bend} 16 ${mouthY}`} />
      )}
    </Svg>
  );
}

// Warning triangle with a plus: "report something new".
function TrianglePlus() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <Path d="M12 10v6M9 13h6" />
    </Svg>
  );
}

function Stat({ value, label, icon }: { value: string; label: string; icon?: ReactNode }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <View style={styles.statValue}>
        {icon}
        <AppText variant="title" color={colors.navy}>
          {value}
        </AppText>
      </View>
      <AppText variant="body" color={colors.textMuted} style={styles.center}>
        {label}
      </AppText>
    </View>
  );
}

function ArrivalView({ arrival: a }: { arrival: Arrival }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState<Rating | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const { canWrite } = useAuth();
  const left = useRef(false);
  // Walk points (guide Section 15): sent once, as soon as the screen opens.
  const finished = useRef<Promise<string | null> | null>(null);
  useEffect(() => {
    if (finished.current) return;
    finished.current = walkFinish(a.gpsM, a.durationS, a.to.name)
      .then((r) => {
        setPoints(r.points);
        return r.walk;
      })
      .catch((error: unknown) => {
        console.warn('Could not send the finished walk', error);
        return null;
      });
  }, [a]);

  // The rating is sent once, when the user leaves this screen. Optional, so a
  // failure (offline) is only logged.
  const leave = useCallback(
    (then: 'map' | 'report') => {
      if (left.current) return;
      left.current = true;
      if (rating) {
        void finished.current
          ?.then((walk) => rateWalk({ rating, mode: a.mode, kind: a.kind, score: a.score, distanceM: a.walkedM, walk }))
          .catch((error: unknown) => console.warn('Could not send the walk rating', error));
      }
      if (then === 'report') setReportAfterWalk({ at: a.to.lngLat, trail: a.trail });
      setArrival(null);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    },
    [rating, a, router],
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave('map');
      return true;
    });
    return () => sub.remove();
  }, [leave]);

  const hazards = a.avoided ?? a.warned;
  const hazardLabel = a.avoided !== null ? t('arrival.avoided', { count: hazards }) : t('arrival.flagged', { count: hazards });

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.halo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.check}>
            <Check size={56} color={colors.white} strokeWidth={3} />
          </View>
        </View>

        <View style={styles.titles}>
          <AppText variant="heading" color={colors.safeText} style={styles.center}>
            {t('arrival.arrived')}
          </AppText>
          <AppText variant="title" color={colors.navy} accessibilityRole="header" style={[styles.center, styles.place]}>
            {a.to.name}
          </AppText>
        </View>

        <View style={[styles.card, styles.stats]}>
          <Stat value={formatDistance(a.walkedM)} label={t('arrival.walked')} />
          <View style={styles.divider} />
          <Stat value={t('arrival.minutes', { count: minutes(a.durationS) })} label={t('arrival.onTheWay')} />
          <View style={styles.divider} />
          <Stat
            value={String(hazards)}
            label={hazardLabel}
            icon={
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Path d="M12 3 22 20H2z" fill={colors.hazard} stroke={colors.navy} strokeWidth={1.5} strokeLinejoin="round" />
              </Svg>
            }
          />
        </View>

        {points !== null && points > 0 && (
          <View style={[styles.card, styles.points]} accessibilityLiveRegion="polite">
            <CircleParking size={26} color={colors.interactiveText} />
            <AppText variant="bodyStrong" color={colors.text} style={styles.flex}>
              {t('points.walkEarned', { count: points })}
            </AppText>
          </View>
        )}

        <View style={[styles.card, styles.rate]}>
          <AppText variant="heading" color={colors.navy} style={styles.center} accessibilityRole="header">
            {t('arrival.rateTitle')}
          </AppText>
          <View style={styles.faces} accessibilityRole="radiogroup">
            {FACES.map((level) => {
              const on = rating === level;
              return (
                <Pressable
                  key={level}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t(`arrival.rate.${level}`)}
                  onPress={() => setRating(on ? null : level)}
                  style={[styles.face, on && styles.faceOn]}
                >
                  <Face level={level} color={on ? colors.safeText : colors.textMuted} />
                  <AppText variant="label" color={on ? colors.safeText : colors.text} style={styles.center}>
                    {t(`arrival.rate.${level}`)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <AppText variant="caption" color={colors.textMuted} style={styles.center}>
            {t('arrival.rateNote')} {t('points.rateBonus')}
          </AppText>
        </View>

        {/* Street checks need a signed-in walker, like reports (guests read only). */}
        {canWrite && a.quests.length > 0 && <StreetChecks quests={a.quests} />}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => leave('report')}
          style={({ pressed }) => [styles.button, styles.spot, pressed && styles.pressed]}
        >
          <TrianglePlus />
          <AppText variant="bodyStrong" color={colors.navy}>
            {t('arrival.spot')}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => leave('map')}
          style={({ pressed }) => [styles.button, styles.done, pressed && styles.pressed]}
        >
          <AppText variant="bodyStrong" color={colors.white}>
            {t('nav.done')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  content: {
    ...cappedContent, alignItems: 'stretch', gap: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.lg },
  halo: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.safeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.safe, alignItems: 'center', justifyContent: 'center' },
  titles: { gap: spacing.xs },
  place: { fontSize: 30, lineHeight: 36 },
  center: { textAlign: 'center' },
  card: { backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border },
  stats: { flexDirection: 'row', paddingVertical: spacing.md },
  stat: { flex: 1, alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  statValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  divider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  rate: { padding: spacing.md, gap: spacing.md },
  points: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  flex: { flex: 1 },
  faces: { flexDirection: 'row', justifyContent: 'space-between' },
  face: {
    flex: 1,
    minHeight: touchTarget + spacing.xxl,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  faceOn: { borderColor: colors.safe, backgroundColor: colors.safeSoft },
  actions: { gap: spacing.sm, paddingTop: spacing.sm },
  button: {
    minHeight: touchTarget + spacing.md,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  spot: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.navy },
  done: { backgroundColor: colors.navy },
  pressed: { opacity: 0.85 },
});
