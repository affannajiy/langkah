import { Camera, Map, type CameraRef, type LngLat, type LngLatBounds, type MapRef } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { CloudOff, LocateOff, MapPin, MapPinOff, TriangleAlert, X } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { streetAt } from '../../api/reports';
import type { RouteError, RoutePair } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { AppText } from '../../components/AppText';
import { LocationSheet } from '../../components/LocationSheet';
import { MapCredit } from '../../components/MapCredit';
import { StatusBanner } from '../../components/StatusBanner';
import { Snackbar, useSnackbar } from '../../components/Snackbar';
import { CompareSheet } from '../../features/map/CompareSheet';
import { HomeBottomControls, HomeTopControls } from '../../features/map/HomeControls';
import { LayersSheet } from '../../features/map/LayersSheet';
import { PeekSheet } from '../../features/map/PeekSheet';
import { ReportFlowSheet, type ReportStep } from '../../features/report/ReportFlowSheet';
import { SearchSheet, type SearchPurpose } from '../../features/map/SearchSheet';
import { TripBar } from '../../features/map/TripBar';
import { IPOH_BOUNDS, isInPilotArea, MAX_ZOOM, MIN_ZOOM, nearestPilotArea, PILOT_AREAS } from '../../map/config';
import { MapPins } from '../../map/MapPins';
import { TrailLayer } from '../../map/TrailLayer';
import { RouteLayers, type RouteKind } from '../../map/RouteLayers';
import { useHere } from '../../map/useHere';
import { UserDot } from '../../map/UserDot';
import { useLangkahMapStyle } from '../../map/useLangkahMapStyle';
import { useLocationPermission } from '../../map/useLocationPermission';
import { setWalk, takeReportAfterWalk } from '../../nav/walkStore';
import { useMapView } from '../../map/useMapView';
import { useScoringMode } from '../../map/useScoringMode';
import { tabBarStyles } from '../../navigation/tabBar';
import { useOnline } from '../../net/useOnline';
import { useRoutes } from '../../route/useRoutes';
import { takeChooseSaved, useRecentPlaces, useSavedPlaces, type SavedKey, type StoredPlace } from '../../storage/places';
import { flushQueue, queuedCount } from '../../storage/reportQueue';
import { updateSettings, useSettings } from '../../storage/settings';
import { colors, radius, shadow, spacing } from '../../theme/theme';

