import { Accessibility, Check, CircleAlert, CloudRain, Footprints, Star, Sun, Umbrella } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Route, RouteError, ScoringMode } from '../../api/types';
import { AppText } from '../../components/AppText';
import { BottomSheet } from '../../components/BottomSheet';
import { ModeChip } from '../../components/ModeChip';
import { RouteCard } from '../../components/RouteCard';
import type { RouteKind } from '../../map/RouteLayers';
import type { RoutesState } from '../../route/useRoutes';
import { colors, radius, spacing, touchTarget } from '../../theme/theme';

type Props = {
  state: RoutesState | { status: 'error'; error: RouteError };
  destinationName: string;
  mode: ScoringMode;
  onToggleMode: () => void;
  selected: RouteKind;
  onSelect: (kind: RouteKind) => void;
  onStart: () => void;
  onRetry: () => void;
  onChooseStart: () => void;
  // Visible height of the sheet, so the map credit and routes stay clear of it.
  onHeight: (h: number) => void;
  // Collapsed height once measured, for framing the routes.
  onCollapsedHeight: (h: number) => void;
  // Tallest the sheet may grow, so the trip bar and map credit stay visible.
  maxHeight: number;
  // Star the destination (starred places, more with Plus). Absent for "your location".
  star?: { on: boolean; onPress: () => void };
  // Prefer covered walkways (Phase 20): on by itself in rain or heat, or by the chip.
  cover: { on: boolean; reason: 'rain' | 'rainSoon' | 'heat' | null; onToggle: () => void };
  stepFree: boolean; // Settings, Avoid steps (Phase 24)
};

// Height of BottomSheet's drag handle area.
const HANDLE = 24;

const KNOWN_ERRORS = new Set<RouteError>([
  'too_far',
  'too_close',
  'start_off_network',
  'end_off_network',
  'no_route',
  'no_step_free',
  'outside_pilot',
  'start_outside_pilot',
  'no_start',
  'network',
]);

