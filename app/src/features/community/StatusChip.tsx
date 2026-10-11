import { Check, CircleSlash, Clock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { ReportStatus } from '../../api/reports';
import { AppText } from '../../components/AppText';
import { colors, radius, spacing } from '../../theme/theme';

const LOOK = {
  pending: { Icon: Clock, bg: colors.neutralBadge, fg: colors.textMuted },
  active: { Icon: Check, bg: colors.safeSoft, fg: colors.safeText },
  expired: { Icon: CircleSlash, bg: colors.neutralBadge, fg: colors.textMuted },
} as const;

// Pending, Active or Expired, each with its own icon and word, never colour alone
// (guide Section 6.3, screen 7).
export function StatusChip({ status }: { status: ReportStatus }) {
  const { t } = useTranslation();
  const { Icon, bg, fg } = LOOK[status];
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Icon size={16} color={fg} strokeWidth={2.75} />
      <AppText variant="label" color={fg}>
        {t(`community.status.${status}`)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
  },
});
