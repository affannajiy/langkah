import { Camera, Map, type CameraRef, type LngLat, type LngLatBounds, type MapRef } from '@maplibre/maplibre-react-native';
import { Redirect, useRouter } from 'expo-router';
import { CloudOff, LocateFixed, LocateOff } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { castVote, createReport, ReportError } from '../api/reports';
import type { HazardCategory } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { TextScaleCap } from '../components/AppText';
import { MapCredit } from '../components/MapCredit';
import { Snackbar, useSnackbar } from '../components/Snackbar';
import { StatusBanner } from '../components/StatusBanner';
import { InstructionCard } from '../features/nav/InstructionCard';
import { LiveShareSheet } from '../features/nav/LiveShareSheet';
import { NavBanner } from '../features/nav/NavBanner';
import { NavBottomBar } from '../features/nav/NavBottomBar';
import { QuickReportSheet } from '../features/nav/QuickReportSheet';
import { WalkLayers } from '../features/nav/WalkLayers';
import { GLIDE_MS, WalkerPuck } from '../features/nav/WalkerPuck';
import { WalkTools } from '../features/nav/WalkTools';
import { MAX_ZOOM, MIN_ZOOM } from '../map/config';
import { MAP_LAND, useLangkahMapStyle } from '../map/useLangkahMapStyle';
import { useMapStatusBar } from '../map/useMapStatusBar';
import { useLocationPermission } from '../map/useLocationPermission';
import { useOnline } from '../net/useOnline';
import { bearingAt, makeTrack } from '../nav/geo';
import { useCompass } from '../nav/useCompass';
import { setShareEta, setShareRoute, startLiveShare, stopLiveShare, useLiveShare } from '../nav/liveShare';
import { useWalk } from '../nav/useWalk';
import { getWalk, setArrival, setWalk, type Walk } from '../nav/walkStore';
import { gpsDistance } from '../nav/walkLocation';
import { speak, stopSpeaking } from '../nav/voice';
import { queueReport, queueVote } from '../storage/reportQueue';
import { updateSettings, useSettings, type WalkCamera } from '../storage/settings';
import { useSideInset } from '../theme/layout';
import { reduceMotion } from '../theme/motion';
import { chromeTextScale, colors, shadow, spacing, touchTarget } from '../theme/theme';

// Walker's-eye view (guide Section 17.4): close, tilted, heading up. The view button
// also offers the flat map, turning with the walker or with north up.
const CAMERAS: Record<WalkCamera, { zoom: number; pitch: number }> = {
  '3d': { zoom: 18.5, pitch: 55 },
  '2d': { zoom: 17.5, pitch: 0 },
  north: { zoom: 17.5, pitch: 0 },
};
const NEXT_CAMERA: Record<WalkCamera, WalkCamera> = { '3d': '2d', '2d': 'north', north: '3d' };
// While the user pinches, the walker's size follows the zoom this often.
const ZOOM_TRACK_MS = 100;
// On Start the camera swoops from the whole route down behind the walker (Section 17.5).
const INTRO_DELAY_MS = 350;
const INTRO_MS = 1200;
const BACK_AGAIN_MS = 3000;
// After the arrival pulse, the walk screen stays a moment before the Arrival screen.
const ARRIVAL_PAUSE_MS = 1500;

function routeBounds(points: LngLat[]): LngLatBounds {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [x, y] of points) {
    w = Math.min(w, x);
    s = Math.min(s, y);
    e = Math.max(e, x);
    n = Math.max(n, y);
  }
  return [w, s, e, n];
}

// Walking navigation (guide Section 6.3, screen 4; docs/screens/Navigation.png).
export default function NavigateScreen() {
  const [walk] = useState(getWalk);
  // Opened without a walk (for example after a reload): back to the map.
  if (!walk) return <Redirect href="/" />;
  return <WalkScreen walk={walk} />;
}

