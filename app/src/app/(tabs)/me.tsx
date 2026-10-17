import { useFocusEffect, useRouter } from 'expo-router';
import {
  Briefcase,
  ChevronRight,
  CloudOff,
  Crown,
  CloudUpload,
  FlaskConical,
  GraduationCap,
  House,
  Settings as SettingsIcon,
  ShieldCheck,
  Star,
  Ticket,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  deleteReport,
  myReports,
  myStats,
  PAGE_SIZE,
  preparePhoto,
  ReportError,
  setReportPhoto,
  uploadPhoto,
  type CommunityReport,
  type MyStats,
} from '../../api/reports';
import { myItems, myWallet, type OwnedItem, type Wallet } from '../../api/points';
import { useAuth } from '../../auth/AuthProvider';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Snackbar, useSnackbar } from '../../components/Snackbar';
import { ScrimSheet } from '../../components/ScrimSheet';
import { StatusBanner } from '../../components/StatusBanner';
import { ReportDetailSheet } from '../../features/community/ReportDetailSheet';
import { Thumb } from '../../features/community/ReportRow';
import { StatusChip } from '../../features/community/StatusChip';
import { categoryKey } from '../../features/report/categoryIcons';
import { Avatar } from '../../features/points/Avatar';
import { itemText } from '../../features/points/catalog';
import { useOpenTopUp } from '../../features/points/useOpenTopUp';
import { VoucherBody } from '../../features/points/VoucherSheet';
import { CheckinCard, LedgerCard, PointsCard } from '../../features/points/WalletCards';
import { pickPhoto } from '../../features/report/pickPhoto';
import { shortDate, timeAgo } from '../../i18n/format';
import { useOnline } from '../../net/useOnline';
import { usePointsNotice } from '../../points/notice';
import { usePlusActive } from '../../points/plus';
import {
  MAX_STARRED_FREE,
  MAX_STARRED_PLUS,
  requestChooseSaved,
  requestRoute,
  restoreStar,
  SAVED_KEYS,
  unstar,
  useSavedPlaces,
  useStarred,
  type SavedKey,
  type StoredPlace,
} from '../../storage/places';
import { queuedCount, subscribeQueue } from '../../storage/reportQueue';
import { cappedContent } from '../../theme/layout';
import { colors, radius, spacing, touchTarget } from '../../theme/theme';

const SAVED_ICONS: Record<SavedKey, LucideIcon> = { home: House, utp: GraduationCap, work: Briefcase };

type Mine = { status: 'loading' | 'ok' | 'error'; items: CommunityReport[]; more: boolean };

