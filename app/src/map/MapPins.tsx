import { Marker } from '@maplibre/maplibre-react-native';
import { Bus, Umbrella } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { HAZARD_CATEGORIES, type HazardCategory, type MapView } from '../api/types';
import type { LayerToggles } from '../storage/settings';
import { colors, radius } from '../theme/theme';

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

function BusStopMark() {
  return (
    <View style={[styles.square, { backgroundColor: colors.community }]}>
      <Bus size={16} color={colors.white} strokeWidth={2.5} />
    </View>
  );
}

function ShelterMark() {
  return (
    <View style={[styles.square, { backgroundColor: colors.navy }]}>
      <Umbrella size={16} color={colors.white} strokeWidth={2.5} />
    </View>
  );
}

type Props = { view: MapView | null; toggles: LayerToggles };

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
export const MapPins = memo(function MapPins({ view, toggles }: Props) {
  const { t } = useTranslation();
  if (!view) return null;

  const amenities = mergeClose(view.amenities).filter(
    (a) =>
      (a.kind === 'crossing' && toggles.crossings) ||
      (a.kind === 'bus_stop' && toggles.busStops) ||
      (a.kind === 'shelter' && toggles.shelters),
  );

  return (
    <>
      {amenities.map((a) => (
        <Marker key={`${a.kind}:${a.lngLat[0]}:${a.lngLat[1]}`} lngLat={a.lngLat} anchor="center">
          <View
            accessible
            accessibilityLabel={
              a.kind === 'crossing' ? t('pin.crossing') : a.kind === 'bus_stop' ? t('pin.busStop') : t('pin.shelter')
            }
            style={styles.ring}
          >
            {a.kind === 'crossing' ? <CrossingMark /> : a.kind === 'bus_stop' ? <BusStopMark /> : <ShelterMark />}
          </View>
        </Marker>
      ))}
      {view.hazards.map((h) => (
        <Marker key={h.id} lngLat={h.lngLat} anchor="center">
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

const styles = StyleSheet.create({
  // White ring so the icon reads on any map colour (Section 6.2, Icons).
  ring: { padding: 2, borderRadius: radius.card / 2 + 2, backgroundColor: colors.white },
  square: { width: 26, height: 26, borderRadius: radius.card / 2, alignItems: 'center', justifyContent: 'center' },
});
