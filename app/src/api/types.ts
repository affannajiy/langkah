import type { LngLat } from '@maplibre/maplibre-react-native';

// Shapes returned by the Supabase functions in supabase/migrations (Phase 2 and 3).

export type ScoringMode = 'day' | 'night';

export type Place = {
  name: string;
  area: string | null;
  category: string | null;
  lngLat: LngLat;
  // Straight-line metres from the user, when the search knew where they were.
  distM: number | null;
};

export type StepType =
  | 'depart'
  | 'left'
  | 'right'
  | 'slight_left'
  | 'slight_right'
  | 'straight'
  | 'cross'
  | 'arrive';

export type Step = {
  t: StepType;
  n?: string; // street name
  l?: { k: 'crossing' | 'signals' | 'bus_stop' | 'shelter' | 'place'; n?: string }; // landmark
  x?: 'marked' | 'signals' | 'unmarked'; // crossing kind
  d?: number; // metres to the next step
  i: number; // index into the route points
};

export type RouteStats = {
  sw: number; // % with sidewalk or path
  lit: number; // % lit
  unk: number; // % not yet checked
  nosw: number; // metres with no sidewalk
  mx: number; // marked crossings
  ux: number; // unmarked main-road crossings
  hz: number; // active hazards within 15 m
};

export type Route = {
  points: LngLat[];
  distM: number;
  timeS: number;
  score: number;
  stats: RouteStats;
  steps: Step[];
  // [from, to] point index ranges on streets that are not yet checked.
  unchecked: [number, number][];
};

export type RoutePair = {
  mode: ScoringMode;
  same: boolean;
  safest: Route;
  fastest: Route;
};

export type RouteError =
  | 'bad_mode'
  | 'bad_point'
  | 'too_far'
  | 'too_close'
  | 'start_off_network'
  | 'end_off_network'
  | 'no_route'
  // App-side failures
  | 'outside_pilot'
  | 'start_outside_pilot'
  | 'no_start'
  | 'network'
  | 'generic';

// Hazard categories, in the order of the Quick report tiles (docs/screens/QuickReport.png).
export const HAZARD_CATEGORIES = [
  'broken_sidewalk',
  'blocked_path',
  'no_light',
  'unsafe_crossing',
  'flooding',
  'other',
] as const;
export type HazardCategory = (typeof HAZARD_CATEGORIES)[number];

// Improvement requests, worded as asks so the category doubles as the card title.
// Kept in step with report_category_ok() in the database.
export const IMPROVEMENT_CATEGORIES = [
  'zebra_crossing',
  'repaint_crossing',
  'fix_sidewalk',
  'street_lights',
  'shelter',
  'kerb_ramp',
  'other',
] as const;

export type ImprovementCategory = (typeof IMPROVEMENT_CATEGORIES)[number];

export type ReportKind = 'hazard' | 'improvement';

export type MapAmenityKind = 'crossing' | 'bus_stop' | 'shelter';

// A partner shop on the map and its voucher (guide Section 15.6). Names are proper
// nouns; the offer comes in both languages from the server.
export type SponsoredPin = {
  id: string;
  lngLat: LngLat;
  name: string;
  offer: { en: string; ms: string };
  rm: number;
  item: string; // shop_items id of the voucher
  cost: number;
  address: string;
};

export type MapView = {
  hazards: { id: string; lngLat: LngLat; category: string }[];
  amenities: { kind: MapAmenityKind; lngLat: LngLat }[];
  sponsored: SponsoredPin[]; // at most 3, closest to the middle of the view
  counts: { hazards: number; improvements: number };
};
