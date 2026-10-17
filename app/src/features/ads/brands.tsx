import { ChevronUp, Hand } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Ellipse, Path, Polygon, Rect } from 'react-native-svg';

import type { AdBrand } from '../../api/points';
import { AppText } from '../../components/AppText';
import { radius, spacing, touchTarget } from '../../theme/theme';
import type { AdLook } from './AdFrame';

// The six parody ads (docs/revenue-plan.md "Mock ads"; docs/screens/Ad*.png). Each
// brand shows a different format Malaysian apps use. Made-up names, our own art,
// no real logos, and only Atkinson Hyperlegible Next (CLAUDE.md: one font).

export type AdBody = (props: { elapsed: number }) => ReactNode;
export type AdDef = { brand: AdBrand; name: string; look: AdLook; Body: AdBody; customHeader?: boolean };

// Tall, tight type stands in for each brand's display font.
const display = (size: number) => ({ fontSize: size, lineHeight: size * 1.05, fontWeight: '700' as const, letterSpacing: -0.5 });

// ---------------------------------------------------------------------------
// GFC: full-screen food photo, big price, "Order now".
// ---------------------------------------------------------------------------
function GfcBody() {
  const { t } = useTranslation();
  return (
    <View style={styles.fill}>
      <AppText color="#FFFFFF" style={display(56)}>
        GFC
      </AppText>
      <AppText color="#FFE7A8">{t('ads.gfc.tag')}</AppText>
      <View style={styles.art}>
        <Svg width="70%" height="100%" viewBox="0 0 220 200" accessibilityLabel={t('ads.gfc.art')}>
          <Circle cx="70" cy="50" r="34" fill="#C4711F" />
          <Circle cx="150" cy="50" r="34" fill="#C4711F" />
          <Circle cx="110" cy="38" r="40" fill="#E0973C" />
          <Path d="M20 70 L200 70 L180 200 L40 200 Z" fill="#FFFFFF" />
          <Path d="M52 70 L70 200 L88 200 L78 70 Z M118 70 L114 200 L132 200 L142 70 Z M168 70 L156 200 L172 200 L190 70 Z" fill="#B31229" />
          <Rect x="68" y="110" width="84" height="40" rx="8" fill="#B31229" />
        </Svg>
      </View>
      <AppText color="#FFFFFF" style={display(40)}>
        {t('ads.gfc.deal')}
      </AppText>
      <View style={styles.priceRow}>
        <AppText color="#FFD23F" style={display(64)}>
          RM24.90
        </AppText>
        <AppText color="#FFE7A8" style={styles.strike}>
          RM32.40
        </AppText>
      </View>
      <View style={[styles.cta, { backgroundColor: '#FFFFFF' }]}>
        <AppText variant="heading" color="#B31229">
          {t('ads.gfc.cta')}
        </AppText>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// McG: swipe carousel of 3 menu items.
// ---------------------------------------------------------------------------
function McgBody() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const cardW = Math.min(width - spacing.lg * 2 - 40, 420);
  const items = [
    { key: 'rendang', price: 'RM14.50', art: <Burger /> },
    { key: 'pie', price: 'RM4.50', art: <Pie /> },
    { key: 'teh', price: 'RM5.90', art: <Cup fill="#C98A4B" /> },
  ] as const;
  return (
    <View style={styles.fill}>
      <View style={styles.rowGap}>
        <View style={[styles.logo, { backgroundColor: '#D9261C' }]}>
          <AppText color="#FFC72C" style={display(26)}>
            McG
          </AppText>
        </View>
        <View>
          <AppText color="#3B2A00" style={display(28)}>
            {"McGuffin's"}
          </AppText>
          <AppText color="#3B2A00">{t('ads.mcg.tag')}</AppText>
        </View>
      </View>
      <AppText color="#B3261E" style={display(36)}>
        {t('ads.mcg.title')}
      </AppText>
      <ScrollView
        horizontal
        snapToInterval={cardW + spacing.md}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (cardW + spacing.md)))}
        style={styles.carousel}
        contentContainerStyle={{ gap: spacing.md }}
      >
        {items.map((it, i) => (
          <View key={it.key} style={[styles.menuCard, { width: cardW }]} accessible accessibilityLabel={`${t(`ads.mcg.${it.key}`)}, ${it.price}, ${i + 1} / 3`}>
            <View style={styles.art}>{it.art}</View>
            <AppText variant="heading" color="#2A1E00">
              {t(`ads.mcg.${it.key}`)}
            </AppText>
            <AppText color="#5A4300">{t(`ads.mcg.${it.key}Body`)}</AppText>
            <View style={styles.priceRow}>
              <AppText color="#D9261C" style={display(30)}>
                {it.price}
              </AppText>
              <View style={styles.counter}>
                <AppText variant="label" color="#2A1E00">
                  {t('ads.mcg.of', { n: i + 1 })}
                </AppText>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dotsRow}>
        {items.map((it, i) => (
          <View key={it.key} style={[styles.pageDot, i === page ? styles.pageDotOn : null]} />
        ))}
      </View>
      <View style={[styles.cta, { backgroundColor: '#D9261C' }]}>
        <AppText variant="heading" color="#FFFFFF">
          {t('ads.mcg.cta')}
        </AppText>
      </View>
    </View>
  );
}

