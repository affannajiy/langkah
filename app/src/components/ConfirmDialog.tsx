import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, shadow, spacing, touchTarget } from '../theme/theme';
import { AppText } from './AppText';

export type ConfirmOptions = {
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean; // caution orange with dark text; the label says what happens
  onConfirm: () => void | Promise<void>;
};

// The Langkah dialog (test note G10): only for actions that cannot be undone
// (guide Section 5.3), in the app's font and colours instead of the stock Android alert.
// const { confirm, dialog } = useConfirm(); ... confirm({...}); ... render {dialog}.
export function useConfirm() {
  const [open, setOpen] = useState<ConfirmOptions | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => setOpen(o), []);
  const dialog = <ConfirmDialog options={open} onClose={() => setOpen(null)} />;
  return { confirm, dialog };
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal visible={!!options} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.scrim}>
        {options && (
          <View style={styles.card} accessibilityViewIsModal accessibilityRole="alert">
            <AppText variant="heading" color={colors.navy} accessibilityRole="header">
              {options.title}
            </AppText>
            <AppText variant="body" color={colors.text}>
              {options.body}
            </AppText>
            <View style={styles.buttons}>
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed }) => [styles.button, styles.cancel, pressed && styles.pressed]}
              >
                <AppText variant="bodyStrong" color={colors.navy}>
                  {t('common.cancel')}
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  void options.onConfirm();
                }}
                style={({ pressed }) => [
                  styles.button,
                  options.destructive ? styles.danger : styles.primary,
                  pressed && styles.pressed,
                ]}
              >
                <AppText variant="bodyStrong" color={options.destructive ? colors.text : colors.white}>
                  {options.confirmLabel}
                </AppText>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: radius.sheet,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.floating,
  },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm, paddingTop: spacing.sm },
  button: {
    minHeight: touchTarget,
    minWidth: 96,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { borderWidth: 1.5, borderColor: colors.navy, backgroundColor: colors.white },
  primary: { backgroundColor: colors.navy },
  danger: { backgroundColor: colors.hazard },
  pressed: { opacity: 0.85 },
});
