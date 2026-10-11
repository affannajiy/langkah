import {
  Accessibility,
  CircleEllipsis,
  Construction,
  Droplets,
  Footprints,
  Lamp,
  LightbulbOff,
  PaintRoller,
  Umbrella,
  type LucideProps,
} from 'lucide-react-native';
import type { ComponentType } from 'react';
import Svg, { Path } from 'react-native-svg';

import type { HazardCategory, ImprovementCategory, ReportKind } from '../../api/types';
import { colors } from '../../theme/theme';

// Broken slabs: two paving stones with a crack between them.
function BrokenSidewalk({ size = 32, color = colors.navy }: LucideProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 17h18M5 13h6l1.5-2.5L11 9h6l2 4h-6.5" />
      <Path d="M4 21h16" />
    </Svg>
  );
}

// Zebra crossing between two kerbs.
function Crossing({ size = 32, color = colors.navy }: LucideProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Path d="M4 4v16M20 4v16M8 7h8M8 12h8M8 17h8" />
    </Svg>
  );
}

export const HAZARD_ICONS: Record<HazardCategory, ComponentType<LucideProps>> = {
  broken_sidewalk: BrokenSidewalk,
  blocked_path: Construction,
  no_light: LightbulbOff,
  unsafe_crossing: Crossing,
  flooding: Droplets,
  other: CircleEllipsis,
};

export const IMPROVEMENT_ICONS: Record<ImprovementCategory, ComponentType<LucideProps>> = {
  zebra_crossing: Crossing,
  repaint_crossing: PaintRoller,
  fix_sidewalk: Footprints,
  street_lights: Lamp,
  shelter: Umbrella,
  kerb_ramp: Accessibility,
  other: CircleEllipsis,
};

export function categoryIcon(kind: ReportKind, category: string): ComponentType<LucideProps> {
  const icons: Record<string, ComponentType<LucideProps>> = kind === 'hazard' ? HAZARD_ICONS : IMPROVEMENT_ICONS;
  return icons[category] ?? CircleEllipsis;
}

export type CategoryKey = `hazard.${HazardCategory}` | `improvement.${ImprovementCategory}`;

// i18n key for a category title. Unknown categories read as "Other".
export function categoryKey(kind: ReportKind, category: string): CategoryKey {
  if (kind === 'hazard') {
    return `hazard.${category in HAZARD_ICONS ? (category as HazardCategory) : 'other'}`;
  }
  return `improvement.${category in IMPROVEMENT_ICONS ? (category as ImprovementCategory) : 'other'}`;
}
