import { GeoJSONSource, Layer, Marker, type LngLat } from '@maplibre/maplibre-react-native';
import { Minus, Shield } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { Route, RoutePair } from '../api/types';
import { AppText } from '../components/AppText';
import { minutes } from '../i18n/format';
import { colors, radius, shadow, spacing } from '../theme/theme';

export type RouteKind = 'safest' | 'fastest';

type Props = {
  pair: RoutePair;
  selected: RouteKind;
  onSelect: (kind: RouteKind) => void;
  start: LngLat | null; // null when the start is the user's own location dot
  end: LngLat;
};

const line = (points: LngLat[]): GeoJSON.LineString => ({ type: 'LineString', coordinates: points });

function uncheckedParts(route: Route, kind: RouteKind): GeoJSON.Feature[] {
  return route.unchecked.map(([a, b], i) => ({
    type: 'Feature',
    id: `${kind}-u${i}`,
    properties: { kind },
    geometry: line(route.points.slice(a, b + 1)),
  }));
}

// Route tag placement. Tags sit 20 to 80% along each route, away from the start
// and end pins, where that route is farthest from the other one, so the two tags
// do not cover each other or the shared part of the lines.
const M_PER_DEG = 111_320;
const TAG_FROM = 0.2;
const TAG_TO = 0.8;
const TAG_STEPS = 12;

type Metres = (a: LngLat, b: LngLat) => number;

function metresFn(points: LngLat[]): Metres {
  const k = Math.cos(((points[0]?.[1] ?? 0) * Math.PI) / 180);
  return (a, b) => Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * M_PER_DEG;
}

// Distance from p to the nearest segment of a line, in metres.
function toLine(p: LngLat, line: LngLat[], m: Metres): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const ab = m(a, b);
    if (ab === 0) {
      best = Math.min(best, m(p, a));
      continue;
    }
    // Project onto the segment in plain degrees; fine at walking scale.
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, m(p, [a[0] + t * dx, a[1] + t * dy]));
  }
  return best;
}

function candidates(route: Route): LngLat[] {
  const last = route.points.length - 1;
  const out: LngLat[] = [];
  for (let s = 0; s <= TAG_STEPS; s++) {
    const at = TAG_FROM + ((TAG_TO - TAG_FROM) * s) / TAG_STEPS;
    out.push(route.points[Math.round(last * at)] ?? route.points[0]!);
  }
  return out;
}

function tagPoints(pair: RoutePair): { safest: LngLat; fastest: LngLat | null } {
  const safeC = candidates(pair.safest);
  if (pair.same) return { safest: safeC[Math.floor(safeC.length / 2)]!, fastest: null };
  const m = metresFn(pair.safest.points);
  const fastC = candidates(pair.fastest);

  let fastest = fastC[0]!;
  let bestF = -1;
  for (const c of fastC) {
    const d = toLine(c, pair.safest.points, m);
    if (d > bestF) [bestF, fastest] = [d, c];
  }

  // Wanted gap between the tags: a third of the trip's straight-line length.
  const ends = pair.safest.points;
  const gap = m(ends[0]!, ends[ends.length - 1]!) / 3;
  let safest = safeC[0]!;
  let bestS = -1;
  for (const c of safeC) {
    const apart = m(c, fastest);
    // Far enough from the other tag: prefer where the lines diverge. Otherwise: as far as possible.
    const score = apart >= gap ? 1e9 + toLine(c, pair.fastest.points, m) : apart;
    if (score > bestS) [bestS, safest] = [score, c];
  }
  return { safest, fastest };
}

