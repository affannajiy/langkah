import { GeoJSONSource, Layer, Marker, type LngLat } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { reduceMotion } from '../../theme/motion';
import { colors, mapZ } from '../../theme/theme';

type Props = {
  at: LngLat;
  heading: number; // walking direction, degrees from north
  facing: number | null; // where the phone points (compass), if known
  accuracy: number | null; // metres
  zoom: number; // shapes are sized in screen pixels at this zoom
  night: boolean; // navy map: the arrow turns light blue so it stands out
};

// How long the puck takes to slide to a new fix; matches the walk camera's ease.
export const GLIDE_MS = 1000;
const FRAME_MS = 33;
// Shown only when GPS is weaker than this.
const WEAK_GPS_M = 15;
const ARROW_PX = 30;
const CONE_PX = 70;
const CONE_DEG = 70;

const M_PER_DEG = 111_320;

// Metres per screen pixel at this zoom and latitude (512 px tiles).
function metresPerPx(zoom: number, lat: number): number {
  return (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

// A point dx metres east and dy metres north of c.
function offset(c: LngLat, dx: number, dy: number): LngLat {
  const k = Math.cos((c[1] * Math.PI) / 180);
  return [c[0] + dx / (M_PER_DEG * k), c[1] + dy / M_PER_DEG];
}

// Rotate (x, y) metres by a compass bearing (clockwise from north).
function turn(x: number, y: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) + y * Math.sin(r), -x * Math.sin(r) + y * Math.cos(r)];
}

const angleDiff = (a: number, b: number) => ((b - a + 540) % 360) - 180;

// Slides a position and an angle to their new values over GLIDE_MS instead of jumping.
function useGlide(at: LngLat, heading: number): { at: LngLat; heading: number } {
  const [now, setNow] = useState({ at, heading });
  const from = useRef(now);
  from.current = now;
  useEffect(() => {
    const start = from.current;
    if (reduceMotion()) {
      setNow({ at, heading });
      return;
    }
    const began = Date.now();
    const dh = angleDiff(start.heading, heading);
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - began) / GLIDE_MS);
      setNow({
        at: [start.at[0] + (at[0] - start.at[0]) * t, start.at[1] + (at[1] - start.at[1]) * t],
        heading: (start.heading + dh * t + 360) % 360,
      });
      if (t >= 1) clearInterval(timer);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [at, heading]);
  return now;
}

// The walker (guide Section 17.4): a navy arrow (light blue at night) lying flat on the street, pointing along
// the walk, a soft light-blue cone for where the phone faces, and an accuracy ring when
// GPS is weak. Drawn as map shapes so they tilt with the 3D view.
export function WalkerPuck({ at, heading, facing, accuracy, zoom, night }: Props) {
  const { t } = useTranslation();
  const g = useGlide(at, heading);

  const shapes = useMemo<GeoJSON.FeatureCollection>(() => {
    const px = metresPerPx(zoom, g.at[1]);
    const poly = (pts: [number, number][]): GeoJSON.Polygon => ({
      type: 'Polygon',
      coordinates: [[...pts.map(([x, y]) => offset(g.at, x, y)), offset(g.at, pts[0]![0], pts[0]![1])]],
    });
    const features: GeoJSON.Feature[] = [];

    if (accuracy !== null && accuracy > WEAK_GPS_M) {
      const ring: [number, number][] = [];
      for (let i = 0; i < 36; i++) ring.push(turn(0, accuracy, i * 10));
      features.push({ type: 'Feature', properties: { part: 'accuracy' }, geometry: poly(ring) });
    }

    if (facing !== null) {
      const r = CONE_PX * px;
      const cone: [number, number][] = [[0, 0]];
      for (let a = -CONE_DEG / 2; a <= CONE_DEG / 2; a += 7) cone.push(turn(0, r, facing + a));
      features.push({ type: 'Feature', properties: { part: 'cone' }, geometry: poly(cone) });
    }

    // Chevron arrow, nose at the front.
    const s = ARROW_PX * px;
    const arrow: [number, number][] = [
      [0, 0.62 * s],
      [0.42 * s, -0.42 * s],
      [0, -0.2 * s],
      [-0.42 * s, -0.42 * s],
    ].map(([x, y]) => turn(x!, y!, g.heading));
    features.push({ type: 'Feature', properties: { part: 'arrow' }, geometry: poly(arrow) });

    return { type: 'FeatureCollection', features };
  }, [g, facing, accuracy, zoom]);

  return (
    <>
      <GeoJSONSource id="walker" data={shapes}>
        <Layer
          id="walker-accuracy"
          type="fill"
          filter={['==', ['get', 'part'], 'accuracy']}
          paint={{ 'fill-color': colors.interactive, 'fill-opacity': 0.14, 'fill-outline-color': colors.interactive }}
        />
        <Layer
          id="walker-cone"
          type="fill"
          filter={['==', ['get', 'part'], 'cone']}
          paint={{ 'fill-color': colors.interactive, 'fill-opacity': 0.3 }}
        />
        <Layer
          id="walker-arrow-edge"
          type="line"
          filter={['==', ['get', 'part'], 'arrow']}
          layout={{ 'line-join': 'round' }}
          paint={{ 'line-color': colors.white, 'line-width': 4 }}
        />
        <Layer
          id="walker-arrow"
          type="fill"
          filter={['==', ['get', 'part'], 'arrow']}
          paint={{ 'fill-color': night ? colors.interactive : colors.navy }}
        />
      </GeoJSONSource>
      {/* Map shapes are not read by TalkBack; this empty marker says where you are. */}
      <Marker lngLat={at} anchor="center" style={{ zIndex: mapZ.you }}>
        <View accessible accessibilityLabel={t('pin.you')} style={styles.a11y} />
      </Marker>
    </>
  );
}

const styles = StyleSheet.create({
  a11y: { width: 24, height: 24 },
});