// Route compare sheet (guide Section 6.3, screen 3; docs/screens/RouteCompare.png).
// Collapsed: both cards and Start. Dragged up: the score breakdown (Section 5.2, screen 7).
export function CompareSheet(props: Props) {
  const { state, mode, onToggleMode, onHeight, onCollapsedHeight, maxHeight } = props;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [mainH, setMainH] = useState(320);
  const [footerH, setFooterH] = useState(88);
  // Only report the collapsed height after the cards have really been measured.
  const [measured, setMeasured] = useState(false);

  const ok = state.status === 'ok';
  // Start stays pinned under the cards; without routes, only the system bar needs room.
  const bottom = ok ? footerH : insets.bottom + spacing.lg;
  const collapsed = Math.min(mainH + bottom, screenH * 0.75, maxHeight);
  // Small screens or big text: the cards scroll above Start instead of pushing it off screen.
  const overflow = mainH + bottom > collapsed;
  const expanded = Math.max(collapsed + 1, Math.min(screenH * 0.85, maxHeight));
  const routeCount = ok && state.pair.same ? 1 : 2;
  const startLabel = props.selected === 'safest' ? t('route.startSafest') : t('route.startFastest');

  useEffect(() => {
    onHeight(index === 0 ? collapsed : expanded);
  }, [index, collapsed, expanded, onHeight]);

  useEffect(() => {
    if (measured) onCollapsedHeight(collapsed);
  }, [measured, collapsed, onCollapsedHeight]);

  return (
    <BottomSheet snapPoints={[collapsed, expanded]} index={index} onIndexChange={setIndex}>
      {/* Only the part of the sheet on screen: the handle area (24) sits above it. */}
      <View style={{ height: (index === 0 ? collapsed : expanded) - HANDLE }}>
        <ScrollView
          style={styles.flex}
          scrollEnabled={index > 0 || overflow}
          contentContainerStyle={{ paddingBottom: ok ? spacing.md : insets.bottom + spacing.lg }}
        >
          <View
            style={styles.main}
            onLayout={(e) => {
              // The 24 dp handle area sits above this block.
              setMainH(e.nativeEvent.layout.height + HANDLE + spacing.md);
              setMeasured(true);
            }}
          >
            <View style={styles.titleRow}>
              <AppText variant="heading" color={colors.navy} accessibilityRole="header" style={styles.title}>
                {state.status === 'ok' ? t('route.title', { count: routeCount }) : t('route.titleAny')}
              </AppText>
              {/* Chip and star stay together, so the wider night chip never pushes the star onto its own line. */}
              <View style={styles.controls}>
                <ModeChip mode={mode} size="long" onPress={onToggleMode} />
                {props.star && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={props.star.on ? t('starred.remove', { name: props.destinationName }) : t('starred.add', { name: props.destinationName })}
                    accessibilityState={{ selected: props.star.on }}
                    onPress={props.star.onPress}
                    style={({ pressed }) => [styles.star, props.star?.on && styles.starOn, pressed && styles.pressed]}
                  >
                    <Star size={22} color={props.star.on ? colors.hazardText : colors.navy} fill={props.star.on ? colors.hazard : 'none'} />
                  </Pressable>
                )}
              </View>
            </View>
            <Options cover={props.cover} stepFree={props.stepFree} />
            <Body {...props} />
          </View>
          {index > 0 && ok && (
            <Details route={props.selected === 'safest' ? state.pair.safest : state.pair.fastest} />
          )}
        </ScrollView>
        {ok && (
          <View
            style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
            onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
          >
            <Pressable
              accessibilityRole="button"
              onPress={props.onStart}
              style={({ pressed }) => [styles.primary, styles.start, pressed && styles.pressed]}
            >
              <Footprints size={24} color={colors.white} />
              <AppText variant="heading" color={colors.white}>
                {startLabel}
              </AppText>
            </Pressable>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

function Body({ state, destinationName, selected, onSelect, onRetry, onChooseStart }: Props) {
  const { t } = useTranslation();

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <View style={styles.loading} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.safeText} />
        <AppText color={colors.textMuted}>{t('route.loading')}</AppText>
      </View>
    );
  }

  if (state.status === 'error') {
    const code = KNOWN_ERRORS.has(state.error) ? state.error : 'generic';
    const needsStart = code === 'no_start' || code === 'start_outside_pilot' || code === 'start_off_network';
    const canRetry = code === 'network' || code === 'generic';
    return (
      <View style={styles.error} accessibilityLiveRegion="polite">
        <View style={styles.errorText}>
          <CircleAlert size={22} color={colors.hazardText} />
          <AppText color={colors.text} style={styles.flex}>
            {t(`route.error.${code}` as 'route.error.generic', { name: destinationName })}
          </AppText>
        </View>
        {needsStart && (
          <Pressable accessibilityRole="button" onPress={onChooseStart} style={styles.primary}>
            <AppText variant="bodyStrong" color={colors.white}>
              {t('route.chooseStart')}
            </AppText>
          </Pressable>
        )}
        {canRetry && (
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.primary}>
            <AppText variant="bodyStrong" color={colors.white}>
              {t('route.retry')}
            </AppText>
          </Pressable>
        )}
      </View>
    );
  }

  const { pair } = state;
  const kx = (selected === 'fastest' && !pair.same ? pair.fastest : pair.safest).stats.kx;

  return (
    <View style={styles.cards} accessibilityRole="radiogroup">
      {pair.options.stepFree && kx !== null && kx > 0 && (
        <View style={styles.optionNote}>
          <Accessibility size={20} color={colors.interactiveText} />
          <AppText variant="caption" color={colors.text} style={styles.flex}>
            {t('route.kerbs', { count: kx })}
          </AppText>
        </View>
      )}
      <RouteCard kind="safest" route={pair.safest} both={pair.same} selected={selected === 'safest'} onPress={() => onSelect('safest')} />
      {pair.same ? (
        <AppText color={colors.textMuted}>{t('route.same')}</AppText>
      ) : (
        <RouteCard kind="fastest" route={pair.fastest} selected={selected === 'fastest'} onPress={() => onSelect('fastest')} />
      )}
    </View>
  );
}

