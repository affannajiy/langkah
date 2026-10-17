import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chromeTextScale, colors, spacing, type } from '../theme/theme';

// Icon pill (32) + gap (4) + one label line, with padding above and below.
const ICON_PILL = 32;

// The tab bar's height for this phone. It grows with the label's font scale (capped)
// and adds the system navigation bar (gesture line or 3 buttons) below, so the tabs
// are never squeezed under it on any Android phone.
export function useTabBarStyle() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const label = Math.ceil(type.label.lineHeight * Math.min(fontScale, chromeTextScale));
  const height = spacing.sm + ICON_PILL + spacing.xs + label + spacing.sm + insets.bottom;
  return useMemo(() => [tabBarStyles.bar, { height }], [height]);
}

// Shared so the Map screen can hide the bar during search and route compare
// (docs/screens/Search.png and RouteCompare.png show no tab bar) and put it back after.
export const tabBarStyles = StyleSheet.create({
  bar: {
    backgroundColor: colors.white,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  hidden: { display: 'none' },
});
