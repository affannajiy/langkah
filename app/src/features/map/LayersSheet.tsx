import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import type { LayerToggles } from '../../map/MapPins';
import { colors, spacing, touchTarget } from '../../theme/theme';

type Props = {
  visible: boolean;
  toggles: LayerToggles;
  onChange: (next: LayerToggles) => void;
  onClose: () => void;
};

// Layers sheet: which amenities show on the map (guide Section 5.2, screen 19).
// The choice lasts for this session; saving it comes with Settings in Phase 6.
export function LayersSheet({ visible, toggles, onChange, onClose }: Props) {
  const { t } = useTranslation();
  const rows: { key: keyof LayerToggles; label: string }[] = [
    { key: 'crossings', label: t('layers.crossings') },
    { key: 'busStops', label: t('layers.busStops') },
    { key: 'shelters', label: t('layers.shelters') },
  ];

  return (
    <Sheet visible={visible}>
      <AppText variant="heading" color={colors.navy} accessibilityRole="header">
        {t('layers.title')}
      </AppText>
      <View>
        {rows.map((r) => (
          <View key={r.key} style={styles.row}>
            <AppText color={colors.text} style={styles.label}>
              {r.label}
            </AppText>
            <Switch
              accessibilityLabel={r.label}
              value={toggles[r.key]}
              onValueChange={(v) => onChange({ ...toggles, [r.key]: v })}
              trackColor={{ true: colors.interactive, false: colors.border }}
              thumbColor={colors.white}
            />
          </View>
        ))}
      </View>
      <AppText variant="caption" color={colors.textMuted}>
        {t('layers.note')}
      </AppText>
      <Button label={t('layers.done')} onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: touchTarget + spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { flex: 1 },
});
