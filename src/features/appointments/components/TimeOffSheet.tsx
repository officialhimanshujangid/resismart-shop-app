import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { apiErrorCode, apiErrorMessage } from '../../../api/axios';
import { DateField } from '../../../components/DateField';
import { TimeField } from '../../../components/TimeField';
import { SectionLabel } from '../../more/ui';
import { Banner, PillButton } from '../../p1/ui';
import { ChoiceChips, Sheet } from '../../p2/ui';
import { istToday } from '../../p2/dates';
import { appointmentsApi, apptKeys } from '../api';
import { timeOffBody } from '../logic';
import type { CalendarStaff } from '../types';

/**
 * Add time off: who, from (day + time), to (day + time), why. When bookings
 * already sit in that time the server says how many (409
 * STAFF_TIME_OFF_OVERLAPS_BOOKINGS); "Save anyway" sends it again with
 * `confirmOverlaps` — the bookings stay and are moved one by one.
 */
export function TimeOffSheet({
  c, visible, onDismiss, staff, onSaved,
}: { c: ColorScheme; visible: boolean; onDismiss: () => void; staff: CalendarStaff[]; onSaved: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState<string>();
  const [fromDay, setFromDay] = useState(istToday());
  const [fromTime, setFromTime] = useState('10:00');
  const [toDay, setToDay] = useState(istToday());
  const [toTime, setToTime] = useState('18:00');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [overlap, setOverlap] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStaffId(staff.length === 1 ? staff[0].id : undefined);
    setFromDay(istToday()); setToDay(istToday()); setFromTime('10:00'); setToTime('18:00');
    setReason(''); setProblem(null); setOverlap(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only, not on every staff refetch
  }, [visible]);

  const save = useMutation({
    mutationFn: async (confirmOverlaps: boolean) => {
      const out = timeOffBody({ staffId, fromDay, fromTime, toDay, toTime, reason });
      if ('problem' in out) throw new Error(t(`p2.appointments.timeOff.problem.${out.problem}`));
      return appointmentsApi.addTimeOff({ ...out.body, ...(confirmOverlaps ? { confirmOverlaps: true } : {}) });
    },
    onMutate: () => setProblem(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apptKeys.all });
      onSaved();
    },
    onError: (e) => {
      setOverlap(apiErrorCode(e) === 'STAFF_TIME_OFF_OVERLAPS_BOOKINGS');
      setProblem(apiErrorMessage(e, t('p2.common.saveFailed')));
    },
  });
  // Any change after the warning is a new decision: ask again.
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setOverlap(false); };

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t('p2.appointments.timeOff.add')}
      testID="timeoff-sheet"
      footer={overlap ? (
        <PillButton c={c} tone="danger" label={t('p2.appointments.timeOff.saveAnyway')} onPress={() => save.mutate(true)} disabled={save.isPending} testID="timeoff-save-anyway" />
      ) : (
        <PillButton c={c} label={save.isPending ? t('common.saving') : t('common.save')} onPress={() => save.mutate(false)} disabled={save.isPending} testID="timeoff-save" />
      )}
    >
      <SectionLabel c={c}>{t('p2.appointments.timeOff.who')}</SectionLabel>
      <ChoiceChips c={c} options={staff.map((s) => ({ key: s.id, label: s.name }))} value={staffId ? [staffId] : []} onChange={(v) => edit(setStaffId)(v[0])} testID="timeoff-staff" />
      <View style={styles.pair}>
        <DateField label={t('p2.appointments.timeOff.fromDay')} value={fromDay} onChangeText={edit(setFromDay)} style={styles.half} />
        <TimeField label={t('p2.appointments.timeOff.fromTime')} value={fromTime} onChangeText={edit(setFromTime)} style={styles.half} />
      </View>
      <View style={styles.pair}>
        <DateField label={t('p2.appointments.timeOff.toDay')} value={toDay} onChangeText={edit(setToDay)} style={styles.half} />
        <TimeField label={t('p2.appointments.timeOff.toTime')} value={toTime} onChangeText={edit(setToTime)} style={styles.half} />
      </View>
      <TextInput
        mode="outlined"
        label={t('p2.appointments.timeOff.reason')}
        value={reason}
        onChangeText={(v) => setReason(v.slice(0, 120))}
        outlineStyle={{ borderRadius: radii.field }}
        testID="timeoff-reason"
      />
      {problem ? <Banner c={c} tone={overlap ? 'warn' : 'error'} body={problem} testID="timeoff-problem" /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  half: { flexGrow: 1, flexBasis: 140, minWidth: 0 },
});
