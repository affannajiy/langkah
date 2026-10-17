import { useFocusEffect, useRouter } from 'expo-router';
import {
  Briefcase,
  ChevronRight,
  CloudOff,
  CloudUpload,
  FlaskConical,
  GraduationCap,
  House,
  Settings as SettingsIcon,
  ShieldCheck,
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
import { useAuth } from '../../auth/AuthProvider';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Snackbar, useSnackbar } from '../../components/Snackbar';
import { StatusBanner } from '../../components/StatusBanner';
import { ReportDetailSheet } from '../../features/community/ReportDetailSheet';
import { Thumb } from '../../features/community/ReportRow';
import { StatusChip } from '../../features/community/StatusChip';
import { categoryKey } from '../../features/report/categoryIcons';
import { pickPhoto } from '../../features/report/pickPhoto';
import { timeAgo } from '../../i18n/format';
import { useOnline } from '../../net/useOnline';
import { requestChooseSaved, SAVED_KEYS, useSavedPlaces, type SavedKey } from '../../storage/places';
import { queuedCount, subscribeQueue } from '../../storage/reportQueue';
import { cappedContent } from '../../theme/layout';
import { colors, radius, spacing, touchTarget } from '../../theme/theme';

const SAVED_ICONS: Record<SavedKey, LucideIcon> = { home: House, utp: GraduationCap, work: Briefcase };

type Mine = { status: 'loading' | 'ok' | 'error'; items: CommunityReport[]; more: boolean };

// Me (guide Section 5.2, screen 17): account, contribution stats, saved places and
// the user's own reports with their status. Settings opens from the top right.
export default function MeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const snackbar = useSnackbar();
  const { isFull, canWrite, name, demo, requireSignIn, signOut } = useAuth();
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
    try {
      const [s, items] = await Promise.all([myStats(), myReports(0)]);
      setStats(s);
      setMine({ status: 'ok', items, more: items.length === PAGE_SIZE });
    } catch (error) {
      console.warn('Could not load my reports', error);
      setMine((m) => ({ ...m, status: m.items.length ? 'ok' : 'error' }));
    }
  }, []);

  // Fresh numbers each time the tab opens, and after signing in or out.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, canWrite, isFull]),
  );

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

  const accountTitle = isFull ? (name ? t('me.signedInAs', { name }) : t('me.signedIn')) : demo.on ? t('me.demoGuest') : t('me.guest');
  const accountBody = isFull ? t('me.signedInBody') : demo.on ? t('me.demoBody') : t('me.guestBody');

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
            <View style={[styles.icon, { backgroundColor: isFull ? colors.safeSoft : demo.on ? colors.interactiveSoft : colors.neutralBadge }]}>
              {isFull ? (
                <ShieldCheck size={28} color={colors.safeText} />
              ) : demo.on ? (
                <FlaskConical size={28} color={colors.interactiveText} />
              ) : (
                <UserRound size={28} color={colors.textMuted} />
              )}
            </View>
            <View style={styles.flex}>
              <AppText variant="heading" color={colors.text}>
                {accountTitle}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {accountBody}
              </AppText>
            </View>
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
            !demo.on && <Button label={t('me.signIn')} onPress={() => void requireSignIn('me')} />
          )}
        </View>

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
  card: { backgroundColor: colors.white, borderRadius: radius.sheet, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
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
