import React, { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { Banner, PillButton } from '../../p1/ui';
import { ChoiceChips, Sheet } from '../../p2/ui';
import {
  BillingDraft, LineDraft, ScheduleDraft, billingToDraft, draftToBilling, draftToLines, draftToSchedule, emptyLine,
  lineToDraft, scheduleToDraft,
} from '../logic';
import { Plan, PlanBody, SUBSCRIPTION_KINDS, SubscriptionKind } from '../types';
import { LinesEditor } from './LinesEditor';
import { ScheduleEditor } from './ScheduleEditor';
import { BillingEditor } from './BillingEditor';

/** Add or change a plan: name, kind, lines, billing, the usual days, and whether it is offered. */
export function PlanSheet({
  visible, plan, onDismiss, submitting, error, onSubmit,
}: {
  visible: boolean; plan: Plan | null; onDismiss: () => void; submitting: boolean; error?: string | null;
  onSubmit: (body: PlanBody) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SubscriptionKind>('DAIRY');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine([])]);
  const [schedule, setSchedule] = useState<ScheduleDraft>({ pattern: 'DAILY', weekdays: [] });
  const [billing, setBilling] = useState<BillingDraft>({ mode: 'PER_DELIVERY', fee: '' });
  const [active, setActive] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(plan?.name ?? '');
    setKind(plan?.kind ?? 'DAIRY');
    setLines(plan?.lines?.length ? plan.lines.map(lineToDraft) : [emptyLine([])]);
    setSchedule(scheduleToDraft(plan?.defaultSchedule));
    setBilling(billingToDraft(plan?.billing));
    setActive(plan?.isActive ?? true);
    setProblem(null);
  }, [visible, plan]);

  const save = () => {
    if (name.trim().length < 2) { setProblem(t('p2.subscriptions.plans.nameNeeded')); return; }
    const l = draftToLines(lines, plan?.lines ?? []);
    if (l.problem !== null) { setProblem(t(`p2.subscriptions.new.problem.${l.problem}`)); return; }
    const s = draftToSchedule(schedule);
    if (!s) { setProblem(t('p2.subscriptions.new.problem.SCHEDULE')); return; }
    const b = draftToBilling(billing);
    if (!b) { setProblem(t('p2.subscriptions.new.problem.FEE')); return; }
    setProblem(null);
    onSubmit({ name: name.trim(), kind, lines: l.lines, billing: b, defaultSchedule: s, isActive: active });
  };

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={plan ? t('p2.subscriptions.plans.edit') : t('p2.subscriptions.plans.add')}
      testID="plan-sheet"
      footer={<PillButton c={c} icon="content-save" label={submitting ? t('common.saving') : t('common.save')} onPress={save} disabled={submitting} testID="plan-save" />}
    >
      <AppInput label={t('p2.subscriptions.plans.name')} value={name} onChangeText={(v) => setName(v.slice(0, 80))} />
      <ChoiceChips<SubscriptionKind>
        c={c}
        options={SUBSCRIPTION_KINDS.map((k) => ({ key: k, label: t(`p2.subscriptions.kind.${k}`) }))}
        value={[kind]}
        onChange={(v) => setKind(v[0] ?? 'DAIRY')}
      />
      <LinesEditor c={c} lines={lines} onChange={setLines} />
      <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>{t('p2.subscriptions.new.days')}</Text>
      <ScheduleEditor c={c} value={schedule} onChange={setSchedule} />
      <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>{t('p2.subscriptions.new.billing')}</Text>
      <BillingEditor c={c} value={billing} onChange={setBilling} />
      <View style={styles.switchRow}>
        <Text style={{ flex: 1, minWidth: 0, color: c.textPrimary }}>{t('p2.subscriptions.plans.offered')}</Text>
        <Switch value={active} onValueChange={setActive} accessibilityLabel={t('p2.subscriptions.plans.offered')} />
      </View>
      {problem ? <Banner c={c} tone="error" body={problem} /> : null}
      {error ? <Banner c={c} tone="error" body={error} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
});
