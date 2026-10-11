import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { sendExport } from '../../api/reports';

// "Most requested in Ipoh" for councils (guide Section 6.3, screen 7): improvement
// requests ranked by upvotes, as CSV or GeoJSON, handed to the Android share sheet.
// No names or user ids are in the export (community_export never returns them).

export type ExportFormat = 'csv' | 'geojson';

type Row = {
  id: string;
  cat: string;
  lon: number;
  lat: number;
  upvotes: number;
  status: string;
  created: string;
  street: string | null;
  note: string | null;
};

const COLUMNS = ['rank', 'id', 'category', 'upvotes', 'status', 'street', 'lon', 'lat', 'created_at', 'note'] as const;

function toRow(v: Record<string, unknown>): Row {
  return {
    id: String(v.id ?? ''),
    cat: String(v.cat ?? ''),
    lon: Number(v.lon) || 0,
    lat: Number(v.lat) || 0,
    upvotes: Number(v.upvotes) || 0,
    status: String(v.status ?? ''),
    created: String(v.created ?? ''),
    street: typeof v.street === 'string' ? v.street : null,
    note: typeof v.note === 'string' ? v.note : null,
  };
}

// RFC 4180 quoting. A leading =, +, - or @ is prefixed with ' so a spreadsheet
// never runs a note as a formula (CSV injection).
function cell(v: string | number | null): string {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(rows: Row[]): string {
  const lines = [COLUMNS.join(',')];
  rows.forEach((r, i) =>
    lines.push([i + 1, r.id, r.cat, r.upvotes, r.status, r.street, r.lon, r.lat, r.created, r.note].map(cell).join(',')),
  );
  return lines.join('\r\n') + '\r\n';
}

function geojson(rows: Row[]): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: rows.map((r, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: { rank: i + 1, id: r.id, category: r.cat, upvotes: r.upvotes, status: r.status, street: r.street, created_at: r.created, note: r.note },
    })),
  });
}

// Returns how many requests were exported.
export async function shareExport(format: ExportFormat, dialogTitle: string): Promise<number> {
  const rows = (await sendExport()).map((v) => toRow(v as Record<string, unknown>));
  const day = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `langkah-most-requested-${day}.${format}`);
  file.create({ overwrite: true });
  file.write(format === 'csv' ? csv(rows) : geojson(rows));
  await Sharing.shareAsync(file.uri, {
    mimeType: format === 'csv' ? 'text/csv' : 'application/geo+json',
    dialogTitle,
  });
  return rows.length;
}