// Route options under the title: the cover chip (a toggle) and, when Settings asks
// for it, a plain step-free tag. Icon and word on each, never colour alone.
function Options({ cover, stepFree }: Pick<Props, 'cover' | 'stepFree'>) {
  const { t } = useTranslation();
  const Icon = cover.reason === 'rain' || cover.reason === 'rainSoon' ? CloudRain : cover.reason === 'heat' ? Sun : Umbrella;
  const label = cover.on && cover.reason ? t(`route.cover.${cover.reason}`) : t('route.cover.on');
  return (
    <View style={styles.options}>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: cover.on }}
        accessibilityHint={t('route.cover.hint')}
        onPress={cover.onToggle}
        style={({ pressed }) => [styles.option, cover.on && styles.optionOn, pressed && styles.pressed]}
      >
        <Icon size={20} color={cover.on ? colors.interactiveText : colors.textMuted} />
        <AppText variant="label" color={cover.on ? colors.interactiveText : colors.textMuted}>
          {label}
        </AppText>
        {/* On also shows a tick, so the state never rests on colour alone. */}
        {cover.on && <Check size={18} color={colors.interactiveText} strokeWidth={2.5} />}
      </Pressable>
      {stepFree && (
        <View style={[styles.option, styles.optionOn]} accessible accessibilityLabel={t('route.stepFreeA11y')}>
          <Accessibility size={20} color={colors.interactiveText} />
          <AppText variant="label" color={colors.interactiveText}>
            {t('route.stepFree')}
          </AppText>
        </View>
      )}
    </View>
  );
}

// Score breakdown for the selected route (guide Section 5.2, screen 7).
function Details({ route }: { route: Route }) {
  const { t } = useTranslation();
  const s = route.stats;
  const rows: [string, string][] = [
    [t('route.row.sidewalk'), t('route.row.percent', { pct: s.sw })],
    [t('route.row.lit'), t('route.row.percent', { pct: s.lit })],
    [t('route.row.covered'), t('route.row.percent', { pct: s.cov })],
    [t('route.row.marked'), String(s.mx)],
    [t('route.row.unmarked'), String(s.ux)],
    [t('route.row.hazards'), String(s.hz)],
    [t('route.row.unchecked'), t('route.row.percent', { pct: s.unk })],
  ];
  return (
    <View style={styles.details}>
      <AppText variant="heading" color={colors.navy} accessibilityRole="header">
        {t('route.details')}
      </AppText>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.detailRow} accessible accessibilityLabel={`${label}: ${value}`}>
          <AppText color={colors.text} style={styles.flex}>
            {label}
          </AppText>
          <AppText variant="bodyStrong" color={colors.text}>
            {value}
          </AppText>
        </View>
      ))}
      {s.unk > 0 && (
        <View style={styles.note}>
          <AppText color={colors.text}>{t('route.uncheckedNote', { pct: s.unk })}</AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  main: { paddingHorizontal: spacing.md, gap: spacing.md },
  star: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starOn: { backgroundColor: colors.hazardSoft, borderColor: colors.hazard },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  title: { flex: 1, minWidth: 120 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginLeft: 'auto' },
  cards: { gap: spacing.sm + spacing.xs },
  loading: { minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  error: { gap: spacing.md, paddingVertical: spacing.md },
  errorText: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  primary: {
    minHeight: touchTarget + spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  start: { minHeight: touchTarget + spacing.sm },
  footer: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, backgroundColor: colors.white },
  pressed: { opacity: 0.85 },
  details: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, gap: spacing.sm },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  optionOn: { backgroundColor: colors.interactiveSoft, borderColor: colors.interactiveSoft },
  optionNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    padding: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: colors.interactiveSoft,
  },
  note: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.surface },
});
