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

// Plain reasons for a route card (guide Sections 5.2 and 6.3, screen 3).
// Safest leads with what it has; fastest leads with what it lacks.
export function routeReasons(stats: RouteStats, kind: 'safest' | 'fastest', t: TFunction): Reason[] {
  const good: Reason[] = [];
  const warn: Reason[] = [];

  if (stats.sw >= SIDEWALK_GOOD_PCT) good.push({ tone: 'good', label: t('route.chip.sidewalk', { pct: stats.sw }) });
  if (stats.lit >= LIT_GOOD_PCT) good.push({ tone: 'good', label: t('route.chip.wellLit') });
  if (stats.mx > 0) good.push({ tone: 'good', label: t('route.chip.marked', { count: stats.mx }) });
  if (stats.hz === 0) good.push({ tone: 'good', label: t('route.chip.noHazards') });

  if (stats.hz > 0) warn.push({ tone: 'warn', label: t('route.chip.hazards', { count: stats.hz }) });
  if (stats.nosw > 0) warn.push({ tone: 'warn', label: t('route.chip.noSidewalk', { distance: formatDistance(stats.nosw) }) });
  if (stats.ux > 0) warn.push({ tone: 'warn', label: t('route.chip.unmarked', { count: stats.ux }) });
  if (stats.unk >= UNCHECKED_WARN_PCT) warn.push({ tone: 'warn', label: t('route.chip.unchecked', { pct: stats.unk }) });

  const ordered = kind === 'safest' ? [...good, ...warn] : [...warn, ...good];
  return ordered.slice(0, MAX_CHIPS[kind]);
}
