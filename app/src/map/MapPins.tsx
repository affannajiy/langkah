import { GeoJSONSource, Layer, Marker } from '@maplibre/maplibre-react-native';
import { Accessibility, Armchair, Bus, GlassWater, Grip, Store, Toilet, Umbrella, type LucideIcon } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { HAZARD_CATEGORIES, type HazardCategory, type MapAmenityKind, type MapView, type SponsoredPin } from '../api/types';
import { AppText } from '../components/AppText';
import { offerText } from '../points/partners';
import type { LayerToggles } from '../storage/settings';
import { colors, mapZ, radius } from '../theme/theme';
import { useScoringMode } from './useScoringMode';

export type { LayerToggles };

const HAZARD_KEYS = new Set<string>(HAZARD_CATEGORIES);

// Unknown categories from the server read as "Other hazard".
export const hazardKey = (category: string): HazardCategory =>
  HAZARD_KEYS.has(category) ? (category as HazardCategory) : 'other';

// Hazard pin: orange diamond with a dark outline and "!", like a Malaysian road
// warning sign (CLAUDE.md, Final design).
export function HazardMark({ size = 36 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Path d="M18 2 L34 18 L18 34 L2 18 Z" fill={colors.hazard} stroke={colors.text} strokeWidth={2.5} strokeLinejoin="round" />
      <Rect x={16.4} y={9.5} width={3.2} height={11} rx={1.6} fill={colors.text} />
      <Rect x={16.4} y={23} width={3.2} height={3.2} rx={1.6} fill={colors.text} />
    </Svg>
  );
}

// Marked crossing: light blue rounded square with zebra stripes.
export function CrossingMark() {
  return (
    <View style={[styles.square, { backgroundColor: colors.interactive }]}>
      <Svg width={16} height={14} viewBox="0 0 16 14">
        <Rect x={0} y={0} width={16} height={2.6} rx={1.3} fill={colors.white} />
        <Rect x={0} y={5.7} width={16} height={2.6} rx={1.3} fill={colors.white} />
        <Rect x={0} y={11.4} width={16} height={2.6} rx={1.3} fill={colors.white} />
      </Svg>
    </View>
  );
}

// The other amenities: a white icon on a rounded square. Each kind has its own
// icon, so colour is never the only cue (CLAUDE.md, UX rules).
const ICON_MARKS: Record<Exclude<MapAmenityKind, 'crossing'>, { Icon: LucideIcon; bg: string }> = {
  bus_stop: { Icon: Bus, bg: colors.community },
  shelter: { Icon: Umbrella, bg: colors.navy },
  kerb_ramp: { Icon: Accessibility, bg: colors.interactiveText },
  tactile: { Icon: Grip, bg: colors.interactiveText },
  bench: { Icon: Armchair, bg: colors.safeText },
  toilets: { Icon: Toilet, bg: colors.safeText },
  drinking_water: { Icon: GlassWater, bg: colors.safeText },
};

export function AmenityMark({ kind }: { kind: MapAmenityKind }) {
  if (kind === 'crossing') return <CrossingMark />;
  const { Icon, bg } = ICON_MARKS[kind];
  return (
    <View style={[styles.square, { backgroundColor: bg }]}>
      <Icon size={16} color={colors.white} strokeWidth={2.5} />
    </View>
  );
}

// Covered walkway mark for the Layers sheet: the same two rails as on the map.
export function CoveredMark() {
  return (
    <View style={styles.coveredMark}>
      <View style={styles.rail} />
      <View style={styles.rail} />
    </View>
  );
}

// Which toggle shows each kind, and the zoom it starts at. Kerbs and rest stops
// are small and many, so they wait until the map is close up.
const KIND_LAYER: Record<MapAmenityKind, { toggle: keyof LayerToggles; minZoom: number }> = {
  crossing: { toggle: 'crossings', minZoom: 0 },
  bus_stop: { toggle: 'busStops', minZoom: 0 },
  shelter: { toggle: 'shelters', minZoom: 0 },
  kerb_ramp: { toggle: 'kerbs', minZoom: 17 },
  tactile: { toggle: 'kerbs', minZoom: 17 },
  bench: { toggle: 'rest', minZoom: 16 },
  toilets: { toggle: 'rest', minZoom: 16 },
  drinking_water: { toggle: 'rest', minZoom: 16 },
};
const COVERED_MIN_ZOOM = 15;

const PIN_LABEL = {
  crossing: 'pin.crossing',
  bus_stop: 'pin.busStop',
  shelter: 'pin.shelter',
  kerb_ramp: 'pin.kerbRamp',
  tactile: 'pin.tactile',
  bench: 'pin.bench',
  toilets: 'pin.toilets',
  drinking_water: 'pin.water',
} as const satisfies Record<MapAmenityKind, string>;

// Sponsored shop: a white teardrop with a navy outline and a shop icon, and a
// "Sponsored" tag under it, so it never reads as a hazard or an amenity (guide
// Section 15.6). The tip of the drop sits on the shop.
const TAG_H = 26;

