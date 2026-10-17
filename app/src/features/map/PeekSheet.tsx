import { ArrowUp, ShieldCheck, TriangleAlert, ZoomIn } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import type { MapViewState } from '../../map/useMapView';
import { useSideInset } from '../../theme/layout';
import { colors, radius, shadow, spacing } from '../../theme/theme';

type Props = { state: MapViewState; nearUser: boolean; onLayout: (height: number) => void };

// Collapsed sheet above the tab bar with what is nearby (guide Section 6.3, screen 1).
// Tapping a hazard to open its card arrives with reports in Phase 5.
export function PeekSheet({ state, nearUser, onLayout }: Props) {
  const { t } = useTranslation();
  const side = useSideInset();
  const view = state.status === 'ok' ? state.view : state.status === 'zoomed_out' ? null : state.last;

  let body: React.ReactNode;
  if (state.status === 'zoomed_out') {
    body = (
      <Row icon={<ZoomIn size={20} color={colors.textMuted} />} text={t('home.zoomIn')} color={colors.textMuted} />
    );
  } else if (state.status === 'error' && !view) {
    body = (
      <Row icon={<TriangleAlert size={20} color={colors.hazardText} />} text={t('home.viewFailed')} color={colors.textMuted} />
    );
  } else if (!view) {
    // First load: keep the row's height so nothing jumps (UI-UX 7b.3).
    body = <View style={styles.placeholder} />;
  } else {
    const { hazards, improvements } = view.counts;
    body = (
      <View style={styles.counts}>
        {hazards > 0 ? (
          <Row icon={<TriangleAlert size={22} color={colors.hazardText} />} text={t('home.hazards', { count: hazards })} />
        ) : (
          <Row icon={<ShieldCheck size={22} color={colors.safeText} />} text={t('home.noHazards')} />
        )}
        {improvements > 0 && (
          <Row icon={<ArrowUp size={22} color={colors.communityText} />} text={t('home.improvements', { count: improvements })} />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.sheet, { left: side, right: side }]} onLayout={(e) => onLayout(e.nativeEvent.layout.height)}>
      <View style={styles.handle} />
      <AppText variant="heading" color={colors.navy} accessibilityRole="header">
        {nearUser ? t('home.nearYou') : t('home.inThisArea')}
      </AppText>
      <View accessibilityLiveRegion="polite">{body}</View>
    </View>
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
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.handle,
    marginBottom: spacing.sm,
  },
  counts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  rowText: { flexShrink: 1 },
  placeholder: { height: 28 },
});
