import { Redirect, useRouter } from 'expo-router';
import { Check, ChevronDown, CircleParking, CloudOff } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { walkFinish } from '../api/points';
import { randomId, rateWalk } from '../api/reports';
import { useAuth } from '../auth/AuthProvider';
import { AppText } from '../components/AppText';
import { Snackbar, useSnackbar } from '../components/Snackbar';
import { StreetChecks } from '../features/arrival/StreetChecks';
import { formatDistance, minutes } from '../i18n/format';
import { getArrival, setArrival, setReportAfterWalk, type Arrival } from '../nav/walkStore';
import { dropWalk, queueWalk } from '../storage/walkQueue';
import { cappedContent } from '../theme/layout';
import { colors, radius, spacing, touchTarget } from '../theme/theme';

const FACES = [1, 2, 3, 4, 5] as const;
type Rating = (typeof FACES)[number];

// A picked face is coloured by what it means (test note F11): unsafe in caution
// orange, okay in blue, safe in teal. The word under it says the same.
const FACE_TONE: Record<Rating, { fg: string; edge: string; bg: string }> = {
  1: { fg: colors.hazardText, edge: colors.hazard, bg: colors.hazardSoft },
  2: { fg: colors.hazardText, edge: colors.hazard, bg: colors.hazardSoft },
  3: { fg: colors.interactiveText, edge: colors.interactive, bg: colors.interactiveSoft },
  4: { fg: colors.safeText, edge: colors.safe, bg: colors.safeSoft },
  5: { fg: colors.safeText, edge: colors.safe, bg: colors.safeSoft },
};

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
  const snack = useSnackbar();
  // Walk points (guide Section 15): sent once, as soon as the screen opens, with an
  // id made here so a retry counts once (test note F4). A failure goes to the walk
  // queue (sent when the app next opens online) and keeps a Try again row here.
  const [walkId] = useState(randomId);
  const [queued] = useState(() => ({
    id: walkId,
    gpsM: a.gpsM,
    durationS: a.durationS,
    to: a.to.name,
    createdAt: new Date().toISOString(),
  }));
  const [saved, setSaved] = useState<'sending' | 'saved' | 'failed'>('sending');
  const finished = useRef<Promise<boolean> | null>(null);
  const send = useCallback(() => {
    setSaved('sending');
    finished.current = walkFinish(queued.id, queued.gpsM, queued.durationS, queued.to)
      .then((r) => {
        setPoints(r.points);
        setSaved('saved');
        void dropWalk(queued.id);
        return true;
      })
      .catch((error: unknown) => {
        console.warn('Could not send the finished walk', error);
        setSaved('failed');
        void queueWalk({ ...queued, sent: false });
        return false;
      });
  }, [queued]);
  useEffect(() => {
    if (!finished.current) send();
  }, [send]);

  // +5 for rating, said once when a face is first picked (test note F11).
  const rated = useRef(false);
  const pick = (level: Rating | null) => {
    setRating(level);
    if (level && !rated.current) {
      rated.current = true;
      snack.show({ text: t('arrival.ratePoints') });
    }
  };

  // More below the buttons (the rating, street checks): a cue until scrolled (F11).
  const [more, setMore] = useState(false);
  const [actionsH, setActionsH] = useState(touchTarget * 3);
  const boxH = useRef(0);
  const contentH = useRef(0);
  const checkMore = (y: number) => setMore(contentH.current - boxH.current - y > spacing.lg);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => checkMore(e.nativeEvent.contentOffset.y);

  // The rating is sent once, when the user leaves this screen. If it cannot be sent
  // (offline), it waits in the walk queue with its walk.
  const leave = useCallback(
    (then: 'map' | 'report') => {
      if (left.current) return;
      left.current = true;
      if (rating) {
        const r = { rating, mode: a.mode, kind: a.kind, score: a.score, distanceM: a.walkedM };
        void finished.current?.then((ok) => {
          if (!ok) return queueWalk({ ...queued, sent: false, rating: r });
          return rateWalk({ ...r, walk: queued.id }).catch((error: unknown) => {
            console.warn('Could not send the walk rating', error);
            return queueWalk({ ...queued, sent: true, rating: r });
          });
        });
      }
      if (then === 'report') setReportAfterWalk({ at: a.to.lngLat, trail: a.trail });
      setArrival(null);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    },
    [rating, a, router, queued],
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
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={100}
        onLayout={(e) => {
          boxH.current = e.nativeEvent.layout.height;
          checkMore(0);
        }}
        onContentSizeChange={(_, h) => {
          contentH.current = h;
          checkMore(0);
        }}
      >
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

        {saved === 'failed' && (
          <View style={[styles.card, styles.points]} accessibilityLiveRegion="polite">
            <CloudOff size={24} color={colors.hazardText} />
            <AppText variant="body" color={colors.text} style={styles.flex}>
              {t('arrival.notSaved')}
            </AppText>
            <Pressable accessibilityRole="button" onPress={send} hitSlop={8} style={styles.retry}>
              <AppText variant="bodyStrong" color={colors.interactiveText}>
                {t('arrival.retry')}
              </AppText>
            </Pressable>
          </View>
        )}

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
                  onPress={() => pick(on ? null : level)}
                  style={[styles.face, on && { borderColor: FACE_TONE[level].edge, backgroundColor: FACE_TONE[level].bg }]}
                >
                  <Face level={level} color={on ? FACE_TONE[level].fg : colors.textMuted} />
                  <AppText variant="label" color={on ? FACE_TONE[level].fg : colors.text} style={styles.center}>
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
      {more && (
        <View
          style={styles.more}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <ChevronDown size={18} color={colors.textMuted} />
          <AppText variant="caption" color={colors.textMuted}>
            {t('arrival.moreBelow')}
          </AppText>
        </View>
      )}

      <View style={styles.actions} onLayout={(e) => setActionsH(e.nativeEvent.layout.height)}>
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
      {/* Above both buttons, never over them (test note F24). */}
      <Snackbar message={snack.message} onHide={snack.hide} bottom={insets.bottom + spacing.md + actionsH + spacing.sm} />
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
  retry: { minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: spacing.sm },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingTop: spacing.xs },
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
