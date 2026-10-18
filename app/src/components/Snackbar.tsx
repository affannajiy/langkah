import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { useSideInset } from '../theme/layout';
import { useEnter } from '../theme/motion';
import { colors, radius, shadow, spacing, touchTarget } from '../theme/theme';
import { AppText } from './AppText';

export type SnackbarMessage = { text: string; actionLabel?: string; onAction?: () => void };

const SHOW_MS = 3000;
// An Undo needs a little longer to reach with a thumb.
const SHOW_WITH_ACTION_MS = 5000;

// Confirms an action and hides itself (guide Section 5.3). Never blocks the map.
export function useSnackbar() {
  const [message, setMessage] = useState<SnackbarMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setMessage(null);
  }, []);

  const show = useCallback(
    (next: SnackbarMessage) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(next);
      timer.current = setTimeout(hide, next.onAction ? SHOW_WITH_ACTION_MS : SHOW_MS);
    },
    [hide],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { message, show, hide };
}

type Props = { message: SnackbarMessage | null; onHide: () => void; bottom: number };

export function Snackbar({ message, onHide, bottom }: Props) {
  if (!message) return null;
  // A new message is a new bar, so each one slides in (guide Section 17.3).
  return <Bar key={`${message.text}:${message.actionLabel ?? ''}`} message={message} onHide={onHide} bottom={bottom} />;
}

function Bar({ message, onHide, bottom }: Props & { message: SnackbarMessage }) {
  const side = useSideInset(spacing.md);
  const enter = useEnter();
  const lift = enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  return (
    <Animated.View
      style={[styles.bar, { bottom, left: side, right: side, opacity: enter, transform: [{ translateY: lift }] }]}
      accessibilityLiveRegion="polite"
    >
      <AppText variant="label" color={colors.white} style={styles.text}>
        {message.text}
      </AppText>
      {message.actionLabel && message.onAction && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            message.onAction?.();
            onHide();
          }}
          style={styles.action}
        >
          <AppText variant="label" color={colors.onNavyAccent}>
            {message.actionLabel}
          </AppText>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    minHeight: touchTarget,
    backgroundColor: colors.navy,
    borderRadius: radius.card,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.floating,
    // Above floating buttons (same elevation would let a tap reach the Report button).
    elevation: shadow.floating.elevation * 2,
    zIndex: 10,
  },
  text: { flex: 1, paddingVertical: spacing.sm },
  action: { minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: spacing.md, justifyContent: 'center' },
});
