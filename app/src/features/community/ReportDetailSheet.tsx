import { Camera, Map, Marker, type MapRef } from '@maplibre/maplibre-react-native';
import { X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CommunityReport, Vote } from '../../api/reports';
import { AppText } from '../../components/AppText';
import { MapCredit } from '../../components/MapCredit';
import { shortDate, timeAgo } from '../../i18n/format';
import { HazardMark } from '../../map/MapPins';
import { useLangkahMapStyle } from '../../map/useLangkahMapStyle';
import { colors, radius, shadow, spacing, touchTarget } from '../../theme/theme';
import { categoryKey } from '../report/categoryIcons';
import { ImprovementMark } from './CommunityPins';
import { useSubtitle } from './ReportRow';
import { StatusChip } from './StatusChip';
import { HazardVotes, UpvoteButton } from './VoteButtons';

type Props = {
  report: CommunityReport;
  busy: boolean;
  bottom: number;
  onVote: (r: CommunityReport, vote: Vote) => void;
  onClose: () => void;
};

// Report detail (guide Section 5.2, screen 15): photo, category, mini map, status,
// votes, time reported and expiry date.
export function ReportDetailSheet({ report: r, busy, bottom, onVote, onClose }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const mapStyle = useLangkahMapStyle();
  const subtitle = useSubtitle(r);
  const miniRef = useRef<MapRef>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const hazard = r.kind === 'hazard';
  const by = r.by ? t('community.by', { name: r.by }) : t('community.byAnonymous');

  return (
    <>
      <Pressable style={styles.scrim} accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} />
      <View style={[styles.sheet, { bottom, maxHeight: screenH - insets.top - bottom - spacing.lg }]}>
        <View style={styles.handle} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <AppText variant="title" color={colors.navy} accessibilityRole="header">
                {t(categoryKey(r.kind, r.category))}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {subtitle}
              </AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.close}>
              <X size={24} color={colors.navy} />
            </Pressable>
          </View>

          {r.photoUrl && <Image source={{ uri: r.photoUrl }} style={styles.photo} accessibilityIgnoresInvertColors />}

          <View style={styles.chips}>
            <StatusChip status={r.status} />
            <AppText variant="label" color={colors.textMuted}>
              {hazard
                ? t('community.voteCounts', { confirms: r.confirms, gone: r.gone })
                : t('community.upvoteCount', { count: r.upvotes })}
            </AppText>
          </View>

          {r.note && (
            <AppText variant="body" color={colors.text}>
              {r.note}
            </AppText>
          )}

          <AppText variant="caption" color={colors.textMuted}>
            {t('community.reported', { when: timeAgo(r.createdAt), by })}
            {hazard && r.expiresAt && r.status !== 'expired' ? ` · ${t('community.expires', { date: shortDate(r.expiresAt) })}` : ''}
          </AppText>
          {hazard && r.status === 'pending' && (
            <AppText variant="caption" color={colors.textMuted}>
              {r.photoUrl ? t('community.pendingRulePhoto') : t('community.pendingRule')}
            </AppText>
          )}

          {mapStyle && (
            <View style={styles.mini} accessible accessibilityLabel={t('community.miniMapA11y', { street: r.street ?? '' })}>
              <Map
                ref={miniRef}
                mapStyle={mapStyle}
                attribution={false}
                logo={false}
                compass={false}
                dragPan={false}
                touchZoom={false}
                touchRotate={false}
                touchPitch={false}
                style={styles.flex}
              >
                <Camera initialViewState={{ center: r.lngLat, zoom: 17 }} />
                <Marker lngLat={r.lngLat} anchor="center">
                  {hazard ? <HazardMark size={32} /> : <ImprovementMark />}
                </Marker>
              </Map>
              <View style={styles.credit} pointerEvents="box-none">
                <MapCredit onPress={() => miniRef.current?.showAttribution()} />
              </View>
            </View>
          )}

          {r.status !== 'expired' &&
            (hazard ? (
              <HazardVotes report={r} busy={busy} onVote={(v) => onVote(r, v)} />
            ) : r.mine ? (
              <AppText variant="caption" color={colors.textMuted}>
                {t('community.yourReport')}
              </AppText>
            ) : (
              <UpvoteButton report={r} busy={busy} onVote={(v) => onVote(r, v)} wide />
            ))}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    ...shadow.floating,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.handle, marginBottom: spacing.sm },
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  close: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { width: '100%', height: 200, borderRadius: radius.card, backgroundColor: colors.surface },
  chips: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  mini: { height: 150, borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.mapLand },
  credit: { position: 'absolute', left: spacing.sm, bottom: spacing.sm },
});