function Burger() {
  return (
    <Svg width="80%" height="100%" viewBox="0 0 200 150">
      <Path d="M10 60 Q100 -20 190 60 Z" fill="#E7A23C" />
      <Rect x="4" y="62" width="192" height="14" rx="7" fill="#6AA83E" />
      <Rect x="12" y="78" width="176" height="22" rx="10" fill="#6B3A20" />
      <Polygon points="8,100 192,100 180,112 20,112" fill="#F6C343" />
      <Rect x="12" y="112" width="176" height="20" rx="10" fill="#6B3A20" />
      <Path d="M14 132 L186 132 Q186 150 168 150 L32 150 Q14 150 14 132 Z" fill="#E7A23C" />
    </Svg>
  );
}

function Pie() {
  return (
    <Svg width="70%" height="100%" viewBox="0 0 200 140">
      <Rect x="20" y="30" width="160" height="80" rx="18" fill="#D88A2B" />
      <Path d="M40 50 L160 50 M40 70 L160 70 M40 90 L160 90" stroke="#B8691A" strokeWidth="6" strokeLinecap="round" />
      <Ellipse cx="100" cy="122" rx="80" ry="8" fill="#E9B230" />
    </Svg>
  );
}

function Cup({ fill, milk }: { fill: string; milk?: boolean }) {
  return (
    <Svg width="60%" height="100%" viewBox="0 0 160 150">
      <Path d="M56 10 q-8 12 0 24 M80 10 q-8 12 0 24" stroke={milk ? '#F7E9D3' : '#8C6239'} strokeWidth="5" fill="none" strokeLinecap="round" />
      <Path d="M30 44 L130 44 L120 140 L40 140 Z" fill="#FFFFFF" stroke="#3B2314" strokeWidth="6" strokeLinejoin="round" />
      <Path d="M36 62 L124 62 L118 134 L42 134 Z" fill={fill} />
      <Path d="M128 66 q30 4 22 34 q-6 18 -26 16" stroke="#3B2314" strokeWidth="6" fill="none" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Tealove: vertical story with progress bars and a new-flavour reveal.
// ---------------------------------------------------------------------------
function TealoveBody({ elapsed }: { elapsed: number }) {
  const { t } = useTranslation();
  const seg = Math.min(2, Math.floor(elapsed / 10));
  const revealed = seg >= 1;
  return (
    <View style={[styles.fill, styles.centerItems]}>
      <View style={styles.newChip}>
        <AppText variant="bodyStrong" color="#1F3A00">
          {t('ads.tealove.new')}
        </AppText>
      </View>
      <AppText color="#FFFFFF" style={[display(40), styles.centerText]} accessibilityLiveRegion="polite">
        {revealed ? t('ads.tealove.flavour') : t('ads.tealove.teaser')}
      </AppText>
      <View style={styles.art}>
        <Svg width="70%" height="100%" viewBox="0 0 200 240">
          <Circle cx="100" cy="140" r="110" fill="#4A2775" />
          <Rect x="94" y="0" width="12" height="70" rx="6" fill="#B8F27C" transform="rotate(12 100 40)" />
          <Rect x="26" y="52" width="148" height="18" rx="9" fill="#FFFFFF" />
          <Path d="M36 70 L164 70 L150 230 Q148 238 140 238 L60 238 Q52 238 50 230 Z" fill={revealed ? '#DCE3D0' : '#6B4A93'} />
          {revealed && (
            <>
              <Path d="M42 120 L158 120 L150 230 Q148 238 140 238 L60 238 Q52 238 50 230 Z" fill="#7DBE4E" />
              <Path d="M44 140 Q100 120 156 140 L152 180 Q100 165 48 180 Z" fill="#8B4A1C" />
              <Circle cx="75" cy="205" r="11" fill="#2A160A" />
              <Circle cx="100" cy="215" r="11" fill="#2A160A" />
              <Circle cx="125" cy="203" r="11" fill="#2A160A" />
              <Circle cx="88" cy="190" r="10" fill="#2A160A" />
              <Circle cx="115" cy="188" r="10" fill="#2A160A" />
            </>
          )}
          {!revealed && <Path d="M86 140 q0 -20 14 -20 q14 0 14 14 q0 10 -14 16 l0 12 M100 180 l0 4" stroke="#FFFFFF" strokeWidth="8" fill="none" strokeLinecap="round" />}
        </Svg>
      </View>
      {seg >= 2 && (
        <AppText color="#FFFFFF" style={[display(28), styles.centerText]}>
          {t('ads.tealove.offer')}
        </AppText>
      )}
      <ChevronUp size={28} color="#FFFFFF" />
      <View style={[styles.cta, styles.stretch, { backgroundColor: '#FFFFFF' }]}>
        <AppText variant="heading" color="#2D1648">
          {t('ads.tealove.cta')}
        </AppText>
      </View>
    </View>
  );
}

export function TealoveHeader({ elapsed, clock }: { elapsed: number; clock: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.storyHead}>
      <View style={styles.storyBars}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.storyTrack}>
            <View style={[styles.storyFill, { width: `${Math.max(0, Math.min(1, (elapsed - i * 10) / 10)) * 100}%` }]} />
          </View>
        ))}
      </View>
      <View style={styles.rowGap}>
        <View style={styles.avatar}>
          <AppText variant="heading" color="#2D1648">
            t
          </AppText>
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong" color="#FFFFFF">
            tealove
          </AppText>
          <AppText variant="caption" color="#D9C8F0">
            {t('ads.storyLine', { clock })}
          </AppText>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ZAS kopi: tap to reveal a scratch-card style promo code.
