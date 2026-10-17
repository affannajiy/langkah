import { ArrowUp, CloudOff, List, Map as MapIcon, RefreshCw } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CommunityReport, CommunitySort, Vote } from '../../api/reports';
import type { ReportKind } from '../../api/types';
import { AppText, TextScaleCap } from '../../components/AppText';
import { Snackbar, useSnackbar } from '../../components/Snackbar';
import { StatusBanner } from '../../components/StatusBanner';
import { CommunityMap } from '../../features/community/CommunityMap';
import { ReportDetailSheet } from '../../features/community/ReportDetailSheet';
import { FeaturedCard, ReportRow } from '../../features/community/ReportRow';
import { useCommunityList, useVoting } from '../../features/community/useCommunity';
import { HazardMark } from '../../map/MapPins';
import { useHere } from '../../map/useHere';
import { useLocationPermission } from '../../map/useLocationPermission';
import { useOnline } from '../../net/useOnline';
import { cappedContent } from '../../theme/layout';
import { chromeTextScale, colors, radius, spacing, touchTarget } from '../../theme/theme';

const SORTS: CommunitySort[] = ['top', 'newest', 'nearest'];

// Community tab (guide Section 6.3, screen 7; docs/screens/Community.png).
export default function CommunityScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();
  const { access, request } = useLocationPermission();
  const here = useHere(access);
  const online = useOnline();

  const [kind, setKind] = useState<ReportKind>('improvement');
  const [sort, setSort] = useState<CommunitySort>('top');
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [open, setOpen] = useState<CommunityReport | null>(null);
  const [mapReload, setMapReload] = useState(0);

  const list = useCommunityList(kind, sort, here);
  const { vote, busyId } = useVoting(here);

  const onVote = useCallback(
    async (r: CommunityReport, v: Vote) => {
      const outcome = await vote(r, v);
      if (outcome.report) {
        list.replace(outcome.report);
        setOpen((cur) => (cur && cur.id === r.id ? outcome.report : cur));
        if (v !== 'upvote' && r.myVote !== v) snackbar.show({ text: t('community.voteSent') });
        return;
      }
      if (outcome.error === 'not_allowed') snackbar.show({ text: t('community.voteNotAllowed') });
      else if (outcome.error === 'network') snackbar.show({ text: t('community.voteFailed') });
    },
    [vote, list, snackbar, t],
  );

  async function pickSort(next: CommunitySort) {
    if (next === 'nearest' && access !== 'granted') {
      const granted = (await request()) === 'granted';
      if (!granted) {
        snackbar.show({ text: t('community.needLocation') });
        return;
      }
    }
    setSort(next);
  }

  const featured = kind === 'improvement' && sort === 'top' && list.items[0]?.photoUrl ? list.items[0] : null;
  const rows = featured ? list.items.slice(1) : list.items;
  const heading =
    kind === 'improvement'
      ? sort === 'top'
        ? t('community.headingTop')
        : t('community.headingImprovements')
      : t('community.headingHazards');

  const header = (
    <View style={styles.listHeader}>
      <AppText variant="heading" color={colors.navy} accessibilityRole="header">
        {heading}
      </AppText>
      {featured && (
        <FeaturedCard report={featured} busy={busyId === featured.id} onOpen={setOpen} onVote={onVote} />
      )}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      {/* The controls above the list cap big phone text, so the list keeps most of the
          screen; the reports in the list follow the phone's text size fully. */}
      <TextScaleCap.Provider value={chromeTextScale}>
        <View style={styles.top}>
          <View style={styles.titleBlock}>
            <AppText variant="title" color={colors.navy} accessibilityRole="header" style={styles.bigTitle}>
              {t('community.title')}
            </AppText>
            <AppText variant="body" color={colors.textMuted}>
              {t('community.area')}
            </AppText>
          </View>
          <View style={styles.segment} accessibilityRole="tablist">
            {(['list', 'map'] as const).map((m) => {
              const on = mode === m;
              const Icon = m === 'list' ? List : MapIcon;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="tab"
                  accessibilityLabel={t(`community.${m}`)}
                  accessibilityState={{ selected: on }}
                  onPress={() => setMode(m)}
                  style={[styles.segmentItem, on && styles.segmentOn]}
                >
                  <Icon size={24} color={on ? colors.navy : colors.textMuted} strokeWidth={on ? 2.5 : 2} />
                </Pressable>
              );
            })}
          </View>
        </View>

        {!online && <StatusBanner icon={CloudOff} text={t('offline.banner')} style={styles.offline} />}

        <View style={styles.kindsWrap}>
          <View style={styles.kinds} accessibilityRole="tablist">
            {(['hazard', 'improvement'] as const).map((k) => {
              const on = kind === k;
              return (
                <Pressable
                  key={k}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => setKind(k)}
                  style={[styles.kind, on && styles.kindOn]}
                >
                  {k === 'hazard' ? (
                    <HazardMark size={20} />
                  ) : (
                    <ArrowUp size={20} color={on ? colors.community : colors.communityText} strokeWidth={2.75} />
                  )}
                  <AppText
                    variant="bodyStrong"
                    color={on ? colors.white : colors.navy}
                    style={styles.kindText}
                  >
                    {t(`community.kind.${k}`)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </TextScaleCap.Provider>

      {mode === 'list' ? (
        <>
          <TextScaleCap.Provider value={chromeTextScale}>
            <View style={styles.sorts}>
              {SORTS.map((s) => {
                const on = sort === s;
                return (
                  <Pressable
                    key={s}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => pickSort(s)}
                    style={[styles.sort, on && styles.sortOn]}
                  >
                    <AppText variant="bodyStrong" color={on ? colors.white : colors.text}>
                      {t(`community.sort.${s}`)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </TextScaleCap.Provider>

          {list.status === 'loading' && list.items.length === 0 ? (
            <ActivityIndicator style={styles.loading} color={colors.navy} size="large" />
          ) : list.status === 'error' ? (
            <View style={styles.empty}>
              <AppText variant="body" color={colors.textMuted} style={styles.center}>
                {t('community.loadFailed')}
              </AppText>
              <Pressable accessibilityRole="button" onPress={list.reload} style={styles.retry}>
                <RefreshCw size={20} color={colors.navy} />
                <AppText variant="bodyStrong" color={colors.navy}>
                  {t('common.retry')}
                </AppText>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.id}
              ListHeaderComponent={header}
              renderItem={({ item, index }) => (
                <ReportRow
                  report={item}
                  busy={busyId === item.id}
                  onOpen={setOpen}
                  onVote={onVote}
                  first={index === 0}
                  last={index === rows.length - 1}
                />
              )}
              ListEmptyComponent={
                featured ? null : (
                  <AppText variant="body" color={colors.textMuted} style={styles.emptyText}>
                    {t(`community.empty.${kind}`)}
                  </AppText>
                )
              }
              ListFooterComponent={list.loadingMore ? <ActivityIndicator color={colors.navy} style={styles.more} /> : null}
              onEndReached={list.loadMore}
              onEndReachedThreshold={0.4}
              refreshControl={
                <RefreshControl refreshing={list.status === 'loading'} onRefresh={list.reload} colors={[colors.navy]} />
              }
              contentContainerStyle={styles.listContent}
            />
          )}
        </>
      ) : (
        <View style={styles.mapWrap}>
          <CommunityMap kind={kind} here={here} reloadKey={mapReload} onOpen={setOpen} />
        </View>
      )}

      {open && (
        <ReportDetailSheet
          report={open}
          busy={busyId === open.id}
          bottom={0}
          onVote={onVote}
          onClose={() => {
            setOpen(null);
            if (mode === 'map') setMapReload((k) => k + 1);
          }}
        />
      )}

      <Snackbar message={snackbar.message} onHide={snackbar.hide} bottom={spacing.md} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  // Title left, icon-only List / Map toggle right, on one row.
  top: { ...cappedContent, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
  titleBlock: { flex: 1 },
  bigTitle: { fontSize: 32, lineHeight: 40 },
  segment: { flexDirection: 'row', gap: spacing.xs, backgroundColor: colors.neutralBadge, borderRadius: radius.card, padding: spacing.xs },
  segmentItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.card - spacing.xs,
  },
  segmentOn: { backgroundColor: colors.white },
  // Inset with padding on a capped row, not margins: margins on a 100% width
  // pushed the bar past the screen edge.
  kindsWrap: { ...cappedContent, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  kinds: {
    flexDirection: 'row',
    padding: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kind: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: touchTarget + spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.card - spacing.xs,
  },
  kindOn: { backgroundColor: colors.navy },
  kindText: { flexShrink: 1, textAlign: 'center' },
  sorts: {
    ...cappedContent,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  sort: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  sortOn: { backgroundColor: colors.text, borderColor: colors.text },
  listHeader: { gap: spacing.md, paddingBottom: spacing.md },
  listContent: {
    ...cappedContent, padding: spacing.md, paddingBottom: spacing.xxl },
  loading: { marginTop: spacing.xxl },
  more: { marginVertical: spacing.md },
  empty: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  offline: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  emptyText: { textAlign: 'center', padding: spacing.lg },
  retry: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.lg },
  mapWrap: { flex: 1, margin: spacing.md },
});
