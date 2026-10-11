import { Camera, Map, type CameraRef, type LngLat, type MapRef } from '@maplibre/maplibre-react-native';
import { Redirect, useRouter } from 'expo-router';
import { LocateFixed } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { HazardCategory } from '../api/types';
import { MapCredit } from '../components/MapCredit';
import { Snackbar, useSnackbar } from '../components/Snackbar';
import { InstructionCard } from '../features/nav/InstructionCard';
import { NavBanner } from '../features/nav/NavBanner';
import { NavBottomBar } from '../features/nav/NavBottomBar';
import { QuickReportSheet } from '../features/nav/QuickReportSheet';
import { WalkerDot, WalkLayers } from '../features/nav/WalkLayers';
import { MAX_ZOOM, MIN_ZOOM } from '../map/config';
import { useLangkahMapStyle } from '../map/useLangkahMapStyle';
import { bearingAt, makeTrack } from '../nav/geo';
import { useWalk } from '../nav/useWalk';
import { getWalk, setWalk, type Walk } from '../nav/walkStore';
import { queueReport, queueVote } from '../storage/reportQueue';
import { colors, shadow, spacing, touchTarget } from '../theme/theme';

const WALK_ZOOM = 17.5;
const BACK_AGAIN_MS = 3000;

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
  const mapStyle = useLangkahMapStyle();
  const snackbar = useSnackbar();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const { track, hazards, crossings, view, fix, banner, dismissBanner, remainingS } = useWalk(walk);

  const [following, setFollowing] = useState(true);
  const [cardBottom, setCardBottom] = useState(insets.top + 140);
  const [barH, setBarH] = useState(120);
  const [quick, setQuick] = useState<{ at: LngLat | null; street: string | null } | null>(null);
  const backAt = useRef(0);

  // Heading-up camera that follows the walker, until the user moves the map.
  useEffect(() => {
    if (!following || !view.at) return;
    cameraRef.current?.easeTo({
      center: view.at,
      bearing: view.heading,
      zoom: WALK_ZOOM,
      // Keep the walker in the lower part of the map, so more of the way ahead shows.
      padding: { top: cardBottom + spacing.xxl * 3, bottom: barH, left: 0, right: 0 },
      duration: 800,
    });
  }, [following, view.at, view.heading, cardBottom, barH]);

  const end = useCallback(() => {
    setWalk(null);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const openQuick = useCallback(() => {
    // Pin where the walker is now, before they move on.
    setQuick({ at: view.at ?? fix?.lngLat ?? null, street: view.street });
  }, [view.at, view.street, fix]);

  const onSend = useCallback(
    async (category: HazardCategory, at: LngLat) => {
      setQuick(null);
      const ok = await queueReport(category, at);
      snackbar.show({ text: ok ? t('quick.saved') : t('quick.failed') });
    },
    [snackbar, t],
  );

  const onAnswer = useCallback(
    async (vote: 'confirm' | 'gone') => {
      if (banner?.kind !== 'hazard') return;
      dismissBanner();
      const ok = await queueVote(banner.hazard.id, vote);
      snackbar.show({ text: ok ? t('nav.hazard.thanks') : t('quick.failed') });
    },
    [banner, dismissBanner, snackbar, t],
  );

  // Back closes Quick report first. Otherwise it asks for a second press, since a
  // dialog must never interrupt a walk (guide Section 5.3).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (quick) {
        setQuick(null);
        return true;
      }
      if (view.arrived || Date.now() - backAt.current < BACK_AGAIN_MS) {
        end();
        return true;
      }
      backAt.current = Date.now();
      snackbar.show({ text: t('nav.backAgain') });
      return true;
    });
    return () => sub.remove();
  }, [quick, view.arrived, end, snackbar, t]);

  const first = walk.route.points[0]!;

  return (
    <View style={styles.root}>
      {mapStyle && (
        <Map
          ref={mapRef}
          mapStyle={mapStyle}
          accessibilityLabel={t('nav.mapA11y')}
          attribution={false}
          logo={false}
          compass={false}
          onRegionWillChange={(e) => {
            if (e.nativeEvent.userInteraction) setFollowing(false);
          }}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{ center: first, zoom: WALK_ZOOM, bearing: bearingAt(makeTrack(walk.route.points), 0) }}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
          />
          <WalkLayers
            track={track}
            kind={walk.kind}
            along={view.along}
            hazards={hazards}
            crossings={crossings}
            end={walk.to.lngLat}
          />
          {view.at && <WalkerDot at={view.at} />}
        </Map>
      )}

      <View style={[styles.top, { top: insets.top + spacing.md }]} pointerEvents="box-none">
        <View onLayout={(e) => setCardBottom(insets.top + spacing.md + e.nativeEvent.layout.height)}>
          <InstructionCard view={view} destName={walk.to.name} />
        </View>
        {banner && !view.arrived && <NavBanner banner={banner} onAnswer={onAnswer} onHide={dismissBanner} />}
      </View>

      <View style={[styles.lower, { bottom: barH + spacing.sm }]} pointerEvents="box-none">
        <MapCredit onPress={() => mapRef.current?.showAttribution()} />
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

      <NavBottomBar
        remainingM={view.remainingM}
        remainingS={remainingS}
        destName={walk.to.name}
        arrived={view.arrived}
        onEnd={end}
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

      <Snackbar message={snackbar.message} onHide={snackbar.hide} bottom={barH + spacing.md} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapLand },
  top: { position: 'absolute', left: spacing.md, right: spacing.md, gap: spacing.sm },
  lower: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
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
