import { Camera, Map, type CameraRef, type LngLat, type LngLatBounds, type MapRef } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useNavigation } from 'expo-router';
import { MapPinOff, TriangleAlert, X } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RouteError, RoutePair } from '../../api/types';
import { AppText } from '../../components/AppText';
import { LocationSheet } from '../../components/LocationSheet';
import { MapCredit } from '../../components/MapCredit';
import { Snackbar, useSnackbar } from '../../components/Snackbar';
import { CompareSheet } from '../../features/map/CompareSheet';
import { HomeBottomControls, HomeTopControls } from '../../features/map/HomeControls';
import { LayersSheet } from '../../features/map/LayersSheet';
import { PeekSheet } from '../../features/map/PeekSheet';
import { SearchSheet, type SearchPurpose } from '../../features/map/SearchSheet';
import { TripBar } from '../../features/map/TripBar';
import { IPOH_BOUNDS, isInPilotArea, MAX_ZOOM, MIN_ZOOM, nearestPilotArea, PILOT_AREAS } from '../../map/config';
import { MapPins, type LayerToggles } from '../../map/MapPins';
import { RouteLayers, type RouteKind } from '../../map/RouteLayers';
import { useHere } from '../../map/useHere';
import { UserDot } from '../../map/UserDot';
import { useLangkahMapStyle } from '../../map/useLangkahMapStyle';
import { useLocationPermission } from '../../map/useLocationPermission';
import { useMapView } from '../../map/useMapView';
import { useScoringMode } from '../../map/useScoringMode';
import { tabBarStyles } from '../../navigation/tabBar';
import { useRoutes } from '../../route/useRoutes';
import { useRecentPlaces, useSavedPlaces, type SavedKey, type StoredPlace } from '../../storage/places';
import { colors, radius, shadow, spacing } from '../../theme/theme';

const RECENTRE_ZOOM = 16;
const OUTSIDE_BANNER_MS = 6000;
const FIT_DELAY_MS = 150;
// Camera padding sticks between moves, so home moves clear what compare set.
const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

// A trip end: the user's own position (frozen when the trip starts, so walking a few
// metres does not re-plan the route) or a picked place.
type Endpoint = { kind: 'me'; at: LngLat | null } | { kind: 'place'; place: StoredPlace };
type Trip = { from: Endpoint | null; to: Endpoint };

type Screen =
  | { kind: 'home' }
  | { kind: 'search'; purpose: SearchPurpose; back: 'home' | 'compare'; thenRoute?: boolean }
  | { kind: 'compare' };

const pointOf = (e: Endpoint | null): LngLat | null => (!e ? null : e.kind === 'me' ? e.at : e.place.lngLat);

function routeBounds(pair: RoutePair, extra: (LngLat | null)[]): LngLatBounds {
  let [w, s, e, n] = [180, 90, -180, -90];
  const all = [...pair.safest.points, ...(pair.same ? [] : pair.fastest.points), ...extra.filter((p): p is LngLat => !!p)];
  for (const [x, y] of all) {
    w = Math.min(w, x);
    s = Math.min(s, y);
    e = Math.max(e, x);
    n = Math.max(n, y);
  }
  return [w, s, e, n];
}