// Both route lines (guide Section 6.2): safest solid teal with a white outline,
// fastest dashed grey, and white dots over streets that are not yet checked.
// The lines also differ by label text, so colour is never the only cue.
export function RouteLayers({ pair, selected, onSelect, start, end }: Props) {
  const { t } = useTranslation();
  const showFastest = !pair.same;

  const routes = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [
        ...(showFastest
          ? [{ type: 'Feature' as const, id: 'fastest', properties: { kind: 'fastest' }, geometry: line(pair.fastest.points) }]
          : []),
        { type: 'Feature' as const, id: 'safest', properties: { kind: 'safest' }, geometry: line(pair.safest.points) },
      ],
    }),
    [pair, showFastest],
  );

  const unchecked = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [
        ...(showFastest ? uncheckedParts(pair.fastest, 'fastest') : []),
        ...uncheckedParts(pair.safest, 'safest'),
      ],
    }),
    [pair, showFastest],
  );

  const tags = useMemo(() => tagPoints(pair), [pair]);
  const dim = (kind: RouteKind) => (selected === kind ? 1 : 0.55);

  return (
    <>
      <GeoJSONSource
        id="routes"
        data={routes}
        onPress={(e) => {
          const kind = e.nativeEvent.features[0]?.properties?.kind;
          if (kind === 'safest' || kind === 'fastest') onSelect(kind);
        }}
      >
        <Layer
          id="route-fastest"
          type="line"
          filter={['==', ['get', 'kind'], 'fastest']}
          layout={{ 'line-cap': 'butt', 'line-join': 'round' }}
          paint={{
            'line-color': colors.routeFastest,
            'line-width': selected === 'fastest' ? 5 : 4,
            'line-dasharray': [1.6, 1.2],
            'line-opacity': dim('fastest'),
          }}
        />
        <Layer
          id="route-safest-outline"
          type="line"
          filter={['==', ['get', 'kind'], 'safest']}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': colors.routeOutline, 'line-width': 10, 'line-opacity': dim('safest') }}
        />
        <Layer
          id="route-safest"
          type="line"
          filter={['==', ['get', 'kind'], 'safest']}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': colors.safe, 'line-width': 6, 'line-opacity': dim('safest') }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="routes-unchecked" data={unchecked}>
        <Layer
          id="route-unchecked-dots"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': colors.routeOutline,
            'line-width': 2.5,
            'line-dasharray': [0, 2.5],
            'line-opacity': ['case', ['==', ['get', 'kind'], selected], 0.95, 0.5],
          }}
        />
      </GeoJSONSource>

      {tags.fastest && (
        <RouteTag kind="fastest" lngLat={tags.fastest} label={t('route.fastestTag', { count: minutes(pair.fastest.timeS) })} onPress={() => onSelect('fastest')} />
      )}
      <RouteTag
        kind="safest"
        lngLat={tags.safest}
        label={pair.same ? t('route.bothTag', { count: minutes(pair.safest.timeS) }) : t('route.safestTag', { count: minutes(pair.safest.timeS) })}
        onPress={() => onSelect('safest')}
      />

      {start && (
        <Marker lngLat={start} anchor="center">
          <View accessible accessibilityLabel={t('pin.start')} style={styles.startDot} />
        </Marker>
      )}
      <DestinationPin at={end} />
    </>
  );
}

// Navy drop pin on the destination, shared with the walking screen.
export function DestinationPin({ at }: { at: LngLat }) {
  const { t } = useTranslation();
  return (
    <Marker lngLat={at} anchor="bottom">
      <View accessible accessibilityLabel={t('pin.destination')}>
        <Svg width={40} height={50} viewBox="0 0 40 50">
          <Path
            d="M20 48 C20 48 36 30 36 18 A16 16 0 1 0 4 18 C4 30 20 48 20 48 Z"
            fill={colors.navy}
            stroke={colors.white}
            strokeWidth={3}
          />
          <Circle cx={20} cy={18} r={6} fill={colors.white} />
        </Svg>
      </View>
    </Marker>
  );
}

function RouteTag({ kind, lngLat, label, onPress }: { kind: RouteKind; lngLat: LngLat; label: string; onPress: () => void }) {
  const safest = kind === 'safest';
  return (
    <Marker lngLat={lngLat} anchor="center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={[styles.tag, safest ? styles.tagSafe : styles.tagFast]}
      >
        {safest ? <Shield size={18} color={colors.white} /> : <Minus size={18} color={colors.navy} strokeWidth={3} />}
        <AppText variant="label" color={safest ? colors.white : colors.navy}>
          {label}
        </AppText>
      </Pressable>
    </Marker>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    ...shadow.floating,
  },
  tagSafe: { backgroundColor: colors.safeText },
  tagFast: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  startDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.white,
    borderWidth: 4,
    borderColor: colors.navy,
  },
});