const RECENTRE_ZOOM = 16;
const PIN_ZOOM = 18;
const PIN_SIZE = 44;
const STREET_DELAY_MS = 400;
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
  | { kind: 'compare' }
  | { kind: 'report' };

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
  const router = useRouter();
  const { style: mapStyle, land: mapLand } = useLangkahMapStyle();
  const { access, request, servicesOn, turnOnServices } = useLocationPermission();
  const online = useOnline();
  const here = useHere(access);
  const { mode, toggle: toggleMode } = useScoringMode();
  const { saved, setPlace } = useSavedPlaces();
  const { recent, addRecent } = useRecentPlaces();
  const mapView = useMapView();
  const snackbar = useSnackbar();
  const auth = useAuth();

  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [trip, setTrip] = useState<Trip | null>(null);
  const [selected, setSelected] = useState<RouteKind>('safest');
  const [layersOpen, setLayersOpen] = useState(false);
  const [viewBounds, setViewBounds] = useState<LngLatBounds | null>(null);
  const [peekH, setPeekH] = useState(120);
  const [sheetH, setSheetH] = useState(360);
  const [compareH, setCompareH] = useState(0);
  const [tripBarBottom, setTripBarBottom] = useState(insets.top + 120);
  const [locationSheet, setLocationSheet] = useState(false);
  const [askedOnce, setAskedOnce] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [outsidePilot, setOutsidePilot] = useState(false);
  const [reportStep, setReportStep] = useState<ReportStep>(1);
  const [reportH, setReportH] = useState(0);
  const [pin, setPin] = useState<LngLat | null>(null);
  const [pinStreet, setPinStreet] = useState<string | null>(null);
  // The route just walked, drawn faintly when the report flow opens from Arrival.
  const [trail, setTrail] = useState<LngLat[] | null>(null);
  const { layers: toggles, locationAsked } = useSettings();

  const home = screen.kind === 'home';
  const comparing = screen.kind === 'compare';
  const reporting = screen.kind === 'report';
  const placing = reporting && reportStep === 3;
  const { width: screenW } = useWindowDimensions();
  // With the camera padded by the sheet, the map centre sits halfway down the visible map.
  const pinY = (screenH - reportH) / 2;

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

  // Asked once by itself (onboarding usually does it first); after that only from
  // the recentre button.
  useEffect(() => {
    if (access === 'undetermined' && !askedOnce && !locationAsked) {
      setLocationSheet(true);
      setAskedOnce(true);
      updateSettings({ locationAsked: true });
    }
    if (access === 'granted') setLocationSheet(false);
  }, [access, askedOnce, locationAsked]);

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

  // Hand the chosen route to the walking screen. Guidance needs the walker's position.
  async function startWalk() {
    if (!pair || !trip || !toLL) return;
    const ok = access === 'granted' || (await request()) === 'granted';
    if (!ok) {
      snackbar.show({ text: t('route.needLocation') });
      return;
    }
    const kind: RouteKind = pair.same ? 'safest' : selected;
    setWalk({
      route: pair[kind],
      kind,
      mode,
      to: { name: label(trip.to) ?? '', lngLat: toLL },
      startedAt: Date.now(),
      fastestHazards: kind === 'safest' && !pair.same ? pair.fastest.stats.hz : null,
    });
    router.push('/navigate');
    // Back on the map after the walk, the home screen shows again.
    closeTrip();
  }

  function onSwap() {
    if (!trip?.from) return;
    setTrip({ from: trip.to, to: trip.from });
  }

  // --- report flow (guide Section 6.3, screen 6) ---------------------------

  // Step 3: frame the walker (or the current view) under the pin once the sheet has shrunk.
  const framedPin = useRef(false);
  useEffect(() => {
    if (!placing) {
      framedPin.current = false;
      return;
    }
    if (framedPin.current || reportH === 0) return;
    framedPin.current = true;
    const padding = { top: 0, right: 0, bottom: reportH, left: 0 };
    const start = pin ?? here;
    if (start) {
      cameraRef.current?.easeTo({ center: start, zoom: PIN_ZOOM, padding, duration: 600 });
    } else {
      mapRef.current
        ?.getCenter()
        .then((center) => cameraRef.current?.easeTo({ center, zoom: PIN_ZOOM, padding, duration: 600 }));
    }
  }, [placing, reportH, here, pin]);

  // The point under the pin, and its street, after each map move.
  const streetAbort = useRef<AbortController | null>(null);
  const streetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readPin = useCallback(async () => {
    const at = await mapRef.current?.unproject([screenW / 2, pinY]);
    if (!at) return;
    const rounded: LngLat = [Math.round(at[0] * 1e5) / 1e5, Math.round(at[1] * 1e5) / 1e5];
    setPin(rounded);
    if (streetTimer.current) clearTimeout(streetTimer.current);
    streetTimer.current = setTimeout(() => {
      streetAbort.current?.abort();
      const controller = new AbortController();
      streetAbort.current = controller;
      streetAt(rounded, controller.signal)
        .then((name) => {
          if (!controller.signal.aborted) setPinStreet(name);
        })
        .catch(() => {
          if (!controller.signal.aborted) setPinStreet(null);
        });
    }, STREET_DELAY_MS);
  }, [screenW, pinY]);

  function openReport(at: LngLat | null = null, walked: LngLat[] | null = null) {
    setPin(at);
    setTrail(walked);
    setPinStreet(null);
    setReportStep(1);
    setLayersOpen(false);
    setScreen({ kind: 'report' });
  }

  function closeReport(message?: string) {
    setScreen({ kind: 'home' });
    setTrail(null);
    setReportH(0);
    if (message) snackbar.show({ text: message });
  }

  // Back from Arrival ("Spot anything new?") or from the Me tab's saved places.
  useFocusEffect(
    useCallback(() => {
      const after = takeReportAfterWalk();
      if (after) {
        setTrip(null);
        openReport(after.at, after.trail);
        return;
      }
      const key = takeChooseSaved();
      if (key) {
        setTrip(null);
        setLayersOpen(false);
        setScreen({ kind: 'search', purpose: { kind: 'save', key }, back: 'home' });
      }
      // openReport only sets state; it needs no dependency.
    }, []),
  );

  // Back from a walk with reports still on the phone: offer sign-in here, never mid-walk.
  const { canWrite, ready: authReady, requireSignIn } = auth;
  const showSnack = snackbar.show;
  useFocusEffect(
    useCallback(() => {
      let live = true;
      queuedCount().then((n) => {
        if (!live || n === 0) return;
        if (canWrite) {
          flushQueue().then((sent) => {
            if (live && sent > 0) showSnack({ text: t('queue.sent', { count: sent }) });
          });
        } else if (authReady) {
          showSnack({
            text: t('queue.waiting', { count: n }),
            actionLabel: t('queue.signIn'),
            onAction: () => void requireSignIn('queue'),
          });
        }
      });
      return () => {
        live = false;
      };
    }, [canWrite, authReady, requireSignIn, showSnack, t]),
  );

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
      // The report sheet handles back itself, one step at a time.
      return false;
    });
    return () => sub.remove();
  });

  const nearUser = !!here && !!viewBounds && here[0] >= viewBounds[0] && here[0] <= viewBounds[2] && here[1] >= viewBounds[1] && here[1] <= viewBounds[3];
  const credit = <MapCredit onPress={() => mapRef.current?.showAttribution()} />;
  const snackBottom = (comparing ? sheetH : home ? peekH : reporting ? reportH : 0) + spacing.md;

  return (
    <View style={[styles.root, { backgroundColor: mapLand }]}>
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
            if (placing) void readPin();
            setViewBounds(e.nativeEvent.bounds);
            mapView.onViewChange(e.nativeEvent.bounds, e.nativeEvent.zoom);
          }}
        >
          <Camera ref={cameraRef} initialViewState={{ bounds: IPOH_BOUNDS }} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} />
          <MapPins view={mapView.view} toggles={toggles} />
          {reporting && trail && <TrailLayer points={trail} />}
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
            onReport={() => openReport()}
          />
          <PeekSheet state={mapView.state} nearUser={nearUser} onLayout={setPeekH} />
          {/* Above the Report button: recentre (56) + gap + Report (64). */}
          <View style={[styles.status, { bottom: peekH + spacing.md * 3 + 120 }]} pointerEvents="box-none">
            {!online && <StatusBanner icon={CloudOff} text={t('offline.banner')} />}
            {online && access === 'granted' && !servicesOn && (
              <StatusBanner
                icon={LocateOff}
                text={t('location.servicesOff')}
                action={{ label: t('location.turnOn'), onPress: () => void turnOnServices() }}
              />
            )}
          </View>
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
            onStart={startWalk}
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

      {reporting && (
        <>
          {placing && (
            <>
              <View pointerEvents="none" style={[styles.pin, { top: pinY - PIN_SIZE, left: screenW / 2 - PIN_SIZE / 2 }]}>
                <MapPin size={PIN_SIZE} color={colors.white} fill={colors.navy} strokeWidth={1.75} />
              </View>
              <View pointerEvents="none" style={[styles.pinDot, { top: pinY - 3, left: screenW / 2 - 3 }]} />
              <View style={[styles.credit, { bottom: reportH + spacing.sm }]} pointerEvents="box-none">
                {credit}
              </View>
            </>
          )}
          <ReportFlowSheet
            pin={pin}
            street={pinStreet}
            onStep={setReportStep}
            onHeight={setReportH}
            onClose={() => closeReport()}
            onDone={closeReport}
          />
        </>
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
          <LayersSheet
            visible={layersOpen}
            toggles={toggles}
            onChange={(layers) => updateSettings({ layers })}
            onClose={() => setLayersOpen(false)}
          />
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
  root: { flex: 1 },
  credit: { position: 'absolute', left: spacing.md },
  status: { position: 'absolute', left: spacing.md, right: spacing.md, gap: spacing.sm },
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
  pin: { position: 'absolute', width: PIN_SIZE, height: PIN_SIZE },
  pinDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: colors.navy },
});
