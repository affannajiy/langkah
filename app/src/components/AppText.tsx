import { Text, type TextProps } from 'react-native';

import { colors, fontFamily, type, type TypeVariant } from '../theme/theme';

type Props = TextProps & {
  variant?: TypeVariant;
  color?: string;
};

// Every piece of UI text goes through this, so the font is never the system default.
export function AppText({ variant = 'body', color = colors.text, style, ...rest }: Props) {
  return <Text {...rest} style={[{ fontFamily, color }, type[variant], style]} />;
}
