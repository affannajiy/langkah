import { Camera, Map, type LngLat, type LngLatBounds, type MapRef } from '@maplibre/maplibre-react-native';
import { TriangleAlert, ZoomIn } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { communityReports, type CommunityReport } from '../../api/reports';
import type { ReportKind } from '../../api/types';
import { AppText } from '../../components/AppText';
import { MapCredit } from '../../components/MapCredit';
import { IPOH_BOUNDS, MAX_ZOOM, MIN_ZOOM } from '../../map/config';
import { UserDot } from '../../map/UserDot';
import { useLangkahMapStyle } from '../../map/useLangkahMapStyle';
import { PINS_MIN_ZOOM } from '../../map/useMapView';
import { colors, radius, shadow, spacing } from '../../theme/theme';
import { CommunityPins } from './CommunityPins';

const DEBOUNCE_MS = 400;

type Props = {
  kind: ReportKind;
  here: LngLat | null;
  reloadKey: number;
  onOpen: (r: CommunityReport) => void;
};

// Community map view: reports in the area on screen only (Section 7.4).
export function CommunityMap({ kind, here, reloadKey, onOpen }: Props) {
  const { t } = useTranslation();
  const { style: mapStyle, land: mapLand } = useLangkahMapStyle();
  const mapRef = useRef<MapRef>(null);
  const [items, setItems] = useState<CommunityReport[]>([]);
  const [view, setView] = useState<{ bounds: LngLatBounds; zoom: number } | null>(null);
  const [state, setState] = useState<'ok' | 'zoomed_out' | 'error'>('ok');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useRef(here);

  useEffect(() => {
    if (!view) return;
    if (view.zoom < PINS_MIN_ZOOM) {
      setState('zoomed_out');
      return;
    }
    const controller = new AbortController();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      communityReports({ kind, sort: 'newest', near: here, box: view.bounds }, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          setItems(next);
          setState('ok');
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          setState(error?.code === 'too_big' ? 'zoomed_out' : 'error');
        });
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
    };
    // here only adds distances; it should not refetch on every GPS fix.
  }, [view, kind, reloadKey]);

  return (
    <View style={[styles.root, { backgroundColor: mapLand }]}>
      {mapStyle && (
        <Map
          ref={mapRef}
          mapStyle={mapStyle}
          accessibilityLabel={t('community.mapA11y')}
          attribution={false}
          logo={false}
          compass={false}
          onRegionDidChange={(e) => setView({ bounds: e.nativeEvent.bounds, zoom: e.nativeEvent.zoom })}
        >
          <Camera
            initialViewState={initial.current ? { center: initial.current, zoom: 15.5 } : { bounds: IPOH_BOUNDS }}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
          />
          <CommunityPins items={state === 'zoomed_out' ? [] : items} onPress={onOpen} />
          {here && <UserDot at={here} />}
        </Map>
      )}
      {state !== 'ok' && (
        <View style={styles.hint} accessibilityLiveRegion="polite">
          {state === 'zoomed_out' ? (
            <ZoomIn size={20} color={colors.interactiveText} />
          ) : (
            <TriangleAlert size={20} color={colors.hazardText} />
          )}
          <AppText variant="label" color={colors.navy} style={styles.flex}>
            {state === 'zoomed_out' ? t('community.zoomIn') : t('community.loadFailed')}
          </AppText>
        </View>
      )}
      <View style={styles.credit} pointerEvents="box-none">
        <MapCredit onPress={() => mapRef.current?.showAttribution()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, borderRadius: radius.sheet, overflow: 'hidden' },
  flex: { flex: 1 },
  hint: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.card,
    ...shadow.floating,
  },
  credit: { position: 'absolute', left: spacing.sm, bottom: spacing.sm },
});
