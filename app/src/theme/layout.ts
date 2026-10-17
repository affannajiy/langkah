import { useWindowDimensions } from 'react-native';

import { compactHeight, maxContentWidth } from './theme';

// Left and right inset for a full-width overlay, so it is never wider than
// maxContentWidth. `base` is the inset it uses on a normal phone.
export function useSideInset(base = 0): number {
  const { width } = useWindowDimensions();
  return Math.max(base, (width - maxContentWidth) / 2);
}

// True when the window is very short (split screen, foldable in landscape).
export function useCompactHeight(): boolean {
  return useWindowDimensions().height < compactHeight;
}

// Style for a scrolling list's content: full width on phones, centred and capped on wide screens.
export const cappedContent = { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' } as const;