// ---------------------------------------------------------------------------
const ZAS_CODE = 'ZASIPOH50';

function ZasBody() {
  const { t } = useTranslation();
  const [taps, setTaps] = useState(0);
  const [saved, setSaved] = useState(false);
  const shown = Math.min(ZAS_CODE.length, Math.round((taps / 4) * ZAS_CODE.length));
  const done = shown === ZAS_CODE.length;
  return (
    <View style={styles.fill}>
      <AppText color="#FFFFFF" style={display(52)}>
        ZAS<AppText color="#4FC3F7" style={display(52)}>.</AppText>kopi
      </AppText>
      <AppText color="#9DD3F5">{t('ads.zas.tag')}</AppText>
      <AppText color="#FFFFFF" style={[display(36), styles.gapTop]}>
        {t('ads.zas.title')}
      </AppText>
      <View style={styles.spacer} />
      <View style={styles.whiteCard}>
        <AppText variant="bodyStrong" color="#4B5563">
          {t('ads.zas.yourCode')}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={done ? `${t('ads.zas.yourCode')} ${ZAS_CODE.split('').join(' ')}` : t('ads.zas.tapHint')}
          disabled={done}
          onPress={() => setTaps((n) => n + 1)}
          style={styles.scratch}
        >
          <View style={[styles.scratchShown, { flex: Math.max(shown, 0.001) }]}>
            <AppText color="#0E2340" style={[display(30), styles.mono]} numberOfLines={1}>
              {ZAS_CODE.slice(0, shown)}
            </AppText>
          </View>
          {!done && (
            <View style={[styles.scratchHidden, { flex: ZAS_CODE.length - shown }]}>
              <Hand size={36} color="#FFFFFF" />
            </View>
          )}
        </Pressable>
        <AppText variant="heading" color="#0E2340" style={display(30)}>
          {t('ads.zas.offer')}
        </AppText>
        <AppText color="#4B5563">{done ? t('ads.zas.valid') : t('ads.zas.keep')}</AppText>
      </View>
      <View style={styles.spacer} />
      <Pressable
        accessibilityRole="button"
        disabled={!done}
        onPress={() => setSaved(true)}
        style={[styles.cta, styles.ctaSquare, { backgroundColor: '#4FC3F7' }, !done && styles.dim]}
      >
        <AppText variant="heading" color="#0E2340">
          {saved ? t('ads.zas.saved') : t('ads.zas.cta')}
        </AppText>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Secret Resipi: split poster, cake photo on top and a voucher coupon below.
// ---------------------------------------------------------------------------
function SecretBody() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  return (
    <View style={styles.fill}>
      <View style={styles.centerItems}>
        <AppText color="#8E1B2E" style={[display(26), styles.italic]}>
          Secret Resipi
        </AppText>
        <AppText color="#2E0F12" style={[display(44), styles.centerText]}>
          {t('ads.secret.title')}
        </AppText>
      </View>
      <View style={styles.art}>
        <Svg width="75%" height="100%" viewBox="0 0 240 170">
          <Ellipse cx="120" cy="158" rx="110" ry="12" fill="#EBC4BA" />
          <Polygon points="20,70 160,26 210,58 210,150 20,156" fill="#4A2216" />
          <Polygon points="20,70 160,26 210,58 20,86" fill="#2E120A" />
          <Polygon points="20,104 210,88 210,98 20,116" fill="#F0D5AE" />
          <Polygon points="20,134 210,120 210,130 20,146" fill="#F0D5AE" />
          <Circle cx="160" cy="34" r="14" fill="#C8102E" />
          <Path d="M160 20 q6 -14 20 -14" stroke="#3E7D2A" strokeWidth="4" fill="none" />
        </Svg>
      </View>
      <View style={styles.coupon}>
        <View style={styles.couponTop}>
          <AppText variant="bodyStrong" color="#7A1C2A">
            {t('ads.secret.voucher')}
          </AppText>
          <AppText color="#4B3B3B">{t('ads.secret.until')}</AppText>
        </View>
        <AppText color="#2E0F12" style={display(40)}>
          {t('ads.secret.off')}
        </AppText>
        <AppText color="#2E0F12">{t('ads.secret.body')}</AppText>
        <Pressable accessibilityRole="button" onPress={() => setSaved(true)} style={[styles.cta, { backgroundColor: '#7A1C2A' }]}>
          <AppText variant="heading" color="#FFFFFF">
            {saved ? t('ads.secret.saved') : t('ads.secret.cta')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// New Town Kopitiam: a one-question quiz, then the offer.
// ---------------------------------------------------------------------------
function NewTownBody() {
  const { t } = useTranslation();
  const [pick, setPick] = useState<'o' | 'c' | null>(null);
  return (
    <View style={styles.fill}>
      <View style={styles.signBoard}>
        <AppText color="#3B2314" style={[display(40), styles.centerText]}>
          NEW TOWN
        </AppText>
        <AppText variant="bodyStrong" color="#3B2314" style={[styles.centerText, styles.spaced]}>
          {t('ads.newtown.since')}
        </AppText>
      </View>
      <AppText variant="bodyStrong" color="#8B3A0F" style={[styles.centerText, styles.gapTop]}>
        {t('ads.newtown.quiz')}
      </AppText>
      <AppText color="#3B2314" style={[display(38), styles.centerText]}>
        {t('ads.newtown.question')}
      </AppText>
      <AppText color="#6B4A2E" style={styles.centerText}>
        {t('ads.newtown.hint')}
      </AppText>
      <View style={styles.spacer} />
      <View style={styles.choices} accessibilityRole="radiogroup">
        {(['o', 'c'] as const).map((k) => {
          const on = pick === k;
          const dark = k === 'c';
          return (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setPick(k)}
              style={[styles.choice, dark ? styles.choiceDark : styles.choiceLight, on && styles.choiceOn]}
            >
              <View style={styles.choiceArt}>
                <Cup fill={dark ? '#B07A4F' : '#2A160A'} milk={dark} />
              </View>
              <AppText color={dark ? '#FFFFFF' : '#2A160A'} style={display(26)}>
                {k === 'o' ? 'Kopi O' : 'Kopi C'}
              </AppText>
              <AppText color={dark ? '#FFFFFF' : '#2A160A'} style={styles.centerText}>
                {t(k === 'o' ? 'ads.newtown.o' : 'ads.newtown.c')}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.spacer} />
      <View style={styles.unlock} accessibilityLiveRegion="polite">
        <AppText color="#FFF5E1" style={styles.centerText}>
          <AppText variant="bodyStrong" color="#FFF5E1">
            {pick ? t('ads.newtown.unlocked') : t('ads.newtown.unlocks')}
          </AppText>{' '}
          {t('ads.newtown.deal')}
        </AppText>
      </View>
    </View>
  );
}

export const ADS: AdDef[] = [
  {
    brand: 'gfc',
    name: 'GFC',
    look: { background: '#B31229', text: '#FFE7A8', pill: '#6E0A18', pillText: '#FFFFFF', bar: '#FFD23F', track: '#7E0C1D' },
    Body: GfcBody,
  },
  {
    brand: 'mcg',
    name: "McGuffin's",
    look: { background: '#FFBC0D', text: '#3B2A00', pill: '#4A3500', pillText: '#FFFFFF', bar: '#D9261C', track: '#D99A00' },
    Body: McgBody,
  },
  {
    brand: 'tealove',
    name: 'tealove',
    look: { background: '#2D1648', text: '#D9C8F0', pill: '#4A3560', pillText: '#FFFFFF', bar: '#B8F27C', track: '#4A3560' },
    Body: TealoveBody,
    customHeader: true,
  },
  {
    brand: 'zas',
    name: 'ZAS kopi',
    look: { background: '#0E2340', text: '#9DD3F5', pill: '#22395A', pillText: '#FFFFFF', bar: '#4FC3F7', track: '#22395A' },
    Body: ZasBody,
  },
  {
    brand: 'secret',
    name: 'Secret Resipi',
    look: { background: '#FBE9E4', text: '#5A3B3B', pill: '#4E3236', pillText: '#FFFFFF', bar: '#7A1C2A', track: '#E7C9C2' },
    Body: SecretBody,
  },
  {
    brand: 'newtown',
    name: 'New Town Kopitiam',
    look: { background: '#F3E1BF', text: '#5A3B22', pill: '#3B2314', pillText: '#FFFFFF', bar: '#8B3A0F', track: '#DCC6A0' },
    Body: NewTownBody,
  },
];

const styles = StyleSheet.create({
  fill: { flex: 1, gap: spacing.sm, paddingTop: spacing.md },
  flex: { flex: 1 },
  art: { flex: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  strike: { textDecorationLine: 'line-through', marginBottom: spacing.sm },
  cta: { minHeight: touchTarget + spacing.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  ctaSquare: { borderRadius: radius.sheet },
  stretch: { alignSelf: 'stretch' },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: { width: 64, height: 64, borderRadius: radius.sheet, alignItems: 'center', justifyContent: 'center' },
  carousel: { flexGrow: 1, flexShrink: 1, marginRight: -spacing.lg },
  menuCard: { backgroundColor: '#FFFFFF', borderRadius: radius.sheet + 8, padding: spacing.lg, gap: spacing.xs },
  counter: { backgroundColor: '#FFF3C4', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: spacing.xs },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  pageDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#B78A00' },
  pageDotOn: { width: 28, backgroundColor: '#D9261C' },
  centerItems: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  newChip: { backgroundColor: '#B8F27C', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  storyHead: { flex: 1, gap: spacing.md },
  storyBars: { flexDirection: 'row', gap: spacing.sm },
  storyTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  storyFill: { height: 4, backgroundColor: '#FFFFFF' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E5D9F7', alignItems: 'center', justifyContent: 'center' },
  gapTop: { marginTop: spacing.md },
  spacer: { flex: 1 },
  whiteCard: { backgroundColor: '#FFFFFF', borderRadius: radius.sheet + 8, padding: spacing.lg, gap: spacing.md },
  scratch: { flexDirection: 'row', height: 96, borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#E1F3FC' },
  scratchShown: { alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: spacing.xs, backgroundColor: '#E1F3FC' },
  scratchHidden: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#9AA7BA' },
  mono: { letterSpacing: 3 },
  dim: { opacity: 0.5 },
  italic: { fontStyle: 'italic' },
  coupon: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.sheet + 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#C98A94',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  couponTop: { flexDirection: 'row', justifyContent: 'space-between' },
  signBoard: { backgroundColor: '#FFF5E1', borderWidth: 4, borderColor: '#3B2314', borderRadius: radius.sheet, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  spaced: { letterSpacing: 3 },
  choices: { flexDirection: 'row', gap: spacing.md },
  choice: { flex: 1, borderRadius: radius.sheet + 4, padding: spacing.md, alignItems: 'center', gap: spacing.xs, minHeight: 200 },
  choiceLight: { backgroundColor: '#FFF5E1', borderWidth: 4, borderColor: '#3B2314' },
  choiceDark: { backgroundColor: '#8B3A0F', borderWidth: 4, borderColor: '#8B3A0F' },
  choiceOn: { borderColor: '#E69F00' },
  choiceArt: { height: 100, width: '100%', alignItems: 'center' },
  unlock: { backgroundColor: '#3B2314', borderRadius: radius.card, padding: spacing.md },
});
