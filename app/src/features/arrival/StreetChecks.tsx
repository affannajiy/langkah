import { Check, Lightbulb, Route as RouteIcon, Umbrella, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { streetAnswer } from '../../api/streets';
import type { StreetQuest } from '../../api/types';
import { AppText } from '../../components/AppText';
import { colors, radius, spacing, touchTarget } from '../../theme/theme';

type Choice = { key: string; value: 'yes' | 'no' | null }; // null: Not sure, never sent

const CHOICES: Record<StreetQuest['attr'], Choice[]> = {
  sidewalk: [
    { key: 'both', value: 'yes' },
    { key: 'one', value: 'yes' },
    { key: 'none', value: 'no' },
    { key: 'unsure', value: null },
  ],
  lit: [
    { key: 'yes', value: 'yes' },
    { key: 'no', value: 'no' },
    { key: 'unsure', value: null },
  ],
  covered: [
    { key: 'yes', value: 'yes' },
    { key: 'no', value: 'no' },
    { key: 'unsure', value: null },
  ],
};

const ICONS: Record<StreetQuest['attr'], LucideIcon> = { sidewalk: RouteIcon, lit: Lightbulb, covered: Umbrella };

type State = { picked: string; status: 'sending' | 'saved' | 'agreed' | 'skipped' | 'failed' };

// Map-the-gaps (guide Section 16.6): up to 3 quick questions about streets on the
// walk just finished. One tap answers; nothing blocks Done. Answers count once two
// walkers agree.
export function StreetChecks({ quests }: { quests: StreetQuest[] }) {
  const { t } = useTranslation();
  const [states, setStates] = useState<Record<number, State>>({});

  const answer = (i: number, q: StreetQuest, c: Choice) => {
    if (states[i] && states[i].status !== 'failed') return;
    if (c.value === null) {
      setStates((s) => ({ ...s, [i]: { picked: c.key, status: 'skipped' } }));
      return;
    }
    setStates((s) => ({ ...s, [i]: { picked: c.key, status: 'sending' } }));
    streetAnswer(q, c.value)
      .then((r) => setStates((s) => ({ ...s, [i]: { picked: c.key, status: r.agreed ? 'agreed' : 'saved' } })))
      .catch((error: unknown) => {
        console.warn('Street answer failed', error);
        setStates((s) => ({ ...s, [i]: { picked: c.key, status: 'failed' } }));
      });
  };

  return (
    <View style={styles.card}>
      <AppText variant="heading" color={colors.navy} accessibilityRole="header">
        {t('quest.title')}
      </AppText>
      <AppText variant="caption" color={colors.textMuted}>
        {t('quest.body')}
      </AppText>
      {quests.map((q, i) => {
        const st = states[i];
        const Icon = ICONS[q.attr];
        const question = t(`quest.q.${q.attr}`, { street: q.name });
        return (
          <View key={`${q.attr}:${q.ways.join(',')}`} style={styles.quest}>
            <View style={styles.qRow}>
              <Icon size={20} color={colors.interactiveText} />
              <AppText variant="bodyStrong" color={colors.text} style={styles.flex}>
                {question}
              </AppText>
            </View>
            <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={question}>
              {CHOICES[q.attr].map((c) => {
                const on = st?.picked === c.key;
                const locked = !!st && st.status !== 'failed';
                return (
                  <Pressable
                    key={c.key}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, disabled: locked && !on }}
                    onPress={() => answer(i, q, c)}
                    style={({ pressed }) => [styles.choice, on && styles.choiceOn, locked && !on && styles.dim, pressed && styles.pressed]}
                  >
                    {on && <Check size={16} color={colors.safeText} strokeWidth={2.75} />}
                    <AppText variant="label" color={on ? colors.safeText : colors.navy}>
                      {t(`quest.a.${q.attr}.${c.key}` as 'quest.a.lit.yes')}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {st && st.status !== 'sending' && (
              <AppText variant="caption" color={st.status === 'failed' ? colors.hazardText : colors.textMuted} accessibilityLiveRegion="polite">
                {t(`quest.${st.status}`)}
              </AppText>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  quest: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  qRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  choiceOn: { backgroundColor: colors.safeSoft, borderColor: colors.safe },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
