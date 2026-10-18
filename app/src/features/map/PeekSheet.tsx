import { ArrowUp, ChevronDown, ChevronUp, ShieldCheck, TriangleAlert, ZoomIn } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { LngLat } from '@maplibre/maplibre-react-native';

import { AppText } from '../../components/AppText';
import { formatDistance } from '../../i18n/format';
import type { MapViewState } from '../../map/useMapView';
import { metres } from '../../nav/geo';
import { categoryKey } from '../report/categoryIcons';
import { useSideInset } from '../../theme/layout';
import { colors, radius, shadow, spacing, touchTarget } from '../../theme/theme';

// from: where distances are measured (the walker, or the middle of the map).
type Props = { state: MapViewState; nearUser: boolean; from: LngLat | null; onLayout: (height: number) => void };

// Open, the sheet lists the nearest hazards by name (test note F26; guide Section 6.3).
const LIST_MAX = 4;

// Sheet above the tab bar with what is nearby (guide Section 6.3, screen 1).
// It starts collapsed to one line so the map stays in full view; a tap opens it.
export function PeekSheet({ state, nearUser, from, onLayout }: Props) {
  const { t } = useTranslation();
  const side = useSideInset();
  const [open, setOpen] = useState(false);
  const view = state.status === 'ok' ? state.view : state.status === 'zoomed_out' ? null : state.last;
  const Chevron = open ? ChevronDown : ChevronUp;
  const iconSize = open ? 22 : 18;

  let body: React.ReactNode;
  if (state.status === 'zoomed_out') {
    body = (
      <Row
        icon={<ZoomIn size={iconSize} color={colors.textMuted} />}
        text={open ? t('home.zoomIn') : t('home.zoomInShort')}
        color={colors.textMuted}
      />
    );
  } else if (state.status === 'error' && !view) {
    body = (
      <Row
        icon={<TriangleAlert size={iconSize} color={colors.hazardText} />}
        text={open ? t('home.viewFailed') : t('home.viewFailedShort')}
        color={colors.textMuted}
      />
    );
  } else if (!view) {
    // First load: keep the row's height so nothing jumps (UI-UX 7b.3).
    body = <View style={styles.placeholder} />;
  } else {
    const { hazards, improvements } = view.counts;
    body = (
      <View style={styles.counts}>
        {hazards > 0 ? (
          <Row
            icon={<TriangleAlert size={iconSize} color={colors.hazardText} />}
            text={open ? t('home.hazards', { count: hazards }) : t('home.hazardsShort', { count: hazards })}
          />
        ) : (
          <Row
            icon={<ShieldCheck size={iconSize} color={colors.safeText} />}
            text={open ? t('home.noHazards') : t('home.noHazardsShort')}
          />
        )}
        {improvements > 0 && (
          <Row
            icon={<ArrowUp size={iconSize} color={colors.communityText} />}
            text={
              open ? t('home.improvements', { count: improvements }) : t('home.improvementsShort', { count: improvements })
            }
          />
        )}
        {open && view.hazards.length > 0 && (
          <View style={styles.list}>
            {view.hazards
              .map((h) => ({ ...h, m: from ? metres(from, h.lngLat) : null }))
              .sort((a, b) => (a.m ?? 0) - (b.m ?? 0))
              .slice(0, LIST_MAX)
              .map((h) => (
                <View key={h.id} style={styles.item}>
                  <View style={styles.diamond} />
                  <AppText color={colors.text} style={styles.flex} numberOfLines={1}>
                    {t(categoryKey('hazard', h.category))}
                  </AppText>
                  {h.m !== null && (
                    <AppText variant="label" color={colors.textMuted}>
                      {formatDistance(h.m)}
                    </AppText>
                  )}
                </View>
              ))}
          </View>
        )}
      </View>
    );
  }

  const heading = nearUser ? t('home.nearYou') : t('home.inThisArea');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityHint={open ? t('home.peekCollapseHint') : t('home.peekExpandHint')}
      onPress={() => setOpen((o) => !o)}
      style={[styles.sheet, !open && styles.sheetCollapsed, { left: side, right: side }]}
      onLayout={(e) => onLayout(e.nativeEvent.layout.height)}
    >
      <View style={styles.handle} />
      {open ? (
        <>
          <View style={styles.titleRow}>
            <AppText variant="heading" color={colors.navy} accessibilityRole="header" style={styles.flex}>
              {heading}
            </AppText>
            <Chevron size={24} color={colors.navy} />
          </View>
          <View accessibilityLiveRegion="polite">{body}</View>
        </>
      ) : (
        <View style={styles.titleRow}>
          <AppText variant="bodyStrong" color={colors.navy}>
            {heading}
          </AppText>
          <View accessibilityLiveRegion="polite" style={styles.flex}>
            {body}
          </View>
          <Chevron size={24} color={colors.navy} />
        </View>
      )}
    </Pressable>
  );
}

function Row({ icon, text, color = colors.text }: { icon: React.ReactNode; text: string; color?: string }) {
  return (
    <View style={styles.row}>
      {icon}
      <AppText color={color} style={styles.rowText}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    ...shadow.floating,
  },
  sheetCollapsed: { paddingBottom: spacing.sm, gap: spacing.xs, minHeight: touchTarget + spacing.md },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.handle,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 28 },
  rowText: { flexShrink: 1 },
  placeholder: { height: 28 },
  list: { flexBasis: '100%', gap: spacing.xs, paddingTop: spacing.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  // A small hazard diamond, as on the map; the name beside it says what it is.
  diamond: {
    width: 12,
    height: 12,
    backgroundColor: colors.hazard,
    borderWidth: 1.5,
    borderColor: colors.navy,
    transform: [{ rotate: '45deg' }],
    marginHorizontal: 4,
  },
});
