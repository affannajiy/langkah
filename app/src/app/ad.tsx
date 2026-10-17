import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { adFinish, pointsErrorCode } from '../api/points';
import { AD_SECONDS, AdFrame } from '../features/ads/AdFrame';
import { ADS, TealoveHeader } from '../features/ads/brands';
import { notifyPoints } from '../points/notice';

const NEXT_KEY = 'langkah.adNext.v1';
const TICK_MS = 250;

type Result = { status: 'waiting' } | { status: 'paid'; points: number } | { status: 'none'; why: string };

// A 30 s mock ad (docs/revenue-plan.md "Mock ads"). Opened only from the wallet,
// never during a walk. +20 points when it ends, 5 a day (the server counts).
// The brands take turns, so a demo of 5 ads shows 5 formats.
export default function AdScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result>({ status: 'waiting' });
  const finished = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(NEXT_KEY)
      .catch(() => null)
      .then((raw) => {
        const i = (Number(raw) || 0) % ADS.length;
        setIndex(i);
        AsyncStorage.setItem(NEXT_KEY, String((i + 1) % ADS.length)).catch(() => undefined);
      });
  }, []);

  useEffect(() => {
    if (index === null) return;
    const timer = setInterval(() => setElapsed((e) => Math.min(AD_SECONDS, e + TICK_MS / 1000)), TICK_MS);
    return () => clearInterval(timer);
  }, [index]);

  const ad = index === null ? null : ADS[index];

  useEffect(() => {
    if (!ad || elapsed < AD_SECONDS || finished.current) return;
    finished.current = true;
    adFinish(ad.brand)
      .then((r) => {
        if (r.points > 0) {
          setResult({ status: 'paid', points: r.points });
          notifyPoints({ kind: 'text', text: t('ads.earned', { count: r.points }) });
        } else setResult({ status: 'none', why: t('ads.capped') });
      })
      .catch((e: unknown) => {
        console.warn('ad_finish failed', e);
        setResult({ status: 'none', why: t(pointsErrorCode(e) === 'network' ? 'ads.offline' : 'ads.capped') });
      });
  }, [ad, elapsed, t]);

  // Leaving early is always allowed (Android back); it just pays nothing.
  const leave = useCallback(() => {
    if (!finished.current) notifyPoints({ kind: 'text', text: t('ads.early') });
    router.back();
  }, [router, t]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        leave();
        return true;
      });
      return () => sub.remove();
    }, [leave]),
  );

  if (!ad) return <View style={{ flex: 1, backgroundColor: '#000000' }} />;

  const left = AD_SECONDS - elapsed;
  const done = elapsed >= AD_SECONDS;
  const clock = `0:${String(Math.max(0, Math.ceil(left))).padStart(2, '0')}`;
  const footer = !done
    ? t('ads.footer')
    : result.status === 'paid'
      ? t('ads.paid', { count: result.points })
      : result.status === 'none'
        ? result.why
        : t('ads.checking');
  const Body = ad.Body;

  return (
    <AdFrame
      look={ad.look}
      left={left}
      closable={done}
      footer={footer}
      onClose={() => router.back()}
      top={insets.top}
      bottom={insets.bottom}
      header={ad.customHeader ? <TealoveHeader elapsed={elapsed} clock={clock} /> : undefined}
    >
      <Body elapsed={elapsed} />
    </AdFrame>
  );
}
