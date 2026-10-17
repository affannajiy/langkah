import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSideInset } from '../theme/layout';
import { colors, radius, shadow, spacing } from '../theme/theme';

type Props = {
  visible: boolean;
  children: ReactNode;
  // True on screens without the tab bar (the walk): keeps the buttons above the
  // phone's gesture line or 3-button bar.
  overSystemBar?: boolean;
};

// Extra slide past the sheet's own height, so its shadow is off screen too.
const HIDE_MARGIN = 24;

// Small non-blocking bottom sheet, sitting above the tab bar.
// The map stays visible and usable behind it. For a sheet the user resizes
// (route compare), use BottomSheet instead.
export function Sheet({ visible, children, overSystemBar }: Props) {
  const insets = useSafeAreaInsets();
  // Hidden sheets slide down by their own measured height. A fixed distance left the
  // top of a tall sheet (big text, small screen) peeking over the tab bar.
  const { height: screenH } = useWindowDimensions();
  const [height, setHeight] = useState(screenH);
  const side = useSideInset();
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

  const translateY = offset.interpolate({ inputRange: [0, 1], outputRange: [0, height + HIDE_MARGIN] });

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      style={[
        styles.sheet,
        { left: side, right: side },
        // Never taller than the screen: the content scrolls instead (largest text sizes).
        { maxHeight: screenH - insets.top - spacing.lg },
        overSystemBar && { paddingBottom: spacing.lg + insets.bottom },
        { transform: [{ translateY }] },
      ]}
    >
      <View style={styles.handle} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false}>
        {children}
      </ScrollView>
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
    ...shadow.floating,
  },
  scroll: { flexGrow: 0 },
  content: { gap: spacing.md },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.handle,
    marginBottom: spacing.sm,
  },
});
