import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../constants/colors';
import { DateField } from '../../../components/DateField';
import { Banner, PillButton } from '../../p1/ui';
import { Sheet } from '../../p2/ui';
import { istToday } from '../../p2/dates';
import {
  BillingDraft, LineDraft, ScheduleDraft, billingToDraft, buildReviseBody, lineToDraft, scheduleToDraft,
} from '../logic';
import type { Revision, ReviseBody } from '../types';
import { LinesEditor } from './LinesEditor';
import { ScheduleEditor } from './ScheduleEditor';
import { BillingEditor } from './BillingEditor';

/**
 * "Change": new items / days / billing from a day on. Only what changed is
 * sent. A day inside a month already billed is refused by the server
 * (409 SUBSCRIPTION_PERIOD_BILLED names the month and the bill).
 */
export function ReviseSheet({
  visible, current, onDismiss, submitting, error, onSubmit,
}: {
  visible: boolean; current: Revision | undefined; onDismiss: () => void; submitting: boolean; error?: string | null;
  onSubmit: (body: ReviseBody) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [from, setFrom] = useState(istToday());
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDraft>({ pattern: 'DAILY', weekdays: [] });
  const [billing, setBilling] = useState<BillingDraft>({ mode: 'PER_DELIVERY', fee: '' });
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFrom(istToday());
    setLines((current?.lines ?? []).map(lineToDraft));
    setSchedule(scheduleToDraft(current?.schedule));
    setBilling(billingToDraft(current?.billing));
    setProblem(null);
  }, [visible, current]);

  const save = () => {
    const r = buildReviseBody(current, { effectiveFrom: from, lines, schedule, billing });
    if (r.problem !== null) { setProblem(t(`p2.subscriptions.revise.problem.${r.problem}`)); return; }
    setProblem(null);
    onSubmit(r.body);
  };

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t('p2.subscriptions.revise.title')}
      testID="revise-sheet"
      footer={<PillButton c={c} icon="content-save" label={submitting ? t('common.saving') : t('common.save')} onPress={save} disabled={submitting} testID="revise-save" />}
    >
      <DateField label={t('p2.subscriptions.revise.from')} value={from} onChangeText={setFrom} />
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.subscriptions.revise.fromHelp')}</Text>
      <LinesEditor c={c} lines={lines} onChange={setLines} />
      <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>{t('p2.subscriptions.new.days')}</Text>
      <ScheduleEditor c={c} value={schedule} onChange={setSchedule} />
      <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>{t('p2.subscriptions.new.billing')}</Text>
      <BillingEditor c={c} value={billing} onChange={setBilling} />
      {problem ? <Banner c={c} tone="error" body={problem} testID="revise-problem" /> : null}
      {error ? <Banner c={c} tone="error" body={error} testID="revise-error" /> : null}
    </Sheet>
  );
}
