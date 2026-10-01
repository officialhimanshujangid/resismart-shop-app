import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { newIdempotencyKey } from '../../../lib/idempotency';
import { TimeField } from '../../../components/TimeField';
import { listAssignableStaff } from '../../bookings/booking.api';
import { PillButton } from '../../p1/ui';
import { ChoiceChips, DayStepper, Sheet } from '../../p2/ui';
import { istInstant, istToday } from '../../p2/dates';
import { jobsApi } from '../api';
import type { JobVisitResult } from '../types';

const QUICK_TIMES = ['09:00', '10:00', '11:00', '12:00', '14:00', '16:00', '18:00'];

/**
 * "Add visit": a follow-up booking on the same service, flat and address
 * (ACCEPTED on creation, counts toward the monthly bookings). Day, time,
 * optionally who goes, a note. The key is minted on the tap and kept for a
 * retry of the same visit.
 */
export function AddVisitSheet({
  c, jobId, visible, onDismiss, onDone,
}: { c: ColorScheme; jobId: string; visible: boolean; onDismiss: () => void; onDone: (r: JobVisitResult) => void }) {
  const { t } = useTranslation();
  const [day, setDay] = useState(istToday());
  const [time, setTime] = useState('');
  const [staffId, setStaffId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDay(istToday()); setTime(''); setStaffId(''); setNote(''); setError(null); keyRef.current = null;
  }, [visible]);

  const staff = useQuery({ queryKey: ['p2', 'jobs', 'staff'], queryFn: listAssignableStaff, enabled: visible, staleTime: 60_000 });
  const staffRows = Array.isArray(staff.data) ? staff.data : [];

  const submit = async () => {
    if (!/^\d{2}:\d{2}$/.test(time)) { setError(t('p2.jobs.visit.needTime')); return; }
    const body = {
      slotStart: istInstant(day, time),
      ...(staffId ? { staffId } : {}),
      ...(note.trim() ? { note: note.trim().slice(0, 500) } : {}),
    };
    const sig = JSON.stringify(body);
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: newIdempotencyKey('job-visit') };
    setBusy(true);
    setError(null);
    try {
      onDone(await jobsApi.visit(jobId, body, keyRef.current.key));
    } catch (e) {
      setError(apiErrorMessage(e, t('p2.jobs.visit.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t('p2.jobs.actions.addVisit')}
      testID="job-visit-sheet"
      footer={<PillButton c={c} icon="calendar-plus" label={t('p2.jobs.actions.addVisit')} onPress={submit} disabled={busy} testID="job-visit-save" />}
    >
      <DayStepper c={c} day={day} onChange={setDay} min={istToday()} />
      <ChoiceChips c={c} options={QUICK_TIMES.map((x) => ({ key: x, label: x }))} value={[time]} onChange={(v) => setTime(v[0] ?? '')} testID="job-visit-times" />
      <TimeField label={t('p2.jobs.visit.time')} value={time} onChangeText={setTime} />
      {staffRows.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.jobs.visit.who')}</Text>
          <ChoiceChips
            c={c}
            options={[{ key: '', label: t('p2.jobs.visit.anyone') }, ...staffRows.map((s) => ({ key: s.id, label: s.name }))]}
            value={[staffId]}
            onChange={(v) => setStaffId(v[0] ?? '')}
          />
        </View>
      ) : null}
      <TextInput
        mode="outlined"
        label={t('p2.common.note')}
        value={note}
        onChangeText={(v) => setNote(v.slice(0, 500))}
        outlineStyle={{ borderRadius: radii.field }}
        style={{ backgroundColor: 'transparent' }}
      />
      {error ? <Text style={{ color: c.error }} testID="job-visit-error">{error}</Text> : null}
    </Sheet>
  );
}
