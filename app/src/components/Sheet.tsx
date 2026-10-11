import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';

import { colors, radius, shadow, spacing } from '../theme/theme';

type Props = {
  visible: boolean;
  children: ReactNode;
};

// Small non-blocking bottom sheet, sitting above the tab bar.
// The map stays visible and usable behind it. For a sheet the user resizes
// (route compare), use BottomSheet instead.
export function Sheet({ visible, children }: Props) {
  const offset = useRef(new Animated.Value(visible ? 0 : 1)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      const toValue = visible ? 0 : 1;
      if (reduce) offset.setValue(toValue);
      else Animated.spring(offset, { toValue, useNativeDriver: true, bounciness: 2 }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [visible, offset]);

  const translateY = offset.interpolate({ inputRange: [0, 1], outputRange: [0, 400] });

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[styles.sheet, { transform: [{ translateY }] }]}
    >
      <View style={styles.handle} />
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    ...shadow.floating,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.handle,
    marginBottom: spacing.sm,
  },
});
