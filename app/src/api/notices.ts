import { supabase } from './supabase';

// News for a reporter (guide Section 16.4; migration 20): the council planned or
// fixed one of their improvement requests. Fetched when the app opens; marked seen
// once shown.

export type Notice = {
  id: number;
  kind: 'planned' | 'fixed';
  category: string;
  street: string | null;
  points: number;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function myNotices(): Promise<Notice[]> {
  const { data, error } = await supabase.rpc('my_notices');
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return data.filter(isObj).flatMap((v) =>
    typeof v.id === 'number' && (v.kind === 'planned' || v.kind === 'fixed') && typeof v.cat === 'string'
      ? [
          {
            id: v.id,
            kind: v.kind,
            category: v.cat,
            street: typeof v.street === 'string' ? v.street : null,
            points: typeof v.points === 'number' ? v.points : 0,
          },
        ]
      : [],
  );
}

export async function noticesSeen(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.rpc('notices_seen', { p_ids: ids });
  if (error) throw new Error(error.message);
}
