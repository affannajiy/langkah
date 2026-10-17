import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../../theme/theme';
import { BADGES, FRAMES } from './catalog';

type Props = { size: number; frame: string | null; badge: string | null; fill: string; children: ReactNode };

// The Me tab's account picture with its frame and badge (shop cosmetics, Plus).
export function Avatar({ size, frame, badge, fill, children }: Props) {
  const f = frame ? FRAMES[frame] : undefined;
  const b = badge ? BADGES[badge] : undefined;
  const ring = f ? f.width + (f.double ? 4 : 0) + 2 : 0;
  const BadgeIcon = b?.icon;
  const badgeSize = Math.round(size * 0.42);
  return (
    <View style={{ width: size + ring * 2, height: size + ring * 2 }} importantForAccessibility="no-hide-descendants">
      {f && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: 999, borderWidth: f.width, borderColor: f.ring, borderStyle: f.dashed ? 'dashed' : 'solid' },
          ]}
        />
      )}
      {f?.double && (
        <View style={[StyleSheet.absoluteFill, { margin: f.width + 2, borderRadius: 999, borderWidth: 1.5, borderColor: f.ring }]} />
      )}
      <View
        style={[
          styles.inner,
          { margin: ring, width: size, height: size, borderRadius: size / 2, backgroundColor: fill },
        ]}
      >
        {children}
      </View>
      {b && BadgeIcon && (
        <View style={[styles.badge, { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2, backgroundColor: b.fill }]}>
          <BadgeIcon size={badgeSize * 0.6} color={b.color} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -2, bottom: -2, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
});