// Map tab: home, search and route compare share one map, so it never reloads
// (guide Section 6.3, screens 1 to 3).
export default function MapScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const navigation = useNavigation();
  const mapStyle = useLangkahMapStyle();
  const { access, request } = useLocationPermission();
  const here = useHere(access);
  const { mode, toggle: toggleMode } = useScoringMode();
  const { saved, setPlace } = useSavedPlaces();
  const { recent, addRecent } = useRecentPlaces();
  const mapView = useMapView();
  const snackbar = useSnackbar();

  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [trip, setTrip] = useState<Trip | null>(null);
  const [selected, setSelected] = useState<RouteKind>('safest');
  const [layersOpen, setLayersOpen] = useState(false);
  const [toggles, setToggles] = useState<LayerToggles>({ crossings: true, busStops: true, shelters: true });
  const [viewBounds, setViewBounds] = useState<LngLatBounds | null>(null);
  const [peekH, setPeekH] = useState(120);
  const [sheetH, setSheetH] = useState(360);
  const [compareH, setCompareH] = useState(0);
  const [tripBarBottom, setTripBarBottom] = useState(insets.top + 120);
  const [locationSheet, setLocationSheet] = useState(false);
  const [askedOnce, setAskedOnce] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [outsidePilot, setOutsidePilot] = useState(false);

  const home = screen.kind === 'home';
  const comparing = screen.kind === 'compare';

  // Search and route compare use the whole screen (docs/screens/Search.png, RouteCompare.png).
  useLayoutEffect(() => {
    navigation.setOptions({ tabBarStyle: home ? tabBarStyles.bar : tabBarStyles.hidden });
  }, [navigation, home]);

  // --- location permission (Phase 0 behaviour, unchanged) ---------------

  useEffect(() => {
    if (!outsidePilot) return;
    const timer = setTimeout(() => setOutsidePilot(false), OUTSIDE_BANNER_MS);
    return () => clearTimeout(timer);
  }, [outsidePilot]);

  useEffect(() => {
    if (access === 'undetermined' && !askedOnce) {
      setLocationSheet(true);
      setAskedOnce(true);
    }
    if (access === 'granted') setLocationSheet(false);
  }, [access, askedOnce]);

  async function allowLocation() {
    const next = await request();
    if (next === 'granted') {
      setLocationSheet(false);
      flyToMe();
    }
  }

  // The map opens on central Ipoh. On the first fix inside another pilot area, frame that area once.
  const framedFirstFix = useRef(false);
  useEffect(() => {
    if (!here || framedFirstFix.current) return;
    framedFirstFix.current = true;
    const area = PILOT_AREAS.find(([w, s, e, n]) => here[0] >= w && here[0] <= e && here[1] >= s && here[1] <= n);
    if (area && area !== IPOH_BOUNDS && screen.kind === 'home') {
      cameraRef.current?.fitBounds(area, { padding: NO_PADDING, duration: 800 });
    }
    // Only the first fix matters; later screen changes must not re-run this.
  }, [here]);

  async function flyToMe() {
    try {
      const pos =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const me: LngLat = [pos.coords.longitude, pos.coords.latitude];
      if (!isInPilotArea(me)) {
        cameraRef.current?.fitBounds(nearestPilotArea(me), { padding: NO_PADDING, duration: 800 });
        setOutsidePilot(true);
        return;
      }
      setOutsidePilot(false);
      cameraRef.current?.flyTo({ center: me, zoom: RECENTRE_ZOOM, padding: NO_PADDING, duration: 800 });
    } catch (error) {
      console.warn('Could not get current position', error);
    }
  }

  // --- trip ----------------------------------------------------------------

  // A "me" end waiting for a first GPS fix takes it as soon as it arrives.
  useEffect(() => {
    if (!here) return;
    setTrip((prev) => {
      if (!prev) return prev;
      const fill = (e: Endpoint | null): Endpoint | null => (e?.kind === 'me' && !e.at ? { kind: 'me', at: here } : e);
      const from = fill(prev.from);
      const to = fill(prev.to) ?? prev.to;
      return from === prev.from && to === prev.to ? prev : { from, to };
    });
  }, [here]);

  const fromLL = pointOf(trip?.from ?? null);
  const toLL = pointOf(trip?.to ?? null);

  // Problems the app can name before asking the server.
  const tripError = useMemo<RouteError | null>(() => {
    if (!trip) return null;
    if (!fromLL || !toLL) return 'no_start';
    if (!isInPilotArea(fromLL)) return 'start_outside_pilot';
    if (!isInPilotArea(toLL)) return 'outside_pilot';
    return null;
  }, [trip, fromLL, toLL]);

  const routes = useRoutes(fromLL, toLL, mode, comparing && !tripError);
  const pair = routes.state.status === 'ok' ? routes.state.pair : null;

  // Latest layout sizes for the camera fit.
  const layout = useRef({ tripBarBottom, screenH });
  layout.current = { tripBarBottom, screenH };

  // New routes: pick Safest again.
  useEffect(() => {
    if (pair) setSelected('safest');
  }, [pair]);

  // A fresh compare sheet measures itself again.
  useEffect(() => {
    if (!comparing) setCompareH(0);
  }, [comparing]);

  // Frame both lines between the top bar and the collapsed sheet. Runs again when the
  // sheet finishes measuring its new cards, but not when the user drags it.
  useEffect(() => {
    if (!pair || compareH <= 0) return;
    const bounds = routeBounds(pair, [fromLL, toLL]);
    const timer = setTimeout(() => {
      const { tripBarBottom: top, screenH: h } = layout.current;
      // Keep at least 160 dp of map between the bar and the sheet.
      const room = Math.max(0, h - 160 - top - spacing.lg);
      cameraRef.current?.fitBounds(bounds, {
        padding: { top: top + spacing.lg, bottom: Math.min(compareH + spacing.lg, room), left: spacing.xxl, right: spacing.xxl },
        duration: 700,
      });
    }, FIT_DELAY_MS);
    return () => clearTimeout(timer);
    // fromLL and toLL only change together with a new pair.
  }, [pair, compareH]);

  const label = (e: Endpoint | null) => (!e ? null : e.kind === 'me' ? t('route.yourLocation') : e.place.name);
  const meNow = (): Endpoint => ({ kind: 'me', at: here });

  const startTrip = useCallback(
    (to: StoredPlace) => {
      setTrip({ from: { kind: 'me', at: here }, to: { kind: 'place', place: to } });
      setScreen({ kind: 'compare' });
    },
    [here],
  );

  const closeTrip = useCallback(() => {
    setTrip(null);
    setScreen({ kind: 'home' });
  }, []);

  // --- search results ----------------------------------------------------

  function onPick(place: StoredPlace) {
    if (screen.kind !== 'search') return;
    const { purpose } = screen;
    if (purpose.kind === 'save') {
      setPlace(purpose.key, place);
      snackbar.show({ text: t('saved.savedToast', { label: t(`saved.${purpose.key}`), name: place.name }) });
      if (screen.thenRoute) startTrip(place);
      else setScreen({ kind: screen.back === 'compare' ? 'compare' : 'home' });
      return;
    }
    addRecent(place);
    if (purpose.kind === 'from') {
      setTrip((prev) => (prev ? { ...prev, from: { kind: 'place', place } } : prev));
      setScreen({ kind: 'compare' });
    } else if (screen.back === 'compare' && trip) {
      setTrip({ ...trip, to: { kind: 'place', place } });
      setScreen({ kind: 'compare' });
    } else {
      startTrip(place);
    }
  }

  function onPickSaved(key: SavedKey) {
    if (screen.kind !== 'search') return;
    const place = saved[key];
    if (place) onPick(place);
    else setScreen({ kind: 'search', purpose: { kind: 'save', key }, back: screen.back, thenRoute: screen.purpose.kind === 'to' });
  }

  function onUseMyLocation() {
    setTrip((prev) => (prev ? { ...prev, from: meNow() } : prev));
    setScreen({ kind: 'compare' });
  }

  function closeSearch() {
    if (screen.kind !== 'search') return;
    setScreen({ kind: screen.back === 'compare' && trip ? 'compare' : 'home' });
  }

  // --- home actions ------------------------------------------------------

  function onSavedPress(key: SavedKey) {
    const place = saved[key];
    if (place) startTrip(place);
    else setScreen({ kind: 'search', purpose: { kind: 'save', key }, back: 'home' });
  }

  function onSavedLongPress(key: SavedKey) {
    const before = saved[key];
    if (!before) return;
    const name = t(`saved.${key}`);
    setPlace(key, null);
    snackbar.show({
      text: t('saved.clearedToast', { label: name }),
      actionLabel: t('common.undo'),
      onAction: () => setPlace(key, before),
    });
  }

  function onSwap() {
    if (!trip?.from) return;
    setTrip({ from: trip.to, to: trip.from });
  }

  // Android back steps out one level instead of leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (layersOpen) {
        setLayersOpen(false);
        return true;
      }
      if (screen.kind === 'search') {
        closeSearch();
        return true;
      }
      if (screen.kind === 'compare') {
        closeTrip();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  });

  const nearUser = !!here && !!viewBounds && here[0] >= viewBounds[0] && here[0] <= viewBounds[2] && here[1] >= viewBounds[1] && here[1] <= viewBounds[3];
  const credit = <MapCredit onPress={() => mapRef.current?.showAttribution()} />;
  const snackBottom = (comparing ? sheetH : home ? peekH : 0) + spacing.md;

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
          onRegionDidChange={(e) => {
            setViewBounds(e.nativeEvent.bounds);
            mapView.onViewChange(e.nativeEvent.bounds, e.nativeEvent.zoom);
          }}
        >
          <Camera ref={cameraRef} initialViewState={{ bounds: IPOH_BOUNDS }} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} />
          <MapPins view={mapView.view} toggles={toggles} />
          {comparing && pair && toLL && (
            <RouteLayers
              pair={pair}
              selected={selected}
              onSelect={setSelected}
              start={trip?.from?.kind === 'place' ? fromLL : null}
              end={toLL}
            />
          )}
          {access === 'granted' && here && <UserDot at={here} />}
        </Map>
      )}

      {home && (
        <>
          <HomeTopControls
            mode={mode}
            onToggleMode={toggleMode}
            onSearch={() => setScreen({ kind: 'search', purpose: { kind: 'to' }, back: 'home' })}
            saved={saved}
            onSavedPress={onSavedPress}
            onSavedLongPress={onSavedLongPress}
            onLayers={() => setLayersOpen(true)}
          />
          <HomeBottomControls
            bottom={peekH + spacing.md}
            credit={credit}
            onRecentre={() => (access === 'granted' ? flyToMe() : setLocationSheet(true))}
            onReport={() => snackbar.show({ text: t('home.reportSoon') })}
          />
          <PeekSheet state={mapView.state} nearUser={nearUser} onLayout={setPeekH} />
        </>
      )}

      {comparing && trip && (
        <>
          <TripBar
            fromLabel={label(trip.from)}
            toLabel={label(trip.to) ?? ''}
            onBack={closeTrip}
            onFrom={() => setScreen({ kind: 'search', purpose: { kind: 'from' }, back: 'compare' })}
            onTo={() => setScreen({ kind: 'search', purpose: { kind: 'to' }, back: 'compare' })}
            onSwap={onSwap}
            onLayout={setTripBarBottom}
          />
          <View style={[styles.credit, { bottom: sheetH + spacing.sm }]} pointerEvents="box-none">
            {credit}
          </View>
          <CompareSheet
            state={tripError ? { status: 'error', error: tripError } : routes.state}
            destinationName={label(trip.to) ?? ''}
            mode={mode}
            onToggleMode={toggleMode}
            selected={selected}
            onSelect={setSelected}
            onStart={() => snackbar.show({ text: t('route.navSoon') })}
            onRetry={routes.retry}
            onChooseStart={() => setScreen({ kind: 'search', purpose: { kind: 'from' }, back: 'compare' })}
            onHeight={setSheetH}
            onCollapsedHeight={setCompareH}
            // Room below the trip bar for a strip of map and the OSM credit.
            maxHeight={screenH - tripBarBottom - spacing.xxl}
          />
        </>
      )}

      {home && mapFailed && (
        <View style={[styles.banner, { top: insets.top + spacing.md }]} accessibilityLiveRegion="polite">
          <TriangleAlert size={20} color={colors.hazardText} />
          <AppText variant="label" color={colors.navy} style={styles.bannerText}>
            {t('map.loadFailed')}
          </AppText>
        </View>
      )}

      {home && outsidePilot && !mapFailed && (
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

      {screen.kind === 'search' && (
        <SearchSheet
          purpose={screen.purpose}
          near={here}
          saved={saved}
          recent={recent}
          onPick={onPick}
          onPickSaved={onPickSaved}
          onUseMyLocation={onUseMyLocation}
          onClose={closeSearch}
        />
      )}

      {home && (
        <>
          <LayersSheet visible={layersOpen} toggles={toggles} onChange={setToggles} onClose={() => setLayersOpen(false)} />
          <LocationSheet
            visible={locationSheet}
            mode={access === 'blocked' ? 'blocked' : 'ask'}
            onAllow={allowLocation}
            onClose={() => setLocationSheet(false)}
          />
        </>
      )}

      <Snackbar message={snackbar.message} onHide={snackbar.hide} bottom={snackBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapLand },
  credit: { position: 'absolute', left: spacing.md },
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
