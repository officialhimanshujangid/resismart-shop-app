import React, { useRef, useState } from 'react';
import { StyleSheet, Switch, useColorScheme, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { partiesApi } from '../../../src/api/parties.api';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { Screen, SectionLabel } from '../../../src/features/more/ui';
import { Banner } from '../../../src/features/p1/ui';
import { ChoiceChips, PartyPicker, PickedParty } from '../../../src/features/p2/ui';
import { istToday } from '../../../src/features/p2/dates';
import {
  appointmentsApi, apptKeys, useApptAvailability, useApptServices, useApptStaff,
} from '../../../src/features/appointments/api';
import { bookableStaff, packagesForService, walkInBody } from '../../../src/features/appointments/logic';
import { SlotPicker } from '../../../src/features/appointments/components/SlotPicker';
import { ServiceFields, defaultModeOf } from '../../../src/features/appointments/components/ServiceFields';
import { CustomerSummaryLine } from '../../../src/features/appointments/components/CustomerSummaryLine';
import type { ServiceMode } from '../../../src/features/services/types';

/**
 * Book now — a walk-in or a phone booking, three taps for a known customer:
 * the customer, the service, "Now" (or another slot of the grid). The person
 * doing it, a package session and the customer's message are optional. One
 * Idempotency-Key per decision: a retry of the same booking reuses it.
 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function BookNowScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const qc = useQueryClient();
  const { can } = usePartnerEntitlements();
  const params = useLocalSearchParams<{ staffId?: string; day?: string }>();
  const [party, setParty] = useState<PickedParty | null>(null);
  const [serviceId, setServiceId] = useState<string>();
  const [mode, setMode] = useState<ServiceMode>();
  const [day, setDay] = useState(() => (params.day && DAY_RE.test(params.day) && params.day >= istToday() ? params.day : istToday()));
  const [time, setTime] = useState<string>();
  const [staffId, setStaffId] = useState<string | undefined>(params.staffId || undefined);
  const [packageId, setPackageId] = useState<string>();
  const [notify, setNotify] = useState(true);
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const key = useRef<{ sig: string; key: string } | null>(null);

  const services = useApptServices();
  const availability = useApptAvailability();
  const staff = useApptStaff();
  const service = (services.data ?? []).find((s) => s._id === serviceId);
  const summary = useQuery({
    queryKey: apptKeys.summary(party?.id ?? ''),
    queryFn: () => appointmentsApi.customerSummary(party!.id),
    enabled: !!party,
  });
  const partyFull = useQuery({
    queryKey: ['p2', 'appointments', 'party', party?.id ?? ''],
    queryFn: () => partiesApi.getOne(party!.id),
    enabled: !!party && mode === 'AT_CUSTOMER',
  });
  const partyAddress = partyFull.data?.billingAddress;

  const save = useMutation({
    mutationFn: async () => {
      const out = walkInBody({
        partyId: party?.id, serviceId, mode, day, time, staffId, addressLine1: address, partyAddress,
        packagePurchaseId: packageId, note, notifyCustomer: notify,
      });
      if ('problem' in out) throw Object.assign(new Error(t(`p2.appointments.new.problem.${out.problem}`)), { local: true });
      const sig = JSON.stringify(out.body);
      if (!key.current || key.current.sig !== sig) key.current = { sig, key: newIdempotencyKey('appt-book') };
      return appointmentsApi.book(out.body, key.current.key);
    },
    onMutate: () => setProblem(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apptKeys.all });
      const back = `/appointments?day=${day}` as Href;
      const r = router as unknown as { dismissTo?: (h: Href) => void };
      if (typeof r.dismissTo === 'function') r.dismissTo(back);
      else router.back();
    },
    onError: (e) => setProblem(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });

  const staffOptions = [
    { key: '', label: t('p2.appointments.new.anyone') },
    ...bookableStaff(staff.data).map((s) => ({ key: s.id, label: s.name })),
  ];
  const packages = packagesForService(summary.data?.activePackages, serviceId);

  return (
    <Screen c={c} title={t('p2.appointments.bookNow')} subtitle={t('p2.appointments.new.subtitle')}>
      <SectionLabel c={c}>{t('p2.common.customer')}</SectionLabel>
      <PartyPicker c={c} value={party} onChange={(p) => { setParty(p); setPackageId(undefined); }} testID="appt-party" />
      {summary.data ? <CustomerSummaryLine c={c} s={summary.data} /> : null}

      <ServiceFields
        c={c}
        services={services.data ?? []}
        serviceId={serviceId}
        mode={mode}
        onService={(s) => {
          if (service && service.durationMin !== s.durationMin) setTime(undefined);
          setServiceId(s._id);
          setMode(defaultModeOf(s));
          // A chosen package that does not cover the new service is dropped.
          if (packageId && !packagesForService(summary.data?.activePackages, s._id).some((p) => p.id === packageId)) {
            setPackageId(undefined);
          }
        }}
        onMode={setMode}
      />
      {mode === 'AT_CUSTOMER' ? (
        <View style={{ gap: 6 }}>
          {partyAddress?.line1 && !address ? (
            <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={2}>
              {t('p2.appointments.new.visitAt', { address: partyAddress.line1 })}
            </Text>
          ) : null}
          <TextInput
            mode="outlined"
            label={partyAddress?.line1 ? t('p2.appointments.new.otherAddress') : t('p2.appointments.new.address')}
            value={address}
            onChangeText={(v) => setAddress(v.slice(0, 200))}
            outlineStyle={{ borderRadius: radii.field }}
            testID="appt-address"
          />
        </View>
      ) : null}

      <SectionLabel c={c}>{t('p2.appointments.new.time')}</SectionLabel>
      <SlotPicker
        c={c}
        availability={availability.isLoading ? undefined : availability.data}
        day={day}
        onDay={(d) => { setDay(d); setTime(undefined); }}
        time={time}
        onTime={setTime}
        durationMin={service?.durationMin}
      />

      {staffOptions.length > 1 ? (
        <>
          <SectionLabel c={c}>{t('p2.appointments.new.staff')}</SectionLabel>
          <ChoiceChips c={c} options={staffOptions} value={[staffId ?? '']} onChange={(v) => setStaffId(v[0] || undefined)} testID="appt-staff" />
        </>
      ) : null}

      {packages.length ? (
        <>
          <SectionLabel c={c}>{t('p2.appointments.new.package')}</SectionLabel>
          <ChoiceChips
            c={c}
            multi
            options={packages.map((p) => ({ key: p.id, label: t('p2.appointments.new.usePackage', { name: p.name, count: p.remaining }) }))}
            value={packageId ? [packageId] : []}
            onChange={(v) => setPackageId(v.filter((x) => x !== packageId)[0])}
            testID="appt-packages"
          />
        </>
      ) : null}

      <TextInput
        mode="outlined"
        label={t('p2.appointments.new.note')}
        value={note}
        onChangeText={(v) => setNote(v.slice(0, 500))}
        outlineStyle={{ borderRadius: radii.field }}
      />
      <View style={styles.switchRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{t('p2.appointments.new.notify')}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.appointments.new.notifyHint')}</Text>
        </View>
        <Switch value={notify} onValueChange={setNotify} testID="appt-notify" accessibilityLabel={t('p2.appointments.new.notify')} />
      </View>

      {problem ? <Banner c={c} tone="error" body={problem} testID="appt-error" /> : null}
      <Button
        mode="contained"
        onPress={() => save.mutate()}
        loading={save.isPending}
        disabled={save.isPending || !can('BOOKINGS_MANAGE', 'FULL')}
        style={styles.save}
        contentStyle={{ minHeight: 52 }}
        testID="appt-save"
      >
        {save.isPending ? t('common.saving') : t('p2.appointments.bookNow')}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  save: { borderRadius: radii.pill, marginTop: 4 },
});
