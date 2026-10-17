import { CircleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { colors, spacing } from '../../theme/theme';

type Props = {
  // 'bank' and 'wallet' add "not a real bank / wallet" on the parody pages.
  kind?: 'plain' | 'bank' | 'wallet';
  background?: string;
  color?: string;
  top?: number;
};

// Every mock top-up screen shows this (guide Section 15.5): no real money moves.
export function DemoStrip({ kind = 'plain', background = colors.hazardSoft, color = colors.hazardText, top = 0 }: Props) {
  const { t } = useTranslation();
  const text = kind === 'bank' ? t('topup.demoBank') : kind === 'wallet' ? t('topup.demoWallet') : t('topup.demo');
  return (
    <View style={[styles.strip, { backgroundColor: background, paddingTop: top + spacing.sm }]} accessibilityRole="text">
      <CircleAlert size={18} color={color} />
      <AppText variant="label" color={color} style={styles.text}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  text: { flexShrink: 1, textAlign: 'center' },
});
