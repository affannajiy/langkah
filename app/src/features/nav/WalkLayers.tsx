import { GeoJSONSource, Layer, Marker, type LngLat } from '@maplibre/maplibre-react-native';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { CrossingMark, HazardMark, hazardKey } from '../../map/MapPins';
import { DestinationPin, type RouteKind } from '../../map/RouteLayers';
import { useScoringMode } from '../../map/useScoringMode';
import { slice, type Track } from '../../nav/geo';
import type { RouteCrossing, RouteHazard } from '../../nav/useRouteFeatures';
import { colors, mapZ, radius } from '../../theme/theme';

type Props = {
  track: Track;
  kind: RouteKind;
  along: number;
  hazards: RouteHazard[];
  crossings: RouteCrossing[];
  covered: LngLat[][]; // covered walkways on this route
  end: LngLat;
};

// Progress is redrawn in 10 m steps, so the line source is not rebuilt on every fix.
const REDRAW_M = 10;

// Only the active route, with the walked part greyed out, plus hazards and marked
// crossings on that route (guide Section 6.3, screen 4). The line keeps its pattern:
// safest solid teal, fastest dashed grey. Covered stretches get thin rails on both
// sides of the line, so shade and rain cover show without a new pin.
export const WalkLayers = memo(function WalkLayers({ track, kind, along, hazards, crossings, covered, end }: Props) {
  const { t } = useTranslation();
  const step = Math.floor(along / REDRAW_M) * REDRAW_M;

  const lines = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', id: 'walked', properties: { part: 'walked' }, geometry: { type: 'LineString', coordinates: slice(track, 0, step) } },
        { type: 'Feature', id: 'ahead', properties: { part: 'ahead' }, geometry: { type: 'LineString', coordinates: slice(track, step, track.total) } },
      ],
    }),
    [track, step],
  );

  const coveredLines = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: covered.map((pts, i) => ({
        type: 'Feature',
        id: `cv${i}`,
        properties: {},
        geometry: { type: 'LineString', coordinates: pts },
      })),
    }),
    [covered],
  );

  const safest = kind === 'safest';
  const { mode } = useScoringMode();

  return (
    <>
      <GeoJSONSource id="walk-covered" data={coveredLines}>
        <Layer
          id="walk-covered-rails"
          type="line"
          layout={{ 'line-cap': 'butt', 'line-join': 'round' }}
          paint={{ 'line-color': mode === 'night' ? colors.onNavyAccent : colors.navy, 'line-width': 2, 'line-gap-width': 13 }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="walk" data={lines}>
        <Layer
          id="walk-walked"
          type="line"
          filter={['==', ['get', 'part'], 'walked']}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': colors.routeWalked, 'line-width': 6 }}
        />
        <Layer
          id="walk-ahead-outline"
          type="line"
          filter={['==', ['get', 'part'], 'ahead']}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': colors.routeOutline, 'line-width': 11 }}
        />
        <Layer
          id="walk-ahead"
          type="line"
          filter={['==', ['get', 'part'], 'ahead']}
          layout={{ 'line-cap': safest ? 'round' : 'butt', 'line-join': 'round' }}
          paint={
            safest
              ? { 'line-color': colors.safe, 'line-width': 7 }
              : { 'line-color': colors.routeFastest, 'line-width': 6, 'line-dasharray': [1.6, 1.2] }
          }
        />
      </GeoJSONSource>

      {crossings.map((x) => (
        <Marker key={`x:${x.lngLat[0]}:${x.lngLat[1]}`} lngLat={x.lngLat} anchor="center" style={{ zIndex: mapZ.amenity }}>
          <View accessible accessibilityLabel={t('pin.crossing')} style={styles.ring}>
            <CrossingMark />
          </View>
        </Marker>
      ))}
      {hazards.map((h) => (
        <Marker key={h.id} lngLat={h.lngLat} anchor="center" style={{ zIndex: mapZ.hazard }}>
          <View accessible accessibilityLabel={t('pin.hazard', { category: t(`hazard.${hazardKey(h.category)}`) })}>
            <HazardMark />
          </View>
        </Marker>
      ))}
      <DestinationPin at={end} />
    </>
  );
});

const styles = StyleSheet.create({
  ring: { padding: 2, borderRadius: radius.card / 2 + 2, backgroundColor: colors.white },
});
