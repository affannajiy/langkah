import type { LngLat } from '@maplibre/maplibre-react-native';

// Flat-earth maths for walking distances. Fine at the scale of a 10 km walk.

const M_PER_DEG = 111_320;

export function metres(a: LngLat, b: LngLat): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * M_PER_DEG;
}

// Compass bearing from a to b, 0 = north, clockwise.
export function bearing(a: LngLat, b: LngLat): number {
  const k = Math.cos((a[1] * Math.PI) / 180);
  const deg = (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180) / Math.PI;
  return (deg + 360) % 360;
}

// A route line with the distance from its start to each point.
export type Track = { points: LngLat[]; cum: number[]; total: number };

export function makeTrack(points: LngLat[]): Track {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1]! + metres(points[i - 1]!, points[i]!));
  return { points, cum, total: cum[cum.length - 1] ?? 0 };
}

export type Snap = {
  along: number; // metres from the route start to the nearest point on the line
  off: number; // metres from the fix to the line
  at: LngLat; // that nearest point
};

function snapToSegment(track: Track, i: number, p: LngLat): Snap {
  const a = track.points[i]!;
  const b = track.points[i + 1]!;
  const k = Math.cos((p[1] * Math.PI) / 180);
  const dx = (b[0] - a[0]) * k;
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * k * dx + (p[1] - a[1]) * dy) / len2));
  const at: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { along: track.cum[i]! + t * (track.cum[i + 1]! - track.cum[i]!), off: metres(p, at), at };
}

// Nearest point on the line. Near `hint` (the last known progress) is preferred, so a
// route that comes back past itself does not make the walker jump ahead or back.
export function snap(track: Track, p: LngLat, hint: number | null, near = 30): Snap {
  let best: Snap | null = null;
  let bestNear: Snap | null = null;
  for (let i = 0; i < track.points.length - 1; i++) {
    const s = snapToSegment(track, i, p);
    if (!best || s.off < best.off) best = s;
    if (hint !== null && s.along >= hint - near && s.along <= hint + 200 && (!bestNear || s.off < bestNear.off)) bestNear = s;
  }
  if (!best) return { along: 0, off: metres(p, track.points[0]!), at: track.points[0]! };
  return bestNear && bestNear.off <= near ? bestNear : best;
}

export function pointAt(track: Track, along: number): LngLat {
  const d = Math.max(0, Math.min(track.total, along));
  let i = 0;
  while (i < track.cum.length - 2 && track.cum[i + 1]! < d) i++;
  const a = track.points[i]!;
  const b = track.points[i + 1] ?? a;
  const span = track.cum[i + 1]! - track.cum[i]!;
  const t = span > 0 ? (d - track.cum[i]!) / span : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Direction of the line over the next few metres, for a heading-up map.
export function bearingAt(track: Track, along: number, ahead = 20): number {
  const from = Math.min(along, Math.max(0, track.total - ahead));
  return bearing(pointAt(track, from), pointAt(track, from + ahead));
}

// The part of the line between two distances, for drawing walked and remaining parts.
export function slice(track: Track, from: number, to: number): LngLat[] {
  const a = Math.max(0, Math.min(track.total, from));
  const b = Math.max(a, Math.min(track.total, to));
  const out: LngLat[] = [pointAt(track, a)];
  for (let i = 0; i < track.points.length; i++) {
    if (track.cum[i]! > a && track.cum[i]! < b) out.push(track.points[i]!);
  }
  out.push(pointAt(track, b));
  return out;
}
