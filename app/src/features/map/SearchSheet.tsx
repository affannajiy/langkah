import type { LngLat } from '@maplibre/maplibre-react-native';
import { Clock, LocateFixed, Search, ShieldCheck, Star, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  PanResponder,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { searchPlaces } from '../../api/langkah';
import type { Place } from '../../api/types';
import { AppText } from '../../components/AppText';
import { IconButton } from '../../components/IconButton';
import { PlaceChip } from '../../components/PlaceChip';
import { formatDistance } from '../../i18n/format';
import { isInPilotArea } from '../../map/config';
import { placeIcon, SAVED_ICONS } from '../../map/placeIcon';
import { SAVED_KEYS, useStarred, type SavedKey, type SavedPlaces, type StoredPlace } from '../../storage/places';
import { useSideInset } from '../../theme/layout';
import { chromeTextScale, colors, fontFamily, radius, shadow, spacing, touchTarget, type } from '../../theme/theme';

// What the picked place is for.
export type SearchPurpose = { kind: 'to' } | { kind: 'from' } | { kind: 'save'; key: SavedKey };

type Props = {
  purpose: SearchPurpose;
  near: LngLat | null;
  saved: SavedPlaces;
  recent: StoredPlace[];
  onPick: (place: StoredPlace) => void;
  onPickSaved: (key: SavedKey) => void;
  // Long press clears a saved place (same as the chips on the Map home).
  onSavedLongPress: (key: SavedKey) => void;
  onUseMyLocation: () => void;
  onClose: () => void;
};

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;
const DISMISS_DRAG = 100;

type Results =
  | { status: 'idle' }
  | { status: 'loading'; q: string; last: Place[] }
  | { status: 'ok'; q: string; places: Place[] }
  | { status: 'error'; q: string };

// Search sheet (guide Section 6.3, screen 2; docs/screens/Search.png). It slides over
// the map with the field focused. Swipe down or "x" closes it.
export function SearchSheet({ purpose, near, saved, recent, onPick, onPickSaved, onSavedLongPress, onUseMyLocation, onClose }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const side = useSideInset();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const dragY = useRef(new Animated.Value(0)).current;

  // Android keeps the keyboard up when the focused field unmounts, covering the route cards.
  useEffect(() => () => Keyboard.dismiss(), []);

  // Debounced search; a newer query cancels the older request.
  const nearKey = near ? `${near[0].toFixed(4)},${near[1].toFixed(4)}` : '';
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setResults({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setResults((prev) => ({ status: 'loading', q, last: prev.status === 'ok' ? prev.places : prev.status === 'loading' ? prev.last : [] }));
      searchPlaces(q, near, controller.signal)
        .then((places) => !controller.signal.aborted && setResults({ status: 'ok', q, places }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.warn('search_places failed', error);
          setResults({ status: 'error', q });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // near is read through nearKey, so a tiny GPS wobble does not refire the search.
  }, [query, nearKey, attempt]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => dragY.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > DISMISS_DRAG || g.vy > 1.2) onClose();
          else Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [dragY, onClose],
  );

  const title =
    purpose.kind === 'from'
      ? t('search.chooseStart')
      : purpose.kind === 'save'
        ? t('saved.chooseTitle', { label: t(`saved.${purpose.key}`) })
        : null;

  const showStart = query.trim().length < MIN_CHARS;
  const places = results.status === 'ok' ? results.places : results.status === 'loading' ? results.last : [];

  const pick = (p: Place | StoredPlace) => onPick({ name: p.name, area: p.area, category: p.category, lngLat: p.lngLat });

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Dim the map; tapping it closes search. Not used during a walk (Section 5.3). */}
      <Pressable
        style={[StyleSheet.absoluteFill, styles.scrim]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('search.close')}
        importantForAccessibility="no"
      />
      <Animated.View style={[styles.sheet, { left: side, right: side, top: insets.top + spacing.lg, transform: [{ translateY: dragY }] }]}>
        <View {...pan.panHandlers} style={styles.head}>
          <View style={styles.handle} />
          {title && (
            <AppText variant="heading" color={colors.navy} accessibilityRole="header">
              {title}
            </AppText>
          )}
          <View style={styles.fieldRow}>
            <View style={styles.field}>
              <Search size={22} color={colors.navy} />
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder={t('search.placeholder')}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={t('search.placeholder')}
                returnKeyType="search"
                autoCorrect={false}
                maxLength={80}
                style={styles.input}
              />
              {query.length > 0 && (
                <IconButton icon={X} kind="plain" size={40} label={t('search.clear')} onPress={() => setQuery('')} />
              )}
            </View>
            <IconButton icon={X} kind="soft" label={t('search.close')} onPress={onClose} />
          </View>
        </View>

        <FlatList
          data={showStart ? [] : places}
          keyExtractor={(p, i) => `${p.name}:${p.lngLat[0]}:${p.lngLat[1]}:${i}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          ListHeaderComponent={
            showStart ? (
              <StartContent
                purpose={purpose}
                near={near}
                saved={saved}
                recent={recent}
                onPickSaved={onPickSaved}
                onSavedLongPress={onSavedLongPress}
                onPickRecent={pick}
                onUseMyLocation={onUseMyLocation}
              />
            ) : (
              <ResultsHeader results={results} count={places.length} />
            )
          }
          renderItem={({ item }) => <PlaceRow place={item} onPress={() => pick(item)} />}
          ItemSeparatorComponent={Separator}
          ListFooterComponent={
            // The "compares routes" hint only fits a destination search.
            showStart && purpose.kind === 'to' ? (
              <View style={styles.hint}>
                <ShieldCheck size={22} color={colors.safeText} />
                <AppText color={colors.text} style={styles.hintText}>
                  {t('search.hint')}
                </AppText>
              </View>
            ) : results.status === 'error' ? (
              <View style={styles.message}>
                <AppText color={colors.text}>{t('search.failed')}</AppText>
                <Pressable accessibilityRole="button" onPress={() => setAttempt((n) => n + 1)} style={styles.retry}>
                  <AppText variant="bodyStrong" color={colors.interactiveText}>
                    {t('search.retry')}
                  </AppText>
                </Pressable>
              </View>
            ) : null
          }
        />
      </Animated.View>
    </View>
  );
}

function ResultsHeader({ results, count }: { results: Results; count: number }) {
  const { t } = useTranslation();
  if (results.status === 'ok' && count === 0) {
    return (
      <View style={styles.message} accessibilityLiveRegion="polite">
        <AppText color={colors.text}>{t('search.noResults', { q: results.q })}</AppText>
      </View>
    );
  }
  return (
    <View style={styles.sectionHead}>
      <AppText variant="bodyStrong" color={colors.navy} accessibilityRole="header">
        {t('search.results')}
      </AppText>
      {results.status === 'loading' && (
        <ActivityIndicator size="small" color={colors.interactiveText} accessibilityLabel={t('search.searching')} />
      )}
    </View>
  );
}

type StartProps = {
  purpose: SearchPurpose;
  near: LngLat | null;
  saved: SavedPlaces;
  recent: StoredPlace[];
  onPickSaved: (key: SavedKey) => void;
  // Long press clears a saved place (same as the chips on the Map home).
  onSavedLongPress: (key: SavedKey) => void;
  onPickRecent: (p: StoredPlace) => void;
  onUseMyLocation: () => void;
};

// Before typing: my location (for a start point), saved places and recent searches.
function StartContent({ purpose, near, saved, recent, onPickSaved, onSavedLongPress, onPickRecent, onUseMyLocation }: StartProps) {
  const { t } = useTranslation();
  const starred = useStarred();
  return (
    <View style={styles.start}>
      {purpose.kind === 'from' && near && (
        <Pressable accessibilityRole="button" onPress={onUseMyLocation} style={styles.row}>
          <View style={styles.rowIcon}>
            <LocateFixed size={22} color={colors.interactiveText} />
          </View>
          <AppText variant="bodyStrong" color={colors.text}>
            {t('search.useMyLocation')}
          </AppText>
        </Pressable>
      )}
      {purpose.kind !== 'save' && (
        <View style={styles.section}>
          <AppText variant="bodyStrong" color={colors.navy} accessibilityRole="header">
            {t('search.yourPlaces')}
          </AppText>
          <View style={styles.chips}>
            {SAVED_KEYS.map((key) => (
              <PlaceChip
                key={key}
                label={t(`saved.${key}`)}
                icon={SAVED_ICONS[key]}
                unset={!saved[key]}
                hint={saved[key] ? t('saved.setHint', { name: saved[key].name }) : t('saved.notSetHint')}
                onPress={() => onPickSaved(key)}
                onLongPress={() => onSavedLongPress(key)}
              />
            ))}
          </View>
        </View>
      )}
      {purpose.kind !== 'save' && starred.length > 0 && (
        <View style={styles.section}>
          <AppText variant="bodyStrong" color={colors.navy} accessibilityRole="header">
            {t('starred.title')}
          </AppText>
          {starred.map((p, i) => (
            <View key={`${p.name}:${i}`}>
              {i > 0 && <Separator />}
              <PlaceRow place={{ ...p, distM: null }} icon={Star} onPress={() => onPickRecent(p)} />
            </View>
          ))}
        </View>
      )}
      {recent.length > 0 && (
        <View style={styles.section}>
          <AppText variant="bodyStrong" color={colors.navy} accessibilityRole="header">
            {t('search.recent')}
          </AppText>
          {recent.map((p, i) => (
            <View key={`${p.name}:${i}`}>
              {i > 0 && <Separator />}
              <PlaceRow place={{ ...p, distM: null }} icon={Clock} onPress={() => onPickRecent(p)} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function PlaceRow({ place, onPress, icon }: { place: Place; onPress: () => void; icon?: typeof Clock }) {
  const { t } = useTranslation();
  const Icon = icon ?? placeIcon(place.category);
  const outside = !isInPilotArea(place.lngLat);
  const distance = place.distM != null ? formatDistance(place.distM) : null;
  const sub = outside ? t('search.outsidePilot') : place.area;
  // With big phone text the distance moves under the name, so the name keeps the width.
  const stacked = useWindowDimensions().fontScale > chromeTextScale;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[place.name, sub, distance && t('search.away', { distance })].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowIcon}>
        <Icon size={22} color={colors.navy} />
      </View>
      <View style={styles.rowText}>
        <AppText variant="bodyStrong" color={colors.text} numberOfLines={2}>
          {place.name}
        </AppText>
        {sub && (
          <AppText color={colors.textMuted} numberOfLines={2}>
            {sub}
          </AppText>
        )}
        {stacked && distance && <AppText color={colors.textMuted}>{distance}</AppText>}
      </View>
      {!stacked && distance && <AppText color={colors.textMuted}>{distance}</AppText>}
    </Pressable>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...shadow.floating,
  },
  head: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.md },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.handle, marginTop: spacing.sm },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  field: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.interactive,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: { flex: 1, fontFamily, ...type.body, color: colors.text, paddingVertical: spacing.sm },
  list: { paddingHorizontal: spacing.md },
  start: { gap: spacing.lg, paddingTop: spacing.sm },
  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 72, paddingVertical: spacing.sm },
  rowIcon: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    backgroundColor: colors.interactiveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  separator: { height: 1, backgroundColor: colors.border },
  hint: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  hintText: { flex: 1 },
  message: { paddingVertical: spacing.lg, gap: spacing.sm },
  retry: { minHeight: touchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
  pressed: { opacity: 0.7 },
});