export function SponsoredMark({ label }: { label: string }) {
  return (
    <View style={styles.sponsored}>
      <View>
        <Svg width={34} height={42} viewBox="0 0 34 42">
          <Path
            d="M17 40 C17 40 3 25.5 3 16 A14 14 0 0 1 31 16 C31 25.5 17 40 17 40 Z"
            fill={colors.white}
            stroke={colors.navy}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        </Svg>
        <View style={styles.storeIcon}>
          <Store size={16} color={colors.navy} strokeWidth={2.5} />
        </View>
      </View>
      <View style={styles.tag}>
        <AppText variant="label" color={colors.white} style={styles.tagText}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

type Props = {
  view: MapView | null;
  toggles: LayerToggles;
  // Browse map only: never while comparing routes or reporting (and never on the walk screen).
  onSponsored?: (pin: SponsoredPin) => void;
};

// Pins of the same kind closer than this show as one, so a junction with
// several mapped crossings does not draw a stack of icons.
const MERGE_M = 20;
const M_PER_DEG = 111_320;

function mergeClose<T extends { kind: string; lngLat: [number, number] }>(items: T[]): T[] {
  const kept: T[] = [];
  for (const item of items) {
    const [x, y] = item.lngLat;
    const k = Math.cos((y * Math.PI) / 180);
    const near = kept.some(
      (o) => o.kind === item.kind && Math.hypot((o.lngLat[0] - x) * k, o.lngLat[1] - y) * M_PER_DEG < MERGE_M,
    );
    if (!near) kept.push(item);
  }
  return kept;
}

// Hazards and amenities for the visible area only (guide Section 7.4).
// Hazards always show; amenity kinds follow the Layers sheet.
export const MapPins = memo(function MapPins({ view, toggles, onSponsored }: Props) {
  const { t } = useTranslation();
  if (!view) return null;

  const amenities = mergeClose(view.amenities).filter((a) => {
    const layer = KIND_LAYER[a.kind];
    return toggles[layer.toggle] && view.zoom >= layer.minZoom;
  });

  return (
    <>
      {toggles.covered && view.zoom >= COVERED_MIN_ZOOM && <CoveredLines lines={view.covered} />}
      {amenities.map((a) => (
        <Marker key={`${a.kind}:${a.lngLat[0]}:${a.lngLat[1]}`} lngLat={a.lngLat} anchor="center" style={{ zIndex: mapZ.amenity }}>
          <View accessible accessibilityLabel={t(PIN_LABEL[a.kind])} style={styles.ring}>
            <AmenityMark kind={a.kind} />
          </View>
        </Marker>
      ))}
      {onSponsored &&
        view.sponsored.map((s) => (
          // On Android a tap reaches the Marker, not the Pressable inside it; the Pressable stays for TalkBack.
          <Marker
            key={`sp:${s.id}`}
            lngLat={s.lngLat}
            anchor="bottom"
            offset={[0, TAG_H]}
            onPress={() => onSponsored(s)}
            style={{ zIndex: mapZ.sponsored }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('pin.sponsoredA11y', { name: s.name, rm: s.rm, offer: offerText(s.offer) })}
              onPress={() => onSponsored(s)}
            >
              <SponsoredMark label={t('pin.sponsored')} />
            </Pressable>
          </Marker>
        ))}
      {view.hazards.map((h) => (
        <Marker key={h.id} lngLat={h.lngLat} anchor="center" style={{ zIndex: mapZ.hazard }}>
          <View
            accessible
            accessibilityLabel={t('pin.hazard', {
              category: t(`hazard.${hazardKey(h.category)}`),
            })}
          >
            <HazardMark />
          </View>
        </Marker>
      ))}
    </>
  );
});

// Covered walkways in view: two thin rails, like the walk screen, under the pins.
function CoveredLines({ lines }: { lines: [number, number][][] }) {
  const { mode } = useScoringMode();
  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: lines.map((pts, i) => ({ type: 'Feature', id: `cv${i}`, properties: {}, geometry: { type: 'LineString', coordinates: pts } })),
    }),
    [lines],
  );
  return (
    <GeoJSONSource id="covered" data={data}>
      <Layer
        id="covered-rails"
        type="line"
        layout={{ 'line-cap': 'butt', 'line-join': 'round' }}
        paint={{ 'line-color': mode === 'night' ? colors.onNavyAccent : colors.navy, 'line-width': 1.5, 'line-gap-width': 5 }}
      />
    </GeoJSONSource>
  );
}

const styles = StyleSheet.create({
  // White ring so the icon reads on any map colour (Section 6.2, Icons).
  ring: { padding: 2, borderRadius: radius.card / 2 + 2, backgroundColor: colors.white },
  sponsored: { alignItems: 'center' },
  storeIcon: { position: 'absolute', top: 8, left: 9 },
  tag: {
    height: TAG_H - 2,
    marginTop: 2,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    justifyContent: 'center',
  },
  tagText: { lineHeight: 18 },
  square: { width: 26, height: 26, borderRadius: radius.card / 2, alignItems: 'center', justifyContent: 'center' },
  coveredMark: { width: 26, height: 26, justifyContent: 'center', gap: 6 },
  rail: { height: 2, borderRadius: 1, backgroundColor: colors.navy },
});
