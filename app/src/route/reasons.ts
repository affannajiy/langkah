import type { TFunction } from 'i18next';

import type { RouteStats } from '../api/types';
import { formatDistance } from '../i18n/format';

export type Reason = { label: string; tone: 'good' | 'warn' };

// Safest gets room for three reasons, fastest for its two biggest warnings
// (docs/screens/RouteCompare.png).
const MAX_CHIPS = { safest: 3, fastest: 2 } as const;
// Thresholds for a "good" chip. Below these a figure is not worth praising.
const SIDEWALK_GOOD_PCT = 50;
const LIT_GOOD_PCT = 70;
const UNCHECKED_WARN_PCT = 50;
const COVERED_GOOD_PCT = 30;

// Plain reasons for a route card (guide Sections 5.2 and 6.3, screen 3).
// Safest leads with what it has; fastest leads with what it lacks.
export function routeReasons(stats: RouteStats, kind: 'safest' | 'fastest', t: TFunction): Reason[] {
  const good: Reason[] = [];
  const warn: Reason[] = [];

  if (stats.sw >= SIDEWALK_GOOD_PCT) good.push({ tone: 'good', label: t('route.chip.sidewalk', { pct: stats.sw }) });
  if (stats.lit >= LIT_GOOD_PCT) good.push({ tone: 'good', label: t('route.chip.wellLit') });
  if (stats.cov >= COVERED_GOOD_PCT) good.push({ tone: 'good', label: t('route.chip.covered', { pct: stats.cov }) });
  if (stats.mx > 0) good.push({ tone: 'good', label: t('route.chip.marked', { count: stats.mx }) });
  if (stats.hz === 0) good.push({ tone: 'good', label: t('route.chip.noHazards') });

  // The hazard and "not yet checked" warnings must never drop off (test note F10).
  const must: Reason[] = [];
  if (stats.hz > 0) must.push({ tone: 'warn', label: t('route.chip.hazards', { count: stats.hz }) });
  if (stats.nosw > 0) warn.push({ tone: 'warn', label: t('route.chip.noSidewalk', { distance: formatDistance(stats.nosw) }) });
  if (stats.ux > 0) warn.push({ tone: 'warn', label: t('route.chip.unmarked', { count: stats.ux }) });
  if (stats.unk >= UNCHECKED_WARN_PCT) must.push({ tone: 'warn', label: t('route.chip.unchecked', { pct: stats.unk }) });

  const max = MAX_CHIPS[kind];
  if (kind === 'fastest') return [...must, ...warn, ...good].slice(0, max);
  // Safest leads with what it has, but gives up a good chip for a must-keep warning.
  const kept = must.slice(0, max);
  return [...good.slice(0, max - kept.length), ...kept, ...warn].slice(0, max);
}
