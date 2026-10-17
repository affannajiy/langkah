import { createContext, useContext } from 'react';
import { Text, type TextProps } from 'react-native';

import { colors, fontFamily, type, type TypeVariant } from '../theme/theme';

type Props = TextProps & {
  variant?: TypeVariant;
  color?: string;
};

// The largest font scale for text inside it. Map screens set chromeTextScale so big
// phone text never covers the map; a sheet with a list or form sets it back to undefined.
export const TextScaleCap = createContext<number | undefined>(undefined);

// Every piece of UI text goes through this, so the font is never the system default.
export function AppText({ variant = 'body', color = colors.text, style, maxFontSizeMultiplier, ...rest }: Props) {
  const cap = useContext(TextScaleCap);
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? cap}
      style={[{ fontFamily, color }, type[variant], style]}
    />
  );
}
