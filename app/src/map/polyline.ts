import type { LngLat } from '@maplibre/maplibre-react-native';

// Decodes a Google encoded polyline (what PostGIS ST_AsEncodedPolyline returns) into
// [lng, lat] pairs. precision 5 = 1e5 = about 1 m (guide Section 7.4).
// Written here rather than adding a dependency for 30 lines.
export function decodePolyline(encoded: string, precision = 5): LngLat[] {
  const factor = 10 ** precision;
  const points: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const dLat = readValue();
    const dLng = readValue();
    if (dLat === null || dLng === null) throw new Error('Polyline is cut short');
    lat += dLat;
    lng += dLng;
    points.push([lng / factor, lat / factor]);
  }
  return points;

  // One zig-zag encoded signed number, 5 bits per character.
  function readValue(): number | null {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new Error('Polyline has an invalid character');
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}

// The other way: [lng, lat] pairs to an encoded polyline, for the live share link.
export function encodePolyline(points: LngLat[], precision = 5): string {
  const factor = 10 ** precision;
  let out = '';
  let lastLat = 0;
  let lastLng = 0;
  for (const [lng, lat] of points) {
    const la = Math.round(lat * factor);
    const ln = Math.round(lng * factor);
    out += writeValue(la - lastLat) + writeValue(ln - lastLng);
    lastLat = la;
    lastLng = ln;
  }
  return out;

  function writeValue(n: number): string {
    let v = n < 0 ? ~(n << 1) : n << 1;
    let s = '';
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return s + String.fromCharCode(v + 63);
  }
}
