import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import type { CommunityReport, Vote } from '../../api/reports';
import { AppText } from '../../components/AppText';
import { formatDistance, timeAgo } from '../../i18n/format';
import { colors, radius, spacing } from '../../theme/theme';
import { categoryIcon, categoryKey } from '../report/categoryIcons';
import { CouncilChip, StatusChip } from './StatusChip';
import { HazardVotes, UpvoteButton } from './VoteButtons';

type Props = {
  report: CommunityReport;
  busy: boolean;
  onOpen: (r: CommunityReport) => void;
  onVote: (r: CommunityReport, vote: Vote) => void;
  first?: boolean;
  last?: boolean;
};

// "Jalan Sultan Yussuf · 350 m · photo from a walker" (docs/screens/Community.png).
export function useSubtitle(r: CommunityReport, withPhotoNote = false): string {
  const { t } = useTranslation();
  return [
    r.street ?? t('community.noStreet'),
    r.distM != null ? formatDistance(r.distM) : null,
    withPhotoNote ? (r.photoUrl ? t('community.photoFromWalker') : t('community.noPhotoYet')) : timeAgo(r.createdAt),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function Thumb({ r }: { r: CommunityReport }) {
  const Icon = categoryIcon(r.kind, r.category);
  if (r.photoUrl) {
    return <Image source={{ uri: r.photoUrl }} style={styles.thumb} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[styles.thumb, styles.thumbIcon, { backgroundColor: r.kind === 'hazard' ? colors.hazardSoft : colors.communitySoft }]}>
      {/* categoryIcon returns a fixed icon component, so nothing remounts. */}
      {/* eslint-disable-next-line react-hooks/static-components */}
      <Icon size={30} color={colors.navy} />
    </View>
  );
}

// One report in a grouped list card. Tapping it opens the detail sheet.
export const ReportRow = memo(function ReportRow({ report: r, busy, onOpen, onVote, first, last }: Props) {
  const { t } = useTranslation();
  const subtitle = useSubtitle(r);
  const title = t(categoryKey(r.kind, r.category));
  return (
    <View style={[styles.row, first && styles.first, last && styles.last, !last && styles.divider]}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t('community.openHint')}
        onPress={() => onOpen(r)}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <Thumb r={r} />
        <View style={styles.flex}>
          <AppText variant="heading" color={colors.text} numberOfLines={2}>
            {title}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} numberOfLines={2}>
            {subtitle}
          </AppText>
          {/* Hazards always show their state (routing uses only active ones); improvements only when pending. */}
          {(r.kind === 'hazard' || r.status === 'pending') && <StatusChip status={r.status} />}
          <CouncilChip status={r.councilStatus} />
        </View>
        {r.kind === 'improvement' && <UpvoteButton report={r} busy={busy} onVote={(v) => onVote(r, v)} />}
      </Pressable>
      {r.kind === 'hazard' && (
        <View style={styles.answers}>
          <HazardVotes report={r} busy={busy} onVote={(v) => onVote(r, v)} />
        </View>
      )}
    </View>
  );
});

// The top improvement with a photo, shown big (docs/screens/Community.png).
export function FeaturedCard({ report: r, busy, onOpen, onVote }: Omit<Props, 'first' | 'last'>) {
  const { t } = useTranslation();
  const subtitle = useSubtitle(r, true);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('community.openHint')}
      onPress={() => onOpen(r)}
      style={({ pressed }) => [styles.featured, pressed && styles.pressed]}
    >
      {r.photoUrl && <Image source={{ uri: r.photoUrl }} style={styles.hero} accessibilityIgnoresInvertColors />}
      <View style={styles.featuredBody}>
        <AppText variant="heading" color={colors.text}>
          {t(categoryKey(r.kind, r.category))}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {subtitle}
        </AppText>
        <View style={styles.featuredRow}>
          {r.councilStatus === 'open' ? <StatusChip status={r.status} /> : <CouncilChip status={r.councilStatus} />}
          <UpvoteButton report={r} busy={busy} onVote={(v) => onVote(r, v)} wide />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.white, paddingHorizontal: spacing.md, borderColor: colors.border, borderLeftWidth: 1, borderRightWidth: 1 },
  first: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, borderTopWidth: 1, paddingTop: spacing.xs },
  last: { borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card, borderBottomWidth: 1, paddingBottom: spacing.xs },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  main: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
  pressed: { opacity: 0.85 },
  thumb: { width: 72, height: 72, borderRadius: radius.card, backgroundColor: colors.surface },
  thumbIcon: { alignItems: 'center', justifyContent: 'center' },
  answers: { paddingBottom: spacing.md },
  featured: {
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  // 4:3 like the camera shots, so the height follows the screen width.
  hero: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surface },
  featuredBody: { padding: spacing.md, gap: spacing.xs },
  featuredRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
});
