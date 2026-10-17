import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useSideInset } from '../theme/layout';
import { colors, radius, shadow, spacing } from '../theme/theme';

type Props = {
  // Visible heights in dp, smallest first. The sheet rests on one of them.
  snapPoints: number[];
  index: number;
  onIndexChange: (index: number) => void;
  // When set, dragging below the smallest height closes the sheet.
  onDismiss?: () => void;
  header?: ReactNode;
  children: ReactNode;
  style?: ViewStyle;
};

const DISMISS_DRAG = 80;
const FLICK_VELOCITY = 0.6;

// Draggable bottom sheet with snap points (guide Section 5.3). Drag happens on the
// handle and header only, so lists inside still scroll. The handle is also a button
// that steps between sizes, for people who cannot drag (WCAG 2.5.7).
export function BottomSheet({ snapPoints, index, onIndexChange, onDismiss, header, children, style }: Props) {
  const { t } = useTranslation();
  const side = useSideInset();
  const maxH = Math.max(...snapPoints);
  const offsetFor = (i: number) => maxH - (snapPoints[i] ?? snapPoints[0] ?? 0);
  const y = useRef(new Animated.Value(offsetFor(index))).current;
  const start = useRef(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Keep the latest values for the pan handlers, which are created once.
  const live = useRef({ snapPoints, index, onIndexChange, onDismiss, maxH });
  live.current = { snapPoints, index, onIndexChange, onDismiss, maxH };

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    const toValue = offsetFor(index);
    if (reduceMotion) y.setValue(toValue);
    else Animated.spring(y, { toValue, useNativeDriver: true, bounciness: 2 }).start();
    // offsetFor only depends on snapPoints, which the joined key below covers.
  }, [index, snapPoints.join(','), reduceMotion, y]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          y.stopAnimation((v) => {
            start.current = v;
          });
        },
        onPanResponderMove: (_, g) => {
          const { maxH: h, snapPoints: sp } = live.current;
          const lowest = h - Math.min(...sp);
          const v = Math.max(0, Math.min(start.current + g.dy, lowest + DISMISS_DRAG * 2));
          y.setValue(v);
        },
        onPanResponderRelease: (_, g) => {
          const { snapPoints: sp, index: cur, onIndexChange: change, onDismiss: dismiss, maxH: h } = live.current;
          const pos = start.current + g.dy;
          const lowest = h - Math.min(...sp);
          if (dismiss && (pos > lowest + DISMISS_DRAG || (g.vy > FLICK_VELOCITY * 2 && cur === 0))) {
            dismiss();
            return;
          }
          // Flick moves one step; otherwise rest on the nearest height.
          let next: number;
          if (g.vy < -FLICK_VELOCITY) next = Math.min(cur + 1, sp.length - 1);
          else if (g.vy > FLICK_VELOCITY) next = Math.max(cur - 1, 0);
          else {
            const visible = h - pos;
            next = sp.reduce((best, s, i) => (Math.abs(s - visible) < Math.abs((sp[best] ?? 0) - visible) ? i : best), 0);
          }
          if (next === cur) {
            Animated.spring(y, { toValue: h - (sp[cur] ?? 0), useNativeDriver: true, bounciness: 2 }).start();
          } else change(next);
        },
      }),
    [y],
  );

  const canGrow = index < snapPoints.length - 1;
  const resizable = snapPoints.length > 1;

  return (
    <Animated.View style={[styles.sheet, { left: side, right: side, height: maxH, transform: [{ translateY: y }] }, style]}>
      <View {...pan.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={canGrow ? t('sheet.expand') : t('sheet.collapse')}
          accessibilityHint={t('sheet.handleHint')}
          disabled={!resizable}
          onPress={() => onIndexChange(canGrow ? index + 1 : 0)}
          style={styles.handleArea}
          importantForAccessibility={resizable ? 'yes' : 'no-hide-descendants'}
        >
          <View style={styles.handle} />
        </Pressable>
        {header}
      </View>
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
    ...shadow.floating,
  },
  handleArea: { height: 24, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.handle },
});
