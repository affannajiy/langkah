import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Snackbar, useSnackbar } from '../components/Snackbar';
import { spacing } from '../theme/theme';
import { usePointsNotice, type PointsNotice } from './notice';

// Confirms points that arrive on their own, such as the daily check-in. A snackbar,
// so it never blocks the map (guide Section 5.3).
export function PointsSnackbar() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { message, show, hide } = useSnackbar();

  const onNotice = useCallback(
    (n: PointsNotice) =>
      show({ text: n.kind === 'checkin' ? t('points.checkinEarned', { count: n.points, day: n.day }) : n.text }),
    [show, t],
  );
  usePointsNotice(onNotice);

  // Above the tab bar.
  return <Snackbar message={message} onHide={hide} bottom={insets.bottom + spacing.xxl * 2} />;
}
