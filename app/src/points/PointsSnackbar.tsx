import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Snackbar, useSnackbar } from '../components/Snackbar';
import { categoryKey } from '../features/report/categoryIcons';
import { spacing } from '../theme/theme';
import { usePointsNotice, type PointsNotice } from './notice';

// Confirms points that arrive on their own, such as the daily check-in. A snackbar,
// so it never blocks the map (guide Section 5.3).
export function PointsSnackbar() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { message, show, hide } = useSnackbar();

  const onNotice = useCallback(
    (n: PointsNotice) => {
      if (n.kind === 'checkin') show({ text: t('points.checkinEarned', { count: n.points, day: n.day }) });
      else if (n.kind === 'text') show({ text: n.text });
      else {
        const what = t(categoryKey('improvement', n.category));
        const place = n.street ? t('notice.at', { what, street: n.street }) : what;
        const main =
          n.status === 'fixed'
            ? n.points > 0
              ? t('notice.fixedPoints', { what: place, count: n.points })
              : t('notice.fixed', { what: place })
            : t('notice.planned', { what: place });
        show({ text: n.more > 0 ? `${main} ${t('notice.more', { count: n.more })}` : main });
      }
    },
    [show, t],
  );
  usePointsNotice(onNotice);

  // Above the tab bar.
  return <Snackbar message={message} onHide={hide} bottom={insets.bottom + spacing.xxl * 2} />;
}
