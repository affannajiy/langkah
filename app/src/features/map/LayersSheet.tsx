import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { AmenityMark, CoveredMark, type LayerToggles } from '../../map/MapPins';
import { colors, spacing, touchTarget } from '../../theme/theme';

type Props = {
  visible: boolean;
  toggles: LayerToggles;
  onChange: (next: LayerToggles) => void;
  onClose: () => void;
};

// Every map layer the user can switch, in sheet order. Shared with Settings.
export function layerRows(t: TFunction): { key: keyof LayerToggles; label: string; mark: ReactNode }[] {
  return [
    { key: 'crossings', label: t('layers.crossings'), mark: <AmenityMark kind="crossing" /> },
    { key: 'busStops', label: t('layers.busStops'), mark: <AmenityMark kind="bus_stop" /> },
    { key: 'shelters', label: t('layers.shelters'), mark: <AmenityMark kind="shelter" /> },
    { key: 'covered', label: t('layers.covered'), mark: <CoveredMark /> },
    { key: 'kerbs', label: t('layers.kerbs'), mark: <AmenityMark kind="kerb_ramp" /> },
    { key: 'rest', label: t('layers.rest'), mark: <AmenityMark kind="bench" /> },
  ];
}

// Layers sheet: which amenities show on the map (guide Section 5.2, screen 19).
// Each row shows its map mark next to the name. The choice is saved on the phone
// and also shows in Settings.
export function LayersSheet({ visible, toggles, onChange, onClose }: Props) {
  const { t } = useTranslation();
  const rows = layerRows(t);

  return (
    <Sheet visible={visible}>
      <AppText variant="heading" color={colors.navy} accessibilityRole="header">
        {t('layers.title')}
      </AppText>
      <View>
        {rows.map((r) => (
          <Pressable
            key={r.key}
            accessibilityRole="switch"
            accessibilityLabel={r.label}
            accessibilityState={{ checked: toggles[r.key] }}
            onPress={() => onChange({ ...toggles, [r.key]: !toggles[r.key] })}
            style={styles.row}
          >
            <View importantForAccessibility="no-hide-descendants">{r.mark}</View>
            <AppText color={colors.text} style={styles.label}>
              {r.label}
            </AppText>
            <Switch
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              value={toggles[r.key]}
              onValueChange={(v) => onChange({ ...toggles, [r.key]: v })}
              trackColor={{ true: colors.interactiveText, false: colors.limestone }}
              thumbColor={colors.white}
            />
          </Pressable>
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
