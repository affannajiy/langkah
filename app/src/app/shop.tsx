import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, Crown, UserRound } from 'lucide-react-native';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  cosmeticUse,
  myItems,
  myWallet,
  pointsErrorCode,
  shopBuy,
  shopItems,
  type OwnedItem,
  type ShopItem,
  type Wallet,
} from '../api/points';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScrimSheet } from '../components/ScrimSheet';
import { Snackbar, useSnackbar } from '../components/Snackbar';
import { Avatar } from '../features/points/Avatar';
import { BADGES, itemText, PLUS_GOLD, voucherLook } from '../features/points/catalog';
import { LowPointsBody, type LowPoints } from '../features/points/LowPointsSheet';
import { useOpenTopUp } from '../features/points/useOpenTopUp';
import { VoucherBody } from '../features/points/VoucherSheet';
import { formatPoints } from '../i18n/format';
import { partnerOf } from '../points/partners';
import { cappedContent } from '../theme/layout';
import { colors, radius, spacing, touchTarget } from '../theme/theme';

type Tab = 'vouchers' | 'cosmetics';
type Open = { kind: 'low'; need: LowPoints } | { kind: 'voucher'; item: string; code: string; at: string } | null;

// Points shop (guide Sections 15.2 and 15.6; docs/screens/Shop.png). Vouchers from
// partner shops (the Sponsored pins on the map), and cosmetics (frames and badges).
// Everyone may spend the points they earned. Spending cannot be undone, so it asks
// in a dialog first. From a sponsored pin, ?buy=<voucher> opens that voucher's dialog.
export default function ShopScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { buy: buyParam } = useLocalSearchParams<{ buy?: string }>();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();
  const openTopUp = useOpenTopUp();
  const [tab, setTab] = useState<Tab>('vouchers');
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [owned, setOwned] = useState<OwnedItem[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);

  const load = useCallback(async () => {
    try {
      const [i, o, w] = await Promise.all([shopItems(), myItems(), myWallet()]);
      setItems(i);
      setOwned(o);
      setWallet(w);
      setFailed(false);
    } catch (e) {
      console.warn('Could not load the shop', e);
      setFailed(true);
    }
  }, []);

  // Fresh balance after a top-up or an ad.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const name = (id: string) => itemText(t, id, 'name');

  function buy(item: ShopItem) {
    if (!wallet || busy) return;
    if (wallet.balance < item.cost) {
      setOpen({ kind: 'low', need: { item: name(item.id), cost: item.cost, have: wallet.balance } });
      return;
    }
    Alert.alert(t('shop.confirmTitle', { item: name(item.id) }), t('shop.confirmBody', { cost: formatPoints(item.cost) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: item.kind === 'voucher' ? t('shop.redeem') : t('shop.get'),
        onPress: async () => {
          setBusy(item.id);
          try {
            const r = await shopBuy(item.id);
            if (item.kind === 'voucher' && r.code) {
              setOpen({ kind: 'voucher', item: item.id, code: r.code, at: new Date().toISOString() });
            } else {
              await cosmeticUse(item.kind === 'frame' ? 'frame' : 'badge', item.id);
              snackbar.show({ text: t('shop.wearing', { item: name(item.id) }) });
            }
            await load();
          } catch (e) {
            const code = pointsErrorCode(e);
            snackbar.show({ text: t(`shop.error.${code}`, { defaultValue: t('shop.error.network') }) });
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  // From a sponsored pin: ask about that voucher once the shop and wallet are in.
  const askedParam = useRef(false);
  const askParam = useEffectEvent((list: ShopItem[]) => {
    const item = list.find((i) => i.id === buyParam);
    if (item) buy(item);
    else snackbar.show({ text: t('shop.error.no_item') });
  });
  const ready = items !== null && wallet !== null;
  useEffect(() => {
    if (askedParam.current || !buyParam || !ready || !items) return;
    askedParam.current = true;
    askParam(items);
  }, [buyParam, ready, items]);

  async function wear(item: ShopItem, on: boolean) {
    if (busy) return;
    setBusy(item.id);
    try {
      await cosmeticUse(item.kind === 'frame' ? 'frame' : 'badge', on ? item.id : null);
      snackbar.show({ text: on ? t('shop.wearing', { item: name(item.id) }) : t('shop.removed', { item: name(item.id) }) });
      await load();
    } catch {
      snackbar.show({ text: t('shop.error.network') });
    } finally {
      setBusy(null);
    }
  }

  const list = (items ?? []).filter((i) => (tab === 'vouchers' ? i.kind === 'voucher' : i.kind !== 'voucher'));
  const ownedIds = new Set(owned.filter((o) => o.code === null).map((o) => o.item));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={t('shop.title')}
        onBack={() => router.back()}
        right={
          wallet && (
            <View style={styles.balance} accessible accessibilityLabel={t('shop.balanceA11y', { value: formatPoints(wallet.balance) })}>
              <AppText variant="bodyStrong" color={colors.white}>
                {t('shop.pts', { value: formatPoints(wallet.balance) })}
              </AppText>
            </View>
          )
        }
      />

      <View style={styles.tabs} accessibilityRole="tablist">
        {(['vouchers', 'cosmetics'] as const).map((k) => (
          <Pressable
            key={k}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === k }}
            onPress={() => setTab(k)}
            style={[styles.tab, tab === k && styles.tabOn]}
          >
            <AppText variant="bodyStrong" color={tab === k ? colors.navy : colors.textMuted}>
              {t(`shop.tab.${k}`)}
            </AppText>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        {tab === 'cosmetics' && (
          <Pressable accessibilityRole="button" onPress={() => router.push('/plus')} style={({ pressed }) => [styles.plusRow, pressed && styles.pressed]}>
            <Crown size={26} color={colors.plusText} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong" color={colors.text}>
                {wallet?.plusUntil ? t('plus.rowOn') : t('plus.row')}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {t('plus.rowBody')}
              </AppText>
            </View>
            <ChevronRight size={22} color={colors.textMuted} />
          </Pressable>
        )}

        {items === null && !failed && <ActivityIndicator color={colors.navy} style={styles.loading} />}
        {failed && (
          <View style={styles.empty}>
            <AppText color={colors.textMuted}>{t('shop.loadFailed')}</AppText>
            <Button kind="secondary" label={t('common.retry')} onPress={() => void load()} />
          </View>
        )}

        {list.map((item) => {
          const isVoucher = item.kind === 'voucher';
          const v = isVoucher ? voucherLook(item.id) : null;
          const has = ownedIds.has(item.id);
          const wearing = wallet?.frame === item.id || wallet?.badge === item.id;
          const label = isVoucher ? t('shop.redeem') : wearing ? t('shop.inUse') : has ? t('shop.use') : t('shop.get');
          return (
            <View key={item.id} style={styles.card}>
              <View style={[styles.stub, { backgroundColor: v?.soft ?? colors.surface }]}>
                {isVoucher ? (
                  <>
                    <AppText variant="title" color={v?.text ?? colors.navy}>
                      {`RM${v?.rm ?? ''}`}
                    </AppText>
                    <AppText variant="bodyStrong" color={v?.text ?? colors.navy}>
                      {t('shop.off')}
                    </AppText>
                  </>
                ) : (
                  <Avatar size={48} fill={colors.neutralBadge} frame={item.kind === 'frame' ? item.id : null} badge={item.kind === 'badge' ? item.id : null}>
                    <UserRound size={26} color={colors.textMuted} />
                  </Avatar>
                )}
              </View>
              <View style={styles.cardBody}>
                <AppText variant="heading" color={colors.navy}>
                  {name(item.id)}
                </AppText>
                <AppText color={colors.textMuted}>{itemText(t, item.id, 'detail')}</AppText>
                {isVoucher && partnerOf(item.id) && (
                  <AppText variant="caption" color={colors.textMuted}>
                    {partnerOf(item.id)?.address}
                  </AppText>
                )}
                <View style={styles.cardFoot}>
                  <AppText variant="heading" color={colors.safeText} style={styles.flex}>
                    {has && !isVoucher ? t('shop.owned') : t('shop.pts', { value: formatPoints(item.cost) })}
                  </AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${label}, ${name(item.id)}`}
                    accessibilityState={{ disabled: busy !== null, selected: wearing }}
                    disabled={busy !== null}
                    onPress={() => (isVoucher || !has ? buy(item) : void wear(item, !wearing))}
                    style={({ pressed }) => [styles.redeem, wearing && styles.redeemOn, pressed && styles.pressed]}
                  >
                    {busy === item.id ? (
                      <ActivityIndicator color={wearing ? colors.navy : colors.white} />
                    ) : (
                      <AppText variant="bodyStrong" color={wearing ? colors.navy : colors.white}>
                        {label}
                      </AppText>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })}

        {tab === 'cosmetics' && wallet?.plusUntil && (
          <PlusCosmetics wallet={wallet} busy={busy !== null} onWear={(slot, on) => {
            setBusy(slot);
            cosmeticUse(slot, on ? (slot === 'frame' ? 'plus_frame' : 'plus_badge') : null)
              .then(load)
              .catch(() => snackbar.show({ text: t('shop.error.network') }))
              .finally(() => setBusy(null));
          }} />
        )}

        {items !== null && (
          <AppText variant="caption" color={colors.textMuted} style={styles.note}>
            {tab === 'vouchers' ? t('shop.madeUp') : t('shop.cosmeticsNote')}
          </AppText>
        )}
      </ScrollView>

      <ScrimSheet visible={open !== null} onClose={() => setOpen(null)}>
        {open?.kind === 'low' && wallet && (
          <LowPointsBody
            need={open.need}
            adsLeft={wallet.adsLeft}
            checkinDay={wallet.checkin.day}
            onAd={() => {
              setOpen(null);
              router.push('/ad');
            }}
            onTopUp={() => {
              setOpen(null);
              void openTopUp();
            }}
            onClose={() => setOpen(null)}
          />
        )}
        {open?.kind === 'voucher' && <VoucherBody item={open.item} code={open.code} at={open.at} onClose={() => setOpen(null)} />}
      </ScrimSheet>

      <Snackbar message={snackbar.message} onHide={snackbar.hide} bottom={insets.bottom + spacing.md} />
    </View>
  );
}

// The gold frame and Plus badge, free while Plus is on.
function PlusCosmetics({ wallet, busy, onWear }: { wallet: Wallet; busy: boolean; onWear: (slot: 'frame' | 'badge', on: boolean) => void }) {
  const { t } = useTranslation();
  const rows = [
    { slot: 'frame' as const, id: 'plus_frame', on: wallet.frame === 'plus_frame' },
    { slot: 'badge' as const, id: 'plus_badge', on: wallet.badge === 'plus_badge' },
  ];
  return (
    <>
      {rows.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={[styles.stub, { backgroundColor: BADGES.plus_badge?.fill }]}>
            <Avatar size={48} fill={colors.neutralBadge} frame={r.slot === 'frame' ? r.id : null} badge={r.slot === 'badge' ? r.id : null}>
              <UserRound size={26} color={colors.textMuted} />
            </Avatar>
          </View>
          <View style={styles.cardBody}>
            <AppText variant="heading" color={colors.navy}>
              {itemText(t, r.id, 'name')}
            </AppText>
            <AppText color={colors.textMuted}>{itemText(t, r.id, 'detail')}</AppText>
            <View style={styles.cardFoot}>
              <AppText variant="heading" color={PLUS_GOLD} style={styles.flex}>
                {t('shop.withPlus')}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, selected: r.on }}
                disabled={busy}
                onPress={() => onWear(r.slot, !r.on)}
                style={({ pressed }) => [styles.redeem, r.on && styles.redeemOn, pressed && styles.pressed]}
              >
                <AppText variant="bodyStrong" color={r.on ? colors.navy : colors.white}>
                  {r.on ? t('shop.inUse') : t('shop.use')}
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  balance: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginRight: spacing.sm },
  tabs: {
    ...cappedContent,
    flexDirection: 'row',
    backgroundColor: colors.neutralBadge,
    borderRadius: radius.pill,
    padding: spacing.xs,
    marginHorizontal: spacing.md,
    alignSelf: 'center',
    width: 'auto',
  },
  tab: { flex: 1, minHeight: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.white },
  content: { ...cappedContent, padding: spacing.md, gap: spacing.md },
  plusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget + spacing.md,
    backgroundColor: colors.plusSoft,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  loading: { paddingVertical: spacing.lg },
  empty: { gap: spacing.sm },
  card: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  stub: { width: 104, alignItems: 'center', justifyContent: 'center', borderRightWidth: 2, borderRightColor: colors.border, borderStyle: 'dashed', padding: spacing.sm },
  cardBody: { flex: 1, padding: spacing.md, gap: 2 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  redeem: { minHeight: touchTarget, minWidth: 96, borderRadius: radius.pill, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  redeemOn: { backgroundColor: colors.white, borderWidth: 2, borderColor: colors.navy },
  note: { textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
