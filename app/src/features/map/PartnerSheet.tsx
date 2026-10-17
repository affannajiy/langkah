import type { LngLat } from '@maplibre/maplibre-react-native';
import { Store, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { SponsoredPin } from '../../api/types';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { formatDistance, formatPoints } from '../../i18n/format';
import { metres } from '../../nav/geo';
import { offerText } from '../../points/partners';
import { colors, radius, spacing, touchTarget } from '../../theme/theme';
import { voucherLook } from '../points/catalog';

type Props = {
  pin: SponsoredPin | null; // null hides the sheet
  here: LngLat | null;
  onWalk: (pin: SponsoredPin) => void;
  onVoucher: (pin: SponsoredPin) => void;
  onClose: () => void;
};

// A tapped sponsored pin (guide Section 15.6): the shop, its offer and two choices.
// A bottom sheet over the browse map, never shown during a walk.
export function PartnerSheet({ pin, here, onWalk, onVoucher, onClose }: Props) {
  const { t } = useTranslation();
  // Keep the last shop while the sheet slides away.
  const [shown, setShown] = useState<SponsoredPin | null>(pin);
  if (pin && pin !== shown) setShown(pin);

  const look = shown ? voucherLook(shown.item) : null;
  return (
    <Sheet visible={pin !== null}>
      {shown && look && (
        <>
          <View style={styles.head}>
            <View style={[styles.icon, { backgroundColor: look.soft }]}>
              <Store size={26} color={look.text} />
            </View>
            <View style={styles.flex}>
              <View style={styles.tag}>
                <AppText variant="label" color={colors.white}>
                  {t('partner.tag')}
                </AppText>
              </View>
              <AppText variant="heading" color={colors.navy} accessibilityRole="header">
                {shown.name}
              </AppText>
              <AppText color={colors.textMuted}>
                {here ? `${shown.address} · ${t('partner.away', { distance: formatDistance(metres(here, shown.lngLat)) })}` : shown.address}
              </AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.close}>
              <X size={24} color={colors.navy} />
            </Pressable>
          </View>
          <AppText variant="bodyStrong" color={look.text}>
            {t('partner.offer', { rm: shown.rm, offer: offerText(shown.offer) })}
          </AppText>
          <View style={styles.buttons}>
            <Button label={t('partner.voucher', { cost: formatPoints(shown.cost) })} onPress={() => onVoucher(shown)} />
            <Button kind="secondary" label={t('partner.walk')} onPress={() => onWalk(shown)} />
          </View>
          <AppText variant="caption" color={colors.textMuted}>
            {t('partner.why')}
          </AppText>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: 52, height: 52, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  tag: { alignSelf: 'flex-start', backgroundColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: spacing.sm, marginBottom: 2 },
  close: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: -spacing.sm, marginRight: -spacing.sm },
  buttons: { gap: spacing.sm },
});
