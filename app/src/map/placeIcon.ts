import {
  BedDouble,
  Briefcase,
  Bus,
  Coffee,
  GraduationCap,
  Hospital,
  House,
  Landmark,
  MapPin,
  School,
  ShoppingBag,
  Signpost,
  TrainFront,
  Trees,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native';

import type { SavedKey } from '../storage/places';

// Icon for a search result, from its OSM category ("key:value").
export function placeIcon(category: string | null): LucideIcon {
  if (!category) return MapPin;
  const [key, value = ''] = category.split(':');
  if (key === 'highway') return Signpost;
  if (key === 'railway' || value === 'station') return TrainFront;
  if (key === 'public_transport' || value === 'bus_station') return Bus;
  if (key === 'shop' || value === 'marketplace') return ShoppingBag;
  if (value === 'cafe') return Coffee;
  if (['restaurant', 'fast_food', 'food_court', 'bar'].includes(value)) return Utensils;
  if (['hotel', 'hostel', 'guest_house', 'motel'].includes(value)) return BedDouble;
  if (['hospital', 'clinic', 'pharmacy', 'doctors'].includes(value) || key === 'healthcare') return Hospital;
  if (value === 'university' || value === 'college') return GraduationCap;
  if (value === 'school' || value === 'kindergarten') return School;
  if (['park', 'garden'].includes(value)) return Trees;
  if (key === 'office' || key === 'historic' || ['townhall', 'museum', 'attraction'].includes(value)) return Landmark;
  return MapPin;
}

export const SAVED_ICONS: Record<SavedKey, LucideIcon> = {
  home: House,
  utp: GraduationCap,
  work: Briefcase,
};
