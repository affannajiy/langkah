import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { radius, spacing, touchTarget } from '../../theme/theme';

export const AD_SECONDS = 30;

export type AdLook = {
  background: string;
  text: string; // small print on the background
  pill: string; // "Ad · 0:24" pill fill
  pillText: string;
  bar: string; // progress fill
  track: string;
};

type Props = {
  look: AdLook;
  left: number; // seconds left
  closable: boolean;
  footer: string;
  onClose: () => void;
  top: number;
  bottom: number;
  // Tealove draws its own story-style header instead of the pill.
  header?: ReactNode;
  children: ReactNode;
};

// The shared shell of every mock ad (docs/revenue-plan.md "Mock ads"): countdown,
// "made-up brand" note, a close button that unlocks at 0, and the progress bar.
export function AdFrame({ look, left, closable, footer, onClose, top, bottom, header, children }: Props) {
  const { t } = useTranslation();
  const progress = Math.min(1, (AD_SECONDS - left) / AD_SECONDS);
  const clock = `0:${String(Math.max(0, Math.ceil(left))).padStart(2, '0')}`;
  return (
    <View style={[styles.root, { backgroundColor: look.background, paddingTop: top + spacing.md, paddingBottom: bottom + spacing.md }]}>
      <View style={styles.top}>
        {header ?? (
          <>
            <View style={[styles.pill, { backgroundColor: look.pill }]}>
              <AppText variant="label" color={look.pillText}>
                {t('ads.pill', { clock })}
              </AppText>
            </View>
            <AppText variant="caption" color={look.text} style={styles.flex} numberOfLines={2}>
              {t('ads.mock')}
            </AppText>
          </>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closable ? t('ads.close') : t('ads.closeIn', { count: Math.ceil(left) })}
          accessibilityState={{ disabled: !closable }}
          onPress={() => closable && onClose()}
          style={[styles.close, { backgroundColor: look.pill }, !closable && styles.locked]}
        >
          <X size={26} color={look.pillText} />
        </Pressable>
      </View>

      <View style={styles.body}>{children}</View>

      <View
        style={[styles.track, { backgroundColor: look.track }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: AD_SECONDS, now: Math.round(AD_SECONDS - left) }}
      >
        <View style={[styles.bar, { backgroundColor: look.bar, width: `${progress * 100}%` }]} />
      </View>
      <AppText variant="caption" color={look.text} style={styles.footer} accessibilityLiveRegion="polite">
        {footer}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  close: { width: touchTarget + 4, height: touchTarget + 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  locked: { opacity: 0.45 },
  body: { flex: 1 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
  footer: { textAlign: 'center' },
});
