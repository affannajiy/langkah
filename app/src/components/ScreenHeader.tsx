import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing, touchTarget } from '../theme/theme';
import { AppText } from './AppText';

type Props = { title: string; onBack: () => void; right?: ReactNode; color?: string };

// Back arrow and a title, for full screens opened from a tab (Settings, Shop, Top up).
export function ScreenHeader({ title, onBack, right, color = colors.navy }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={onBack} style={styles.back}>
        <ChevronLeft size={28} color={color} />
      </Pressable>
      <AppText variant="title" color={color} accessibilityRole="header" style={styles.title} numberOfLines={2}>
        {title}
      </AppText>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  back: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
});
