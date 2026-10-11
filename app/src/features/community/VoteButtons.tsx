import { ArrowUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { CommunityReport, Vote } from '../../api/reports';
import { AppText } from '../../components/AppText';
import { colors, radius, spacing, touchTarget } from '../../theme/theme';

type Props = {
  report: CommunityReport;
  busy: boolean;
  onVote: (vote: Vote) => void;
  wide?: boolean; // the big featured card: "23 · You agreed"
};

// Improvements: one pink upvote per user. Tapping again takes it back.
export function UpvoteButton({ report, busy, onVote, wide }: Props) {
  const { t } = useTranslation();
  const on = report.myVote === 'upvote';
  const label = wide && on ? t('community.upvotesYou', { count: report.upvotes }) : String(report.upvotes);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, busy }}
      accessibilityLabel={t('community.upvoteA11y', { count: report.upvotes })}
      accessibilityHint={on ? t('community.upvoteUndoHint') : t('community.upvoteHint')}
      disabled={busy || report.mine}
      onPress={() => onVote('upvote')}
      style={({ pressed }) => [styles.up, on && styles.upOn, wide && styles.upWide, pressed && styles.pressed]}
    >
      {busy ? (
        <ActivityIndicator color={on ? colors.text : colors.communityText} />
      ) : (
        <ArrowUp size={22} color={on ? colors.text : colors.communityText} strokeWidth={2.75} />
      )}
      <AppText variant="bodyStrong" color={on ? colors.text : colors.communityText}>
        {label}
      </AppText>
    </Pressable>
  );
}

// Hazards: Still there / Gone, the same answers as the walking banner.
export function HazardVotes({ report, busy, onVote }: Props) {
  const { t } = useTranslation();
  if (report.mine) {
    return (
      <AppText variant="caption" color={colors.textMuted}>
        {t('community.yourReport')}
      </AppText>
    );
  }
  return (
    <View style={styles.row}>
      {(['confirm', 'gone'] as const).map((v) => {
        const on = report.myVote === v;
        return (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityState={{ selected: on, busy }}
            disabled={busy}
            onPress={() => onVote(v)}
            style={({ pressed }) => [styles.answer, on && styles.answerOn, pressed && styles.pressed]}
          >
            <AppText variant="bodyStrong" color={on ? colors.white : colors.navy}>
              {v === 'confirm'
                ? t('community.stillThere', { count: report.confirms })
                : t('community.gone', { count: report.gone })}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  up: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: touchTarget + spacing.sm,
    minWidth: 88,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.community,
    backgroundColor: colors.white,
  },
  // Pink fill with dark text, as in Community.png (white on this pink is under 4.5:1).
  upOn: { backgroundColor: colors.community, borderColor: colors.community },
  upWide: { paddingHorizontal: spacing.lg },
  answer: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  answerOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  pressed: { opacity: 0.85 },
});
