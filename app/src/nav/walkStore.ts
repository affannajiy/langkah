import type { LngLat } from '@maplibre/maplibre-react-native';

import type { Route, RouteOptions, ScoringMode, StreetQuest } from '../api/types';
import type { RouteKind } from '../map/RouteLayers';
import { resetGpsDistance } from './walkLocation';

// The walk the user just started, handed from route compare to the walking screen,
// and its result, handed on to the Arrival screen. Routes are too big for URL
// params, and none of this needs to outlive the app.
export type Walk = {
  route: Route;
  kind: RouteKind;
  mode: ScoringMode;
  options: RouteOptions; // a reroute plans with the same options
  to: { name: string; lngLat: LngLat };
  startedAt: number;
  // Active hazards on the fastest route, when the walker chose a different, safer
  // one. Null when they walked the fastest route (or both were the same).
  fastestHazards: number | null;
};

export type Arrival = {
  to: { name: string; lngLat: LngLat };
  walkedM: number;
  gpsM: number; // measured from GPS fixes, sent for walk points
  durationS: number;
  // Hazards on the fastest route that the chosen route left out. Null when there was
  // nothing to compare with; the screen then shows the hazards it warned about.
  avoided: number | null;
  warned: number;
  mode: ScoringMode;
  kind: RouteKind;
  score: number;
  trail: LngLat[]; // the route just walked, drawn faintly if the user reports next
  quests: StreetQuest[]; // street checks for the Arrival screen (Phase 23)
};

let current: Walk | null = null;
let arrival: Arrival | null = null;

export function setWalk(walk: Walk | null) {
  // A new walk measures its GPS distance from zero (walk points).
  if (walk) resetGpsDistance();
  current = walk;
}

export function getWalk(): Walk | null {
  return current;
}

export function setArrival(next: Arrival | null) {
  arrival = next;
}

export function getArrival(): Arrival | null {
  return arrival;
}

// "Spot anything new?" on the Arrival screen: the Map tab opens the report flow here,
// with the route just walked drawn faintly. Taken once.
export type ReportAfterWalk = { at: LngLat; trail: LngLat[] };
let reportAfter: ReportAfterWalk | null = null;

export function setReportAfterWalk(next: ReportAfterWalk | null) {
  reportAfter = next;
}

export function takeReportAfterWalk(): ReportAfterWalk | null {
  const r = reportAfter;
  reportAfter = null;
  return r;
}
