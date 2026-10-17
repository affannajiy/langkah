import { Layers, LocateFixed, TriangleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ScoringMode } from '../../api/types';
import { AppText } from '../../components/AppText';
import { IconButton } from '../../components/IconButton';
import { ModeChip } from '../../components/ModeChip';
import { PlaceChip } from '../../components/PlaceChip';
import { SearchPill } from '../../components/SearchPill';
import { SAVED_ICONS } from '../../map/placeIcon';
import { SAVED_KEYS, type SavedKey, type SavedPlaces } from '../../storage/places';
import { useSideInset } from '../../theme/layout';
import { chromeTextScale, colors, radius, shadow, spacing, shortScreenHeight } from '../../theme/theme';

type TopProps = {
  mode: ScoringMode;
  onToggleMode: () => void;
  onSearch: () => void;
  saved: SavedPlaces;
  onSavedPress: (key: SavedKey) => void;
  onSavedLongPress: (key: SavedKey) => void;
  onLayers: () => void;
};

// Map home, top: search pill, day/night chip, saved-place chips and Layers
// (guide Section 6.3, screen 1; docs/screens/Main.png).
export function HomeTopControls({ mode, onToggleMode, onSearch, saved, onSavedPress, onSavedLongPress, onLayers }: TopProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const side = useSideInset();
  // Short screens, or a narrow phone with very big text: fold the saved-place chips
  // away so the map keeps room. They are still in the search sheet.
  const { width, height, fontScale } = useWindowDimensions();
  const foldChips = height < shortScreenHeight || (width < 360 && fontScale > chromeTextScale);

  return (
    <View style={[styles.top, { left: side, right: side, paddingTop: insets.top + spacing.md }]} pointerEvents="box-none">
      <View style={styles.row} pointerEvents="box-none">
        <SearchPill onPress={onSearch} />
        <ModeChip mode={mode} onPress={onToggleMode} />
      </View>
      <View style={[styles.row, foldChips && styles.rowEnd]} pointerEvents="box-none">
        {!foldChips && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipScroll}>
            {SAVED_KEYS.map((key) => {
              const place = saved[key];
              const label = t(`saved.${key}`);
              return (
                <PlaceChip
                  key={key}
                  floating
                  label={label}
                  icon={SAVED_ICONS[key]}
                  unset={!place}
                  hint={place ? t('saved.setHint', { name: place.name }) : t('saved.notSetHint')}
                  onPress={() => onSavedPress(key)}
                  // Always set: if it vanished mid-press after clearing, the release would count as a tap.
                  onLongPress={() => onSavedLongPress(key)}
                />
              );
            })}
          </ScrollView>
        )}
        <IconButton icon={Layers} label={t('home.layers')} onPress={onLayers} style={styles.layers} />
      </View>
    </View>
  );
}

type BottomProps = { onRecentre: () => void; onReport: () => void; bottom: number; credit: React.ReactNode };

// Map home, bottom right: recentre and the extended Report button. Credit bottom left.
export function HomeBottomControls({ onRecentre, onReport, bottom, credit }: BottomProps) {
  const { t } = useTranslation();
  return (
    <View style={[styles.bottom, { bottom }]} pointerEvents="box-none">
      <View style={styles.credit} pointerEvents="box-none">
        {credit}
      </View>
      <View style={styles.fabs} pointerEvents="box-none">
        <IconButton icon={LocateFixed} label={t('map.recentre')} onPress={onRecentre} />
        <Pressable
          accessibilityRole="button"
          onPress={onReport}
          style={({ pressed }) => [styles.report, pressed && styles.pressed]}
        >
          <TriangleAlert size={26} color={colors.text} />
          <AppText variant="heading" color={colors.text}>
            {t('home.report')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  rowEnd: { justifyContent: 'flex-end' },
  chipScroll: { flexGrow: 1, flexShrink: 1, marginLeft: -spacing.md },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  layers: { borderRadius: radius.card },
  bottom: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  credit: { flexShrink: 1 },
  fabs: { alignItems: 'flex-end', gap: spacing.md },
  report: {
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.hazard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.floating,
  },
  pressed: { opacity: 0.85 },
});
