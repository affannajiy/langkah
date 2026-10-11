import { Camera, Map, UserLocation, type CameraRef, type MapRef } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { LocateFixed, MapPinOff, TriangleAlert, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { LocationSheet } from '../../components/LocationSheet';
import { MapCredit } from '../../components/MapCredit';
import { IPOH_BOUNDS, isInPilotArea, MAX_ZOOM, MIN_ZOOM } from '../../map/config';
import { useLangkahMapStyle } from '../../map/useLangkahMapStyle';
import { useLocationPermission } from '../../map/useLocationPermission';
import { colors, radius, shadow, spacing } from '../../theme/theme';

const RECENTRE_ZOOM = 16;
const OUTSIDE_BANNER_MS = 6000;

export default function MapScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapStyle = useLangkahMapStyle();
  const { access, request } = useLocationPermission();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [askedOnce, setAskedOnce] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [outsidePilot, setOutsidePilot] = useState(false);

  // The outside-pilot banner is time-sensitive info, so it hides itself.
  useEffect(() => {
    if (!outsidePilot) return;
    const timer = setTimeout(() => setOutsidePilot(false), OUTSIDE_BANNER_MS);
    return () => clearTimeout(timer);
  }, [outsidePilot]);

  // First visit: explain why we need location, once. Never on every launch.
  useEffect(() => {
    if (access === 'undetermined' && !askedOnce) {
      setSheetOpen(true);
      setAskedOnce(true);
    }
    if (access === 'granted') setSheetOpen(false);
  }, [access, askedOnce]);

  async function allowLocation() {
    const next = await request();
    if (next === 'granted') {
      setSheetOpen(false);
      flyToMe();
    }
  }

  function recentre() {
    if (access === 'granted') flyToMe();
    else setSheetOpen(true);
  }

  // Only called once permission is known to be granted.
  async function flyToMe() {
    try {
      const pos =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const here: [number, number] = [pos.coords.longitude, pos.coords.latitude];
      // Outside the pilot there is no data, so show central Ipoh instead of the user.
      if (!isInPilotArea(here)) {
        cameraRef.current?.fitBounds(IPOH_BOUNDS, { duration: 800 });
        setOutsidePilot(true);
        return;
      }
      setOutsidePilot(false);
      cameraRef.current?.flyTo({ center: here, zoom: RECENTRE_ZOOM, duration: 800 });
    } catch (error) {
      console.warn('Could not get current position', error);
    }
  }

  return (
    <View style={styles.root}>
      {mapStyle && (
        <Map
          ref={mapRef}
          mapStyle={mapStyle}
          accessibilityLabel={t('map.a11yLabel')}
          attribution={false}
          logo={false}
          compass={false}
          onDidFailLoadingMap={() => setMapFailed(true)}
          onDidFinishLoadingMap={() => setMapFailed(false)}
        >
          <Camera ref={cameraRef} initialViewState={{ bounds: IPOH_BOUNDS }} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} />
          {access === 'granted' && <UserLocation accuracy />}
        </Map>
      )}

      {mapFailed && (
        <View style={[styles.banner, { top: insets.top + spacing.md }]} accessibilityLiveRegion="polite">
          <TriangleAlert size={20} color={colors.hazardText} />
          <AppText variant="label" color={colors.navy} style={styles.bannerText}>
            {t('map.loadFailed')}
          </AppText>
        </View>
      )}

      {outsidePilot && !mapFailed && (
        <View style={[styles.banner, styles.infoBanner, { top: insets.top + spacing.md }]} accessibilityLiveRegion="polite">
          <MapPinOff size={20} color={colors.interactiveText} />
          <AppText variant="label" color={colors.navy} style={styles.bannerText}>
            {t('map.outsidePilot')}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('map.dismissBanner')}
            onPress={() => setOutsidePilot(false)}
            hitSlop={spacing.sm}
            style={styles.bannerClose}
          >
            <X size={20} color={colors.navy} />
          </Pressable>
        </View>
      )}

      <View style={styles.bottomRow} pointerEvents="box-none">
        <MapCredit onPress={() => mapRef.current?.showAttribution()} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('map.recentre')}
          onPress={recentre}
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        >
          <LocateFixed size={24} color={colors.interactiveText} />
        </Pressable>
      </View>

      <LocationSheet
        visible={sheetOpen}
        mode={access === 'blocked' ? 'blocked' : 'ask'}
        onAllow={allowLocation}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapLand },
  bottomRow: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.floating,
  },
  pressed: { opacity: 0.85 },
  banner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderLeftWidth: 4,
    borderLeftColor: colors.hazard,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.floating,
  },
  bannerText: { flex: 1 },
  infoBanner: { borderLeftColor: colors.interactive, paddingVertical: spacing.xs },
  bannerClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
