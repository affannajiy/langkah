import { supabase } from './supabase';
import type { StreetQuest } from './types';

// Street checks after a walk (guide Section 16.6; migration 21). Only the street's
// OSM way ids and the answer are sent, never the route.

export type StreetAnswer = { points: number; agreed: boolean };

export async function streetAnswer(quest: StreetQuest, value: 'yes' | 'no'): Promise<StreetAnswer> {
  const { data, error } = await supabase.rpc('street_answer', { p_ways: quest.ways, p_attr: quest.attr, p_value: value });
  if (error) throw new Error(error.message);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('bad_response');
  const body = data as Record<string, unknown>;
  if (typeof body.error === 'string') throw new Error(body.error);
  return { points: typeof body.points === 'number' ? body.points : 0, agreed: body.agreed === true };
}
