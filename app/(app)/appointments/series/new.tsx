import React, { useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import Animated from 'react-native-reanimated';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../../src/constants/colors';
import { apiErrorMessage } from '../../../../src/api/axios';
import { newIdempotencyKey } from '../../../../src/lib/idempotency';
import { DateField } from '../../../../src/components/DateField';
import { TimeField } from '../../../../src/components/TimeField';
import { SuccessCheck, useShake } from '../../../../src/components/ui/Feedback'; // M22
import { Card, Screen, SectionLabel } from '../../../../src/features/more/ui';
import { ActionRow, Banner, PillButton, Stepper } from '../../../../src/features/p1/ui';
import { ChoiceChips, PartyPicker, PickedParty } from '../../../../src/features/p2/ui';
import { istToday, shortDay } from '../../../../src/features/p2/dates';
import {
  appointmentsApi, apptKeys, useApptAvailability, useApptServices, useApptStaff,
} from '../../../../src/features/appointments/api';
import { bookableStaff, gridSlots, SERIES_MAX_VISITS, seriesBody } from '../../../../src/features/appointments/logic';
import { ServiceFields, defaultModeOf } from '../../../../src/features/appointments/components/ServiceFields';
import type { SeriesCreated } from '../../../../src/features/appointments/types';
import type { ServiceMode } from '../../../../src/features/services/types';

/**
 * A repeating appointment: the customer, the service, 1–3 weekdays, a time on
 * the grid, every 1–4 weeks from a start day, ending on a date OR after a
 * number of visits (2–52) — exactly one. The server books what it can and
 * lists the dates it skipped, with why.
 */
export default function SeriesNewScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const qc = useQueryClient();
  const [party, setParty] = useState<PickedParty | null>(null);
  const [serviceId, setServiceId] = useState<string>();
  const [mode, setMode] = useState<ServiceMode>();
  const [address, setAddress] = useState('');
  const [staffId, setStaffId] = useState<string>();
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [time, setTime] = useState<string>();
  const [interval, setInterval_] = useState(1);
  const [startDate, setStartDate] = useState(istToday());
  const [endBy, setEndBy] = useState<'DATE' | 'COUNT'>('COUNT');
  const [endDate, setEndDate] = useState('');
  const [count, setCount] = useState(8);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<SeriesCreated | null>(null);
  const key = useRef<{ sig: string; key: string } | null>(null);

  const services = useApptServices();
  const availability = useApptAvailability();
  const staff = useApptStaff();
  const service = (services.data ?? []).find((s) => s._id === serviceId);
  const grid = gridSlots(availability.data, startDate, service?.durationMin);

  const save = useMutation({
    mutationFn: async () => {
      const out = seriesBody({
        partyId: party?.id, serviceId, mode, staffId, addressLine1: address, weekdays, time, interval, startDate,
        endBy, endDate, count,
      });
      if ('problem' in out) throw new Error(t(`p2.appointments.series.problem.${out.problem}`, { max: SERIES_MAX_VISITS }));
      const sig = JSON.stringify(out.body);
      if (!key.current || key.current.sig !== sig) key.current = { sig, key: newIdempotencyKey('appt-series') };
      return appointmentsApi.createSeries(out.body, key.current.key);
    },
    onMutate: () => setProblem(null),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: apptKeys.all });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined); // M22
      setDone(res);
    },
    onError: (e) => { setProblem(apiErrorMessage(e, t('p2.common.saveFailed'))); shake(); },
  });
  const { style: shakeStyle, shake } = useShake();

  if (done) {
    return (
      <Screen c={c} rise title={t('p2.appointments.series.new')}>
        <View style={{ alignItems: 'center', paddingTop: 8 }}><SuccessCheck testID="series-check" /></View>
        <Banner c={c} tone="info" title={done.series.code} body={t('p2.appointments.series.created', { count: done.created.length })} testID="series-created" />
        {done.skipped.length ? (
          <Card c={c}>
            <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{t('p2.appointments.series.skippedTitle')}</Text>
            {done.skipped.map((s) => (
              <Text key={s.date} style={{ color: c.textSecondary, fontSize: 13 }}>
                {t('p2.appointments.series.skippedRow', { day: shortDay(s.date, t), reason: s.reason })}
              </Text>
            ))}
          </Card>
        ) : null}
        <ActionRow>
          <PillButton c={c} label={t('p2.appointments.series.open')} onPress={() => router.replace(`/appointments/series/${done.series.id}` as Href)} testID="series-open" />
          <PillButton c={c} tone="outline" label={t('common.done')} onPress={() => router.back()} />
        </ActionRow>
      </Screen>
    );
  }

  return (
    <Screen c={c} rise title={t('p2.appointments.series.new')}>
      <SectionLabel c={c}>{t('p2.common.customer')}</SectionLabel>
      <PartyPicker c={c} value={party} onChange={setParty} testID="series-party" />
      <ServiceFields
        c={c}
        services={services.data ?? []}
        serviceId={serviceId}
        mode={mode}
        onService={(s) => { setServiceId(s._id); setMode(defaultModeOf(s)); setTime(undefined); }}
        onMode={setMode}
      />
      {mode === 'AT_CUSTOMER' ? (
        <TextInput mode="outlined" label={t('p2.appointments.new.address')} value={address} onChangeText={(v) => setAddress(v.slice(0, 200))} outlineStyle={{ borderRadius: radii.field }} testID="series-address" />
      ) : null}
      {bookableStaff(staff.data).length ? (
        <>
          <SectionLabel c={c}>{t('p2.appointments.new.staff')}</SectionLabel>
          <ChoiceChips
            c={c}
            options={[{ key: '', label: t('p2.appointments.new.anyone') }, ...bookableStaff(staff.data).map((s) => ({ key: s.id, label: s.name }))]}
            value={[staffId ?? '']}
            onChange={(v) => setStaffId(v[0] || undefined)}
          />
        </>
      ) : null}

      <SectionLabel c={c}>{t('p2.appointments.series.weekdays')}</SectionLabel>
      <ChoiceChips
        c={c}
        multi
        options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ key: d, label: t(`common.days.${d}`) }))}
        value={weekdays}
        onChange={(v) => setWeekdays(v.length > 3 ? weekdays : v)}
        testID="series-weekdays"
      />
      <DateField label={t('p2.appointments.series.startDay')} value={startDate} onChangeText={(v) => { setStartDate(v); setTime(undefined); }} />
      <SectionLabel c={c}>{t('p2.appointments.new.time')}</SectionLabel>
      {grid.length ? (
        <ChoiceChips c={c} options={grid.map((s) => ({ key: s, label: s }))} value={time ? [time] : []} onChange={(v) => v[0] && setTime(v[0])} testID="series-times" />
      ) : (
        <TimeField label={t('p2.appointments.new.time')} value={time ?? ''} onChangeText={setTime} />
      )}
      <SectionLabel c={c}>{t('p2.appointments.series.every')}</SectionLabel>
      <ChoiceChips
        c={c}
        options={[1, 2, 3, 4].map((n) => ({ key: n, label: t('p2.appointments.series.everyWeeks', { count: n }) }))}
        value={[interval]}
        onChange={(v) => v[0] && setInterval_(v[0])}
        testID="series-interval"
      />
      <SectionLabel c={c}>{t('p2.appointments.series.endBy')}</SectionLabel>
      <ChoiceChips
        c={c}
        options={[{ key: 'COUNT', label: t('p2.appointments.series.endByCount') }, { key: 'DATE', label: t('p2.appointments.series.endByDate') }]}
        value={[endBy]}
        onChange={(v) => v[0] && setEndBy(v[0] as 'DATE' | 'COUNT')}
        testID="series-endby"
      />
      {endBy === 'DATE' ? (
        <DateField label={t('p2.appointments.series.endDate')} value={endDate} onChangeText={setEndDate} />
      ) : (
        <View style={styles.countRow}>
          <Text style={{ color: c.textPrimary, flex: 1, minWidth: 0 }}>{t('p2.appointments.series.count')}</Text>
          <Stepper c={c} value={count} onChange={setCount} min={2} max={SERIES_MAX_VISITS} label={t('p2.appointments.series.count')} testID="series-count" />
        </View>
      )}

      {problem ? <Animated.View style={shakeStyle}><Banner c={c} tone="error" body={problem} testID="series-error" /></Animated.View> : null}
      <Button mode="contained" onPress={() => save.mutate()} loading={save.isPending} disabled={save.isPending} style={{ borderRadius: radii.pill }} contentStyle={{ minHeight: 52 }} testID="series-save">
        {save.isPending ? t('common.saving') : t('p2.appointments.series.save')}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
});
