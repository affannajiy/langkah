import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { usePressScale } from '../theme/motion';

type Props = PressableProps & {
  // Layout for the moving wrapper (flex, alignSelf); the Pressable keeps its own style.
  wrapStyle?: StyleProp<ViewStyle>;
};

// A Pressable that shrinks to 96% while held, like the map apps do (guide Section 17.3).
// Skipped with Reduce Motion.
export function ScalePressable({ wrapStyle, onPressIn, onPressOut, ...rest }: Props) {
  const press = usePressScale();
  return (
    <Animated.View style={[wrapStyle, { transform: [{ scale: press.scale }] }]}>
      <Pressable
        {...rest}
        onPressIn={(e) => {
          press.onPressIn();
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          press.onPressOut();
          onPressOut?.(e);
        }}
      />
    </Animated.View>
  );
}
