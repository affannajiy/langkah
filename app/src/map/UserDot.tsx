import { Marker, type LngLat } from '@maplibre/maplibre-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { colors } from '../theme/theme';

// The user's blue dot, drawn from the same position the app routes from (useHere).
// MapLibre's own UserLocation waits for its own location updates and could stay
// hidden while the app already had a position.
export function UserDot({ at }: { at: LngLat }) {
  const { t } = useTranslation();
  return (
    <Marker lngLat={at} anchor="center">
      <View accessible accessibilityLabel={t('pin.you')} style={styles.halo}>
        <View style={styles.dot} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  halo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.userHalo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.userDot,
    borderWidth: 3,
    borderColor: colors.white,
  },
});
