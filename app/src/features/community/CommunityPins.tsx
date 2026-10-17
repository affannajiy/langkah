import { Marker } from '@maplibre/maplibre-react-native';
import { ArrowUp, Clock } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CommunityReport } from '../../api/reports';
import { HazardMark } from '../../map/MapPins';
import { colors, radius } from '../../theme/theme';
import { categoryKey } from '../report/categoryIcons';

// Improvement request: pink rounded square with an up arrow (community colour).
export function ImprovementMark() {
  return (
    <View style={styles.improvement}>
      <ArrowUp size={18} color={colors.text} strokeWidth={2.75} />
    </View>
  );
}

type Props = { items: CommunityReport[]; onPress: (r: CommunityReport) => void };

// Community map view. Pending reports carry a small clock badge, so status is
// shown by shape as well as words in the detail sheet.
export const CommunityPins = memo(function CommunityPins({ items, onPress }: Props) {
  const { t } = useTranslation();
  return (
    <>
      {items.map((r) => (
        // On Android a tap reaches the Marker, not the Pressable inside it; the Pressable stays for TalkBack.
        <Marker key={r.id} lngLat={r.lngLat} anchor="center" onPress={() => onPress(r)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t(categoryKey(r.kind, r.category))}, ${t(`community.status.${r.status}`)}`}
            onPress={() => onPress(r)}
            hitSlop={8}
            style={styles.hit}
          >
            {r.kind === 'hazard' ? <HazardMark size={34} /> : <ImprovementMark />}
            {r.status === 'pending' && (
              <View style={styles.badge}>
                <Clock size={12} color={colors.white} strokeWidth={3} />
              </View>
            )}
          </Pressable>
        </Marker>
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  hit: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  improvement: {
    width: 32,
    height: 32,
    borderRadius: radius.card / 2,
    backgroundColor: colors.community,
    borderWidth: 2,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.navy,
    borderWidth: 1.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
