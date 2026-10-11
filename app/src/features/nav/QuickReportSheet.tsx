import type { LngLat } from '@maplibre/maplibre-react-native';
import { Check, MapPin, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { HAZARD_CATEGORIES, type HazardCategory } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { AppText } from '../../components/AppText';
import { Sheet } from '../../components/Sheet';
import { colors, radius, spacing, touchTarget } from '../../theme/theme';
import { HAZARD_ICONS } from '../report/categoryIcons';

const SEND_AFTER_S = 3;

type Props = {
  visible: boolean;
  at: LngLat | null; // where the report is pinned: the walker's position when the sheet opened
  street: string | null;
  onSend: (category: HazardCategory, at: LngLat) => void;
  onClose: () => void;
};

// Six big tiles; one tap pins the hazard where the walker is and sends it after a
// 3 s countdown with Undo (guide Section 6.3, screen 5; docs/screens/QuickReport.png).
export function QuickReportSheet({ visible, at, street, onSend, onClose }: Props) {
  const { t } = useTranslation();
  const { isFull } = useAuth();
  const [picked, setPicked] = useState<HazardCategory | null>(null);
  const [left, setLeft] = useState(SEND_AFTER_S);

  // Closing the sheet cancels a pending send.
  useEffect(() => {
    if (!visible) setPicked(null);
  }, [visible]);

  useEffect(() => {
    if (!picked) return;
    const timer = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(timer);
  }, [picked]);

  useEffect(() => {
    if (picked && at && left <= 0) {
      setPicked(null);
      onSend(picked, at);
    }
  }, [left, picked, at, onSend]);

  return (
    <>
      {visible && (
        <Pressable
          style={styles.scrim}
          accessibilityRole="button"
          accessibilityLabel={t('quick.close')}
          onPress={onClose}
        />
      )}
      <Sheet visible={visible}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <AppText variant="title" color={colors.navy} accessibilityRole="header">
              {t('quick.title')}
            </AppText>
            <View style={styles.pinned}>
              <MapPin size={18} color={colors.interactiveText} />
              <AppText variant="caption" color={colors.textMuted} style={styles.flex}>
                {!at ? t('quick.waitingFix') : street ? t('quick.pinned', { street }) : t('quick.pinnedNoStreet')}
              </AppText>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('quick.close')} onPress={onClose} style={styles.close}>
            <X size={24} color={colors.navy} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          {HAZARD_CATEGORIES.map((c) => {
            const Icon = HAZARD_ICONS[c];
            const on = picked === c;
            return (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: !at }}
                accessibilityHint={t('quick.tileHint')}
                disabled={!at}
                onPress={() => {
                  // Reset first, so a finished countdown never sends the new pick at once.
                  setLeft(SEND_AFTER_S);
                  setPicked(c);
                }}
                style={({ pressed }) => [styles.tile, on && styles.tileOn, !at && styles.tileOff, pressed && styles.pressed]}
              >
                {on && (
                  <View style={styles.check}>
                    <Check size={16} color={colors.text} strokeWidth={3} />
                  </View>
                )}
                <Icon size={32} color={colors.navy} />
                <AppText variant="bodyStrong" color={colors.text} style={styles.center}>
                  {t(`hazard.${c}`)}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {picked && (
          <View style={styles.sending} accessibilityLiveRegion="polite">
            <View style={styles.ring}>
              <AppText variant="label" color={colors.white}>
                {Math.max(left, 0)}
              </AppText>
            </View>
            <AppText variant="bodyStrong" color={colors.white} style={styles.flex}>
              {t('quick.sending', { count: Math.max(left, 0) })}
            </AppText>
            <Pressable accessibilityRole="button" onPress={() => setPicked(null)} style={styles.undo}>
              <AppText variant="bodyStrong" color={colors.onNavyAccent}>
                {t('common.undo')}
              </AppText>
            </Pressable>
          </View>
        )}

        <AppText variant="caption" color={colors.textMuted} style={styles.center}>
          {t(isFull ? 'quick.footerSignedIn' : 'quick.footer')}
        </AppText>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  close: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48.5%',
    minHeight: 104,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  tileOn: { borderWidth: 2, borderColor: colors.hazard, backgroundColor: colors.hazardSoft },
  tileOff: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  check: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.hazard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.navy,
    borderRadius: radius.card,
    paddingLeft: spacing.md,
    minHeight: touchTarget + spacing.md,
  },
  ring: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: colors.hazard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undo: { minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: spacing.lg, justifyContent: 'center' },
});