function WalkScreen({ walk }: { walk: Walk }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const side = useSideInset(spacing.md);
  const { style: mapStyle, land: mapLand } = useLangkahMapStyle(true);
  useMapStatusBar(mapLand);
  const snackbar = useSnackbar();
  const { canWrite } = useAuth();
  const online = useOnline();
  const { servicesOn, turnOnServices } = useLocationPermission();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const { route, track, hazards, crossings, view, fix, banner, dismissBanner, remainingS, summary } = useWalk(walk);

  const [following, setFollowing] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [intro, setIntro] = useState(true);
  const [zoom, setZoom] = useState(CAMERAS['3d'].zoom);
  const zoomAt = useRef(0);
  const facing = useCompass(!view.arrived);
  const [cardBottom, setCardBottom] = useState(insets.top + 140);
  const [barH, setBarH] = useState(120);
  const [quick, setQuick] = useState<{ at: LngLat | null; street: string | null } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const share = useLiveShare();
  const { voice, walkView: camera } = useSettings();
  const backAt = useRef(0);

  // Live share (guide Section 16.1): time left and a new line after a reroute ride
  // along with the next position. Arriving or leaving the walk ends the share.
  useEffect(() => setShareEta(remainingS), [remainingS]);
  useEffect(() => setShareRoute(route.points), [route]);
  useEffect(() => {
    if (view.arrived) stopLiveShare(true);
  }, [view.arrived]);
  useEffect(() => () => stopLiveShare(false), []);

  // Turning with the walker: keep them low on the screen, so more of the way ahead
  // shows. North up: in the middle, since the way ahead can be any side.
  const padding = useMemo(() => {
    const lift = camera === '3d' ? spacing.xxl * 4 : camera === '2d' ? spacing.xxl * 2 : 0;
    return { top: cardBottom + lift, bottom: barH, left: 0, right: 0 };
  }, [camera, cardBottom, barH]);
  const cam = CAMERAS[camera];
  const bearing = camera === 'north' ? 0 : view.heading;

  // Start: the map opens on the whole route, then swoops down behind the walker.
  const latest = useRef({ view, padding, cam, bearing });
  latest.current = { view, padding, cam, bearing };
  useEffect(() => {
    if (!mapReady) return;
    const quick = reduceMotion();
    const timer = setTimeout(() => {
      const { view: v, padding: pad, cam: c, bearing: b } = latest.current;
      cameraRef.current?.flyTo({
        center: v.at ?? walk.route.points[0]!,
        bearing: b,
        zoom: c.zoom,
        pitch: c.pitch,
        padding: pad,
        duration: quick ? 0 : INTRO_MS,
      });
    }, quick ? 0 : INTRO_DELAY_MS);
    const done = setTimeout(() => setIntro(false), quick ? 0 : INTRO_DELAY_MS + INTRO_MS);
    return () => {
      clearTimeout(timer);
      clearTimeout(done);
    };
  }, [mapReady, walk.route.points]);

  // The camera follows the walker, until the user moves the map. Linear and as long as
  // the puck's glide, so the walker stays still on screen between fixes.
  useEffect(() => {
    if (!following || intro || !view.at) return;
    cameraRef.current?.easeTo({
      center: view.at,
      bearing,
      zoom: cam.zoom,
      pitch: cam.pitch,
      padding,
      duration: reduceMotion() ? 0 : GLIDE_MS,
      easing: 'linear',
    });
  }, [following, intro, view.at, bearing, cam, padding]);

  // While the camera drives itself (the swoop, following), the walker is sized for the
  // zoom it is heading to, so it never balloons mid-flight. Moved by hand: the live zoom.
  const puckZoom = following ? cam.zoom : zoom;

  const onCamera = useCallback(() => {
    const next = NEXT_CAMERA[camera];
    updateSettings({ walkView: next });
    setFollowing(true);
    snackbar.show({ text: t('nav.view.snack', { mode: t(`nav.view.${next}Name`) }) });
  }, [camera, snackbar, t]);

  const end = useCallback(() => {
    stopLiveShare(false);
    setWalk(null);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  // End asks for nothing: it waits 5 s with an Undo, so a slip does not lose the
  // walk (test note F20). Back pressed twice still ends at once.
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const askEnd = useCallback(() => {
    if (endTimer.current) return;
    endTimer.current = setTimeout(() => {
      endTimer.current = null;
      end();
    }, 5000);
    snackbar.show({
      text: t('nav.ending'),
      actionLabel: t('common.undo'),
      onAction: () => {
        if (endTimer.current) clearTimeout(endTimer.current);
        endTimer.current = null;
      },
    });
  }, [end, snackbar, t]);
  useEffect(
    () => () => {
      if (endTimer.current) clearTimeout(endTimer.current);
    },
    [],
  );

  // Arrived: hand the numbers to the Arrival screen (guide Section 6.3, screen 8).
  const finish = useCallback(() => {
    if (!summary) return;
    const walked = walk.route;
    setArrival({
      to: walk.to,
      walkedM: summary.walkedM,
      gpsM: gpsDistance(),
      durationS: Math.max(60, (Date.now() - walk.startedAt) / 1000),
      // Hazards met: on the first line, on the line after a reroute, or warned about on the way.
      avoided:
        walk.fastestHazards === null
          ? null
          : Math.max(0, walk.fastestHazards - Math.max(walked.stats.hz, summary.route.stats.hz, summary.warned)),
      warned: summary.warned,
      mode: walk.mode,
      kind: walk.kind,
      score: walked.score,
      trail: summary.route.points,
      quests: summary.route.quests,
    });
    setWalk(null);
    router.replace('/arrival');
  }, [summary, walk, router]);

  useEffect(() => {
    if (!summary) return;
    const timer = setTimeout(finish, ARRIVAL_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [summary, finish]);

  const openQuick = useCallback(() => {
    // Pin where the walker is now, before they move on.
    setQuick({ at: view.at ?? fix?.lngLat ?? null, street: view.street });
  }, [view.at, view.street, fix]);

  // Signed in: send now. Otherwise, or with no signal, keep it on the phone; sign-in is
  // offered after the walk, never during it.
  const onSend = useCallback(
    async (category: HazardCategory, at: LngLat) => {
      setQuick(null);
      if (canWrite) {
        try {
          await createReport({ kind: 'hazard', category, at });
          snackbar.show({ text: t('quick.sent') });
          return;
        } catch (error) {
          if (error instanceof ReportError && error.code !== 'network') {
            snackbar.show({ text: t(`report.error.${error.code}`, { defaultValue: t('quick.failed') }) });
            return;
          }
        }
      }
      const ok = await queueReport(category, at);
      snackbar.show({ text: ok ? (canWrite ? t('quick.savedOffline') : t('quick.saved')) : t('quick.failed') });
    },
    [canWrite, snackbar, t],
  );

  const onAnswer = useCallback(
    async (vote: 'confirm' | 'gone') => {
      if (banner?.kind !== 'hazard') return;
      dismissBanner();
      if (canWrite) {
        try {
          await castVote(banner.hazard.id, vote);
          snackbar.show({ text: t('nav.hazard.thanksSent') });
          return;
        } catch (error) {
          // Your own report, or it just expired: nothing was counted, so say so.
          if (error instanceof ReportError && error.code !== 'network') {
            snackbar.show({ text: t('nav.hazard.notCounted') });
            return;
          }
        }
      }
      const ok = await queueVote(banner.hazard.id, vote);
      snackbar.show({ text: ok ? t('nav.hazard.thanks') : t('quick.failed') });
    },
    [banner, dismissBanner, canWrite, snackbar, t],
  );

  const sendLink = useCallback(
    async (url: string) => {
      try {
        await Share.share({ message: t('share.message', { name: walk.to.name, url }) });
      } catch (error) {
        console.warn('Share sheet failed', error);
      }
    },
    [t, walk.to.name],
  );

  // The tap on Share link in the sheet is the consent; nothing is sent before it.
  const onShareLink = useCallback(async () => {
    if (share.status === 'starting') return;
    if (share.status === 'live') {
      setShareOpen(false);
      await sendLink(share.url);
      return;
    }
    if (!online) {
      setShareOpen(false);
      snackbar.show({ text: t('share.offline') });
      return;
    }
    try {
      const url = await startLiveShare({
        destName: walk.to.name,
        dest: walk.to.lngLat,
        route: route.points,
        at: view.at ?? fix?.lngLat ?? null,
        etaS: remainingS,
      });
      setShareOpen(false);
      await sendLink(url);
    } catch (error) {
      console.warn('Live share failed', error);
      setShareOpen(false);
      snackbar.show({ text: t('share.failed') });
    }
  }, [share, online, walk.to, route.points, view.at, fix, remainingS, sendLink, snackbar, t]);

  const onVoice = useCallback(() => {
    updateSettings({ voice: !voice });
    if (voice) stopSpeaking();
    else speak(t('voice.on'));
    snackbar.show({ text: t(voice ? 'voice.offSnack' : 'voice.onSnack') });
  }, [voice, snackbar, t]);

  const onStopShare = useCallback(() => {
    setShareOpen(false);
    stopLiveShare(false);
    snackbar.show({ text: t('share.stopped') });
  }, [snackbar, t]);

  // Back closes Quick report first. Otherwise it asks for a second press, since a
  // dialog must never interrupt a walk (guide Section 5.3).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (quick) {
        setQuick(null);
        return true;
      }
      if (shareOpen) {
        setShareOpen(false);
        return true;
      }
      if (view.arrived) {
        finish();
        return true;
      }
      if (Date.now() - backAt.current < BACK_AGAIN_MS) {
        end();
        return true;
      }
      backAt.current = Date.now();
      snackbar.show({ text: t('nav.backAgain') });
      return true;
    });
    return () => sub.remove();
  }, [quick, shareOpen, view.arrived, end, finish, snackbar, t]);

  const overview = useMemo(() => routeBounds(walk.route.points), [walk.route.points]);

  return (
    // Nothing may cover the walk: big phone text is capped on this screen.
    <TextScaleCap.Provider value={chromeTextScale}>
      <View style={[styles.root, { backgroundColor: mapLand }]}>
        {mapStyle && (
          <Map
            ref={mapRef}
            mapStyle={mapStyle}
            accessibilityLabel={t('nav.mapA11y')}
            attribution={false}
            logo={false}
            compass={false}
            onDidFinishLoadingMap={() => setMapReady(true)}
            onRegionWillChange={(e) => {
              if (e.nativeEvent.userInteraction) setFollowing(false);
            }}
            onRegionIsChanging={(e) => {
              if (following || Date.now() - zoomAt.current < ZOOM_TRACK_MS) return;
              zoomAt.current = Date.now();
              setZoom(e.nativeEvent.zoom);
            }}
            onRegionDidChange={(e) => setZoom(e.nativeEvent.zoom)}
          >
            <Camera
              ref={cameraRef}
              initialViewState={{
                bounds: overview,
                bearing: bearingAt(makeTrack(walk.route.points), 0),
                padding: { top: cardBottom + spacing.lg, bottom: barH + spacing.lg, left: spacing.xxl, right: spacing.xxl },
              }}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
            />
            <WalkLayers
              track={track}
              kind={walk.kind}
              along={view.along}
              hazards={hazards}
              crossings={crossings}
              covered={route.covered}
              end={walk.to.lngLat}
            />
            {view.at && <WalkerPuck at={view.at} heading={view.heading} facing={facing} accuracy={fix?.accuracy ?? null} zoom={puckZoom} night={mapLand !== MAP_LAND.day} />}
          </Map>
        )}

        <View style={[styles.top, { left: side, right: side, top: insets.top + spacing.md }]} pointerEvents="box-none">
          <View onLayout={(e) => setCardBottom(insets.top + spacing.md + e.nativeEvent.layout.height)}>
            <InstructionCard view={view} destName={walk.to.name} night={mapLand !== MAP_LAND.day} />
          </View>
          {banner && !view.arrived && <NavBanner banner={banner} onAnswer={onAnswer} onHide={dismissBanner} />}
          {!servicesOn && !view.arrived && (
            <StatusBanner
              icon={LocateOff}
              text={t('location.servicesOffWalk')}
              action={{ label: t('location.turnOn'), onPress: () => void turnOnServices() }}
            />
          )}
          {!online && servicesOn && !view.arrived && <StatusBanner icon={CloudOff} text={t('offline.walk')} />}
        </View>

        <View style={[styles.lower, { bottom: barH + spacing.sm }]} pointerEvents="box-none">
          <MapCredit onPress={() => mapRef.current?.showAttribution()} />
          {!view.arrived && (
            <View style={styles.tools} pointerEvents="box-none">
              <WalkTools
                share={share}
                onShare={() => setShareOpen(true)}
                voiceOn={voice}
                onVoice={onVoice}
                camera={camera}
                onCamera={onCamera}
              />
              {!following && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('nav.recentre')}
                  onPress={() => setFollowing(true)}
                  style={styles.recentre}
                >
                  <LocateFixed size={26} color={colors.interactiveText} />
                </Pressable>
              )}
            </View>
          )}
        </View>

        <NavBottomBar
          remainingM={view.remainingM}
          remainingS={remainingS}
          destName={walk.to.name}
          arrived={view.arrived}
          onEnd={view.arrived ? finish : askEnd}
          onQuickReport={openQuick}
          onHeight={setBarH}
        />

        <QuickReportSheet
          visible={!!quick}
          at={quick?.at ?? null}
          street={quick?.street ?? null}
          onSend={onSend}
          onClose={() => setQuick(null)}
        />

        <LiveShareSheet
          visible={shareOpen && !view.arrived}
          share={share}
          onShare={() => void onShareLink()}
          onStop={onStopShare}
          onClose={() => setShareOpen(false)}
        />

        <Snackbar message={snackbar.message} onHide={snackbar.hide} bottom={barH + spacing.md} />
      </View>
    </TextScaleCap.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', left: spacing.md, right: spacing.md, gap: spacing.sm },
  lower: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  tools: { alignItems: 'flex-end', gap: spacing.sm },
  recentre: {
    width: touchTarget + spacing.sm,
    height: touchTarget + spacing.sm,
    borderRadius: (touchTarget + spacing.sm) / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.floating,
  },
});
