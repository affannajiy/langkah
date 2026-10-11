import { StyleSheet } from 'react-native';

import { colors, spacing } from '../theme/theme';

// Shared so the Map screen can hide the bar during search and route compare
// (docs/screens/Search.png and RouteCompare.png show no tab bar) and put it back after.
export const tabBarStyles = StyleSheet.create({
  bar: {
    backgroundColor: colors.white,
    borderTopColor: colors.border,
    height: 80,
    paddingTop: spacing.sm,
  },
  hidden: { display: 'none' },
});
