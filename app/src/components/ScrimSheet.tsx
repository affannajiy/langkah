import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '../theme/theme';
import { Sheet } from './Sheet';

// A bottom sheet with a dimmed, tappable backdrop, for full screens that are not
// the map (shop, top-up, Plus). Tapping outside closes it. Never used during a walk.
export function ScrimSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <>
      {visible && <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.scrim} />}
      <Sheet visible={visible} overSystemBar>
        {children}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
});
