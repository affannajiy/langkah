import { GeoJSONSource, Layer, type LngLat } from '@maplibre/maplibre-react-native';
import { memo, useMemo } from 'react';

import { colors } from '../theme/theme';

// The route just walked, drawn thin and faint under the report pin, so the user can
// place what they saw along it (guide Section 6.3, screen 8).
export const TrailLayer = memo(function TrailLayer({ points }: { points: LngLat[] }) {
  const data = useMemo<GeoJSON.Feature>(
    () => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points } }),
    [points],
  );
  return (
    <GeoJSONSource id="trail" data={data}>
      <Layer
        id="trail-line"
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': colors.safe, 'line-width': 5, 'line-opacity': 0.4 }}
      />
    </GeoJSONSource>
  );
});