// Me (guide Section 5.2, screen 17; Section 15 and docs/screens/Wallet.png for the
// wallet): account, Langkah Points, contribution stats, saved places and the user's
// own reports with their status. Settings opens from the top right.
export default function MeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const snackbar = useSnackbar();
  const { ready, hasSession, isFull, canWrite, name, demo, requireSignIn, signOut, resetDemo } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [vouchers, setVouchers] = useState<OwnedItem[]>([]);
  const [voucherOpen, setVoucherOpen] = useState<OwnedItem | null>(null);
  const openTopUp = useOpenTopUp();
  const starred = useStarred();
  const plus = usePlusActive();
  const [resetting, setResetting] = useState(false);
  const { saved, setPlace } = useSavedPlaces();
  const [waiting, setWaiting] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [mine, setMine] = useState<Mine>({ status: 'loading', items: [], more: false });
  const [open, setOpen] = useState<CommunityReport | null>(null);
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerMessage, setOwnerMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mineRef = useRef(mine);
  mineRef.current = mine;

  useEffect(() => {
    queuedCount().then(setWaiting);
    return subscribeQueue(setWaiting);
  }, []);

  const load = useCallback(async () => {
    if (!ready) return;
    // No session at all (guest sign-in failed): nothing of yours to load, which is not a network error.
    if (!hasSession) {
      setStats(null);
      setWallet(null);
      setVouchers([]);
      setMine({ status: 'ok', items: [], more: false });
      return;
    }
    // The wallet loads on its own, so a slow report list never hides the points.
    myWallet()
      .then(setWallet)
      .catch((error: unknown) => console.warn('Could not load the wallet', error));
    myItems()
      .then((items) => setVouchers(items.filter((i) => i.code !== null)))
      .catch((error: unknown) => console.warn('Could not load vouchers', error));
    try {
      const [s, items] = await Promise.all([myStats(), myReports(0)]);
      setStats(s);
      setMine({ status: 'ok', items, more: items.length === PAGE_SIZE });
    } catch (error) {
      console.warn('Could not load my reports', error);
      setMine((m) => ({ ...m, status: m.items.length ? 'ok' : 'error' }));
    }
  }, [ready, hasSession]);

  // Fresh numbers each time the tab opens, and after signing in or out.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, canWrite, isFull, demo.isDemo]),
  );

  // Points that arrive on their own (daily check-in) show at once.
  const reloadWallet = useCallback(() => {
    myWallet()
      .then(setWallet)
      .catch(() => undefined);
  }, []);
  usePointsNotice(reloadWallet);

  // Ads only from the wallet, never during a walk; 5 a day.
  function watchAd() {
    if (wallet && wallet.adsLeft <= 0) {
      snackbar.show({ text: t('ads.none') });
      return;
    }
    router.push('/ad');
  }

  function removeStar(place: StoredPlace, index: number) {
    unstar(place);
    snackbar.show({
      text: t('starred.removed', { name: place.name }),
      actionLabel: t('common.undo'),
      onAction: () => restoreStar(place, index),
    });
  }

  // A starred place opens the route compare on the Map tab.
  function openStarred(place: StoredPlace) {
    requestRoute(place);
    router.navigate('/');
  }

  // Cannot be undone, so a dialog (guide Section 5.3).
  function confirmReset() {
    Alert.alert(t('me.resetTitle'), t('me.resetBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('me.reset'),
        style: 'destructive',
        onPress: async () => {
          setResetting(true);
          const ok = await resetDemo();
          setResetting(false);
          snackbar.show({ text: ok ? t('me.resetDone') : t('me.resetFailed') });
          if (ok) await load();
        },
      },
    ]);
  }

  async function loadMore() {
    const m = mineRef.current;
    if (!m.more) return;
    try {
      const next = await myReports(m.items.length);
      setMine({ status: 'ok', items: [...m.items, ...next], more: next.length === PAGE_SIZE });
    } catch {
      snackbar.show({ text: t('me.loadFailed') });
    }
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function chooseSaved(key: SavedKey) {
    requestChooseSaved(key);
    router.navigate('/');
  }

  function clearSaved(key: SavedKey) {
    const before = saved[key];
    setPlace(key, null);
    snackbar.show({
      text: t('saved.clearedToast', { label: t(`saved.${key}`) }),
      actionLabel: t('common.undo'),
      onAction: () => setPlace(key, before),
    });
  }

  function openReport(r: CommunityReport) {
    setOwnerMessage(null);
    setOpen(r);
  }

  async function addPhoto(r: CommunityReport, from: 'camera' | 'library') {
    setOwnerMessage(null);
    const picked = await pickPhoto(from);
    if (picked === 'denied') {
      setOwnerMessage(t('report.cameraDenied'));
      return;
    }
    if (!picked) return;
    setOwnerBusy(true);
    setOwnerMessage(t('me.uploading'));
    try {
      const path = await uploadPhoto(await preparePhoto(picked.uri, picked.width));
      await setReportPhoto(r.id, path);
      setOpen(null);
      snackbar.show({ text: t('me.photoAdded') });
      await load();
    } catch (e) {
      const code = e instanceof ReportError ? e.code : 'network';
      setOwnerMessage(t(`report.error.${code}`, { defaultValue: t('report.error.network') }));
    } finally {
      setOwnerBusy(false);
    }
  }

  // Deleting cannot be undone, so this is the one place a dialog is right (Section 5.3).
  function confirmDelete(r: CommunityReport) {
    Alert.alert(t('me.deleteTitle'), t('me.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('me.delete'),
        style: 'destructive',
        onPress: async () => {
          setOwnerBusy(true);
          try {
            await deleteReport(r);
            setOpen(null);
            snackbar.show({ text: t('me.deleted') });
            await load();
          } catch {
            setOwnerMessage(t('me.deleteFailed'));
          } finally {
            setOwnerBusy(false);
          }
        },
      },
    ]);
  }

  const demoName = demo.isDemo ? (wallet?.name ?? t('me.demoGuest')) : null;
  const accountTitle = isFull ? (name ? t('me.signedInAs', { name }) : t('me.signedIn')) : demoName ?? t('me.guest');
  const accountBody = isFull ? t('me.signedInBody') : demo.isDemo ? (wallet?.code ?? t('me.demoBody')) : t('me.guestBody');

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.top}>
        <AppText variant="title" color={colors.navy} accessibilityRole="header" style={styles.bigTitle}>
          {t('me.title')}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.title')}
          onPress={() => router.push('/settings')}
          style={styles.gear}
        >
          <SettingsIcon size={24} color={colors.navy} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.navy]} />}
      >
        {!online && <StatusBanner icon={CloudOff} text={t('offline.banner')} />}

        <View style={styles.card}>
          <View style={styles.row}>
            <Avatar
              size={56}
              frame={wallet?.frame ?? null}
              badge={wallet?.badge ?? null}
              fill={isFull ? colors.safeSoft : demo.isDemo ? colors.interactiveSoft : colors.neutralBadge}
            >
              {isFull ? (
                <ShieldCheck size={28} color={colors.safeText} />
              ) : demo.isDemo ? (
                <FlaskConical size={28} color={colors.interactiveText} />
              ) : (
                <UserRound size={28} color={colors.textMuted} />
              )}
            </Avatar>
            <View style={styles.flex}>
              <AppText variant="heading" color={colors.text}>
                {accountTitle}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {accountBody}
              </AppText>
            </View>
            {demo.isDemo && (
              <View style={styles.demoChip}>
                <AppText variant="label" color={colors.hazardText}>
                  {t('me.demoChip')}
                </AppText>
              </View>
            )}
          </View>

          {waiting > 0 && (
            <View style={styles.row} accessibilityLiveRegion="polite">
              <CloudUpload size={22} color={colors.interactiveText} />
              <AppText variant="label" color={colors.text} style={styles.flex}>
                {t('me.waiting', { count: waiting })}
              </AppText>
            </View>
          )}

          {isFull ? (
            <Button
              kind="secondary"
              label={busy ? t('me.signingOut') : t('me.signOut')}
              onPress={async () => {
                if (busy) return;
                setBusy(true);
                await signOut();
                setBusy(false);
              }}
            />
          ) : (
            <Button label={t('me.signIn')} onPress={() => void requireSignIn('me')} />
          )}
        </View>

        {wallet && (
          <>
            <PointsCard
              wallet={wallet}
              onTopUp={() => void openTopUp()}
              onAd={watchAd}
              onShop={() => router.push('/shop')}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/plus')}
              style={({ pressed }) => [styles.plusRow, pressed && styles.pressed]}
            >
              <Crown size={26} color={colors.plusText} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong" color={colors.text}>
                  {wallet.plusUntil ? t('plus.rowUntil', { date: shortDate(wallet.plusUntil) }) : t('plus.row')}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {t('plus.rowBody')}
                </AppText>
              </View>
              <ChevronRight size={22} color={colors.textMuted} />
            </Pressable>
            <CheckinCard day={wallet.checkin.day} />
            <LedgerCard lines={wallet.lines} />
            {vouchers.length > 0 && (
              <>
                <AppText variant="heading" color={colors.navy} accessibilityRole="header">
                  {t('shop.myVouchers')}
                </AppText>
                <View style={styles.list}>
                  {vouchers.map((v, i) => (
                    <Pressable
                      key={v.id}
                      accessibilityRole="button"
                      onPress={() => setVoucherOpen(v)}
                      style={({ pressed }) => [styles.listMain, i < vouchers.length - 1 && styles.rowDivider, pressed && styles.pressed]}
                    >
                      <View style={styles.smallIcon}>
                        <Ticket size={22} color={colors.navy} />
                      </View>
                      <View style={styles.flex}>
                        <AppText variant="bodyStrong" color={colors.text}>
                          {itemText(t, v.item, 'name')}
                        </AppText>
                        <AppText variant="caption" color={colors.textMuted}>
                          {`${v.code} · ${shortDate(v.at)}`}
                        </AppText>
                      </View>
                      <ChevronRight size={22} color={colors.textMuted} />
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            {demo.isDemo && (
              <Pressable
                accessibilityRole="button"
                disabled={resetting}
                onPress={confirmReset}
                style={({ pressed }) => [styles.resetLink, pressed && styles.pressed]}
              >
                {resetting ? (
                  <ActivityIndicator color={colors.interactiveText} />
                ) : (
                  <AppText variant="bodyStrong" color={colors.interactiveText} style={styles.underline}>
                    {t('me.reset')}
                  </AppText>
                )}
              </Pressable>
            )}
          </>
        )}

        {stats && (canWrite || stats.reports + stats.votes > 0) && (
          <View style={[styles.card, styles.stats]}>
            <Stat value={stats.reports} label={t('me.stats.reports', { count: stats.reports })} />
            <View style={styles.divider} />
            <Stat value={stats.votes} label={t('me.stats.votes', { count: stats.votes })} />
            <View style={styles.divider} />
            <Stat value={stats.agreed} label={t('me.stats.agreed', { count: stats.agreed })} />
          </View>
        )}

        <AppText variant="heading" color={colors.navy} accessibilityRole="header">
          {t('me.savedTitle')}
        </AppText>
        <View style={styles.list}>
          {SAVED_KEYS.map((key, i) => {
            const place = saved[key];
            const Icon = SAVED_ICONS[key];
            const label = t(`saved.${key}`);
            return (
              <View key={key} style={[styles.listRow, i < SAVED_KEYS.length - 1 && styles.rowDivider]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={place ? `${label}, ${place.name}` : `${label}, ${t('me.notSet')}`}
                  accessibilityHint={t('me.savedHint')}
                  onPress={() => chooseSaved(key)}
                  style={({ pressed }) => [styles.listMain, pressed && styles.pressed]}
                >
                  <View style={styles.smallIcon}>
                    <Icon size={22} color={colors.navy} />
                  </View>
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong" color={colors.text}>
                      {label}
                    </AppText>
                    <AppText variant="caption" color={colors.textMuted} numberOfLines={2}>
                      {place ? place.name : t('me.notSetTap')}
                    </AppText>
                  </View>
                  {!place && <ChevronRight size={22} color={colors.textMuted} />}
                </Pressable>
                {place && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('me.clearSaved', { label })}
                    onPress={() => clearSaved(key)}
                    style={styles.clear}
                  >
                    <X size={22} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.headRow}>
          <AppText variant="heading" color={colors.navy} accessibilityRole="header" style={styles.flex}>
            {t('starred.title')}
          </AppText>
          <AppText variant="label" color={colors.textMuted}>
            {t('starred.count', { count: starred.length, max: plus ? MAX_STARRED_PLUS : MAX_STARRED_FREE })}
          </AppText>
        </View>
        {starred.length === 0 ? (
          <AppText variant="caption" color={colors.textMuted}>
            {t('starred.empty')}
          </AppText>
        ) : (
          <View style={styles.list}>
            {starred.map((place, i) => (
              <View key={`${place.name}:${i}`} style={[styles.listRow, i < starred.length - 1 && styles.rowDivider]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint={t('starred.openHint')}
                  onPress={() => openStarred(place)}
                  style={({ pressed }) => [styles.listMain, pressed && styles.pressed]}
                >
                  <View style={styles.smallIcon}>
                    <Star size={22} color={colors.hazardText} fill={colors.hazard} />
                  </View>
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong" color={colors.text} numberOfLines={2}>
                      {place.name}
                    </AppText>
                    {place.area && (
                      <AppText variant="caption" color={colors.textMuted}>
                        {place.area}
                      </AppText>
                    )}
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('starred.remove', { name: place.name })}
                  onPress={() => removeStar(place, i)}
                  style={styles.clear}
                >
                  <X size={22} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <AppText variant="heading" color={colors.navy} accessibilityRole="header">
          {t('me.reportsTitle')}
        </AppText>
        {mine.status === 'loading' && <ActivityIndicator color={colors.navy} style={styles.loading} />}
        {mine.status === 'error' && (
          <View style={styles.empty}>
            <AppText color={colors.textMuted}>{t('me.loadFailed')}</AppText>
            <Button kind="secondary" label={t('common.retry')} onPress={() => void load()} />
          </View>
        )}
        {mine.status === 'ok' && mine.items.length === 0 && (
          <View style={styles.empty}>
            <AppText color={colors.textMuted}>{t('me.noReports')}</AppText>
          </View>
        )}
        {mine.items.length > 0 && (
          <View style={styles.list}>
            {mine.items.map((r, i) => (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityHint={t('community.openHint')}
                onPress={() => openReport(r)}
                style={({ pressed }) => [styles.reportRow, i < mine.items.length - 1 && styles.rowDivider, pressed && styles.pressed]}
              >
                <Thumb r={r} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" color={colors.text} numberOfLines={2}>
                    {t(categoryKey(r.kind, r.category))}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted} numberOfLines={2}>
                    {[r.street ?? t('community.noStreet'), timeAgo(r.createdAt)].join(' · ')}
                  </AppText>
                  <View style={styles.chipRow}>
                    <StatusChip status={r.status} />
                    <AppText variant="label" color={colors.textMuted}>
                      {r.kind === 'hazard'
                        ? t('community.voteCounts', { confirms: r.confirms, gone: r.gone })
                        : t('community.upvoteCount', { count: r.upvotes })}
                    </AppText>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
        {mine.more && <Button kind="secondary" label={t('me.showMore')} onPress={() => void loadMore()} />}
      </ScrollView>

      {open && (
        <ReportDetailSheet
          report={open}
          busy={ownerBusy}
          bottom={0}
          onVote={() => undefined}
          onClose={() => !ownerBusy && setOpen(null)}
          owner={{ onAddPhoto: addPhoto, onDelete: confirmDelete, message: ownerMessage }}
        />
      )}

      <ScrimSheet visible={voucherOpen !== null} onClose={() => setVoucherOpen(null)}>
        {voucherOpen?.code && (
          <VoucherBody item={voucherOpen.item} code={voucherOpen.code} at={voucherOpen.at} onClose={() => setVoucherOpen(null)} />
        )}
      </ScrimSheet>

      <Snackbar message={snackbar.message} onHide={snackbar.hide} bottom={spacing.md} />
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <AppText variant="title" color={colors.navy}>
        {value}
      </AppText>
      <AppText variant="caption" color={colors.textMuted} style={styles.center}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  demoChip: { backgroundColor: colors.hazardSoft, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  plusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget + spacing.md,
    backgroundColor: colors.plusSoft,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  resetLink: { minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  root: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  bigTitle: { fontSize: 32, lineHeight: 40 },
  gear: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    ...cappedContent, padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 56, height: 56, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
  stats: { flexDirection: 'row', paddingHorizontal: spacing.xs },
  stat: { flex: 1, alignItems: 'center', gap: spacing.xs },
  divider: { width: 1, backgroundColor: colors.border },
  center: { textAlign: 'center' },
  list: { backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center' },
  listMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touchTarget + spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  smallIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.interactiveSoft, alignItems: 'center', justifyContent: 'center' },
  clear: { width: touchTarget + spacing.sm, height: touchTarget + spacing.sm, alignItems: 'center', justifyContent: 'center' },
  reportRow: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
  loading: { paddingVertical: spacing.lg },
  empty: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  pressed: { opacity: 0.85 },
});
