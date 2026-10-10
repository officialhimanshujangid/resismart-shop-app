import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { FAB } from 'react-native-paper';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { ActionRow, PillButton, useIsWide } from '../../../src/features/p1/ui';
import { ChoiceChips, DayStepper } from '../../../src/features/p2/ui';
import { istToday } from '../../../src/features/p2/dates';
import { appointmentsApi, apptKeys } from '../../../src/features/appointments/api';
import { StaffFilter, staffSections } from '../../../src/features/appointments/logic';
import { StaffSectionView } from '../../../src/features/appointments/components/StaffSection';
import { Rise } from '../../../src/theme/motion'; // M22

/**
 * The day diary per person (S-priority): ◀ day ▶, a chip per person, then one
 * section each (phone) or one column each side by side (tablet). A booking
 * opens in the Bookings tab, where every verb already lives. "Book now" takes
 * a walk-in with the chosen person already picked.
 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function AppointmentsCalendarScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const wide = useIsWide();
  const { can } = usePartnerEntitlements();
  const canManage = can('BOOKINGS_MANAGE', 'FULL');
  const params = useLocalSearchParams<{ day?: string }>();
  const [day, setDay] = useState(() => (params.day && DAY_RE.test(params.day) ? params.day : istToday()));
  useEffect(() => { if (params.day && DAY_RE.test(params.day)) setDay(params.day); }, [params.day]);
  const [filter, setFilter] = useState<StaffFilter>('ALL');

  const q = useQuery({ queryKey: apptKeys.calendar(day), queryFn: () => appointmentsApi.calendar(day, day) });
  const staff = q.data?.staff ?? [];
  const sections = useMemo(
    () => staffSections(q.data, day, filter, t('p2.appointments.cal.notAssigned')),
    [q.data, day, filter, t],
  );

  const chips = [
    { key: 'ALL', label: t('p2.common.all') },
    ...staff.map((s) => ({ key: s.id, label: s.name })),
    { key: 'NONE', label: t('p2.appointments.cal.notAssigned') },
  ];
  const open = (id: string) => router.push(`/(app)/(tabs)/bookings?id=${id}` as Href);
  const bookNow = () => {
    const staffPart = filter !== 'ALL' && filter !== 'NONE' ? `&staffId=${filter}` : '';
    router.push(`/appointments/new?day=${day}${staffPart}` as Href);
  };

  const body = q.isLoading ? <Loading c={c} skeleton={4} />
    : q.isError ? <ErrorBlock c={c} message={apiErrorMessage(q.error, t('p2.common.loadFailed'))} onRetry={() => q.refetch()} />
    : !sections.length ? <EmptyBlock c={c} icon="calendar-blank-outline" title={t('p2.appointments.cal.empty')} />
    : wide ? (
      <ScrollView horizontal contentContainerStyle={styles.columns} testID="appt-columns">
        {sections.map((s) => <StaffSectionView key={s.key} c={c} section={s} day={day} column onOpen={open} />)}
      </ScrollView>
    ) : (
      <View style={{ gap: 14 }}>
        {sections.map((s, i) => (
          <Rise key={s.key} index={Math.min(i, 5)}>
            <StaffSectionView c={c} section={s} day={day} onOpen={open} />
          </Rise>
        ))}
      </View>
    );

  return (
    <Screen
      c={c}
      title={t('p2.appointments.title')}
      subtitle={t('p2.appointments.subtitle')}
      scroll={false}
      floating={canManage ? (
        <FAB
          icon="calendar-plus"
          label={t('p2.appointments.bookNow')}
          onPress={bookNow}
          style={[styles.fab, { backgroundColor: c.primary }]}
          color={c.textInverse}
          testID="appt-book-now"
        />
      ) : null}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
      >
        <Rise index={0}>
        <ActionRow>
          <PillButton c={c} tone="outline" icon="calendar-remove-outline" label={t('p2.appointments.nav.timeOff')} onPress={() => router.push('/appointments/time-off' as Href)} testID="appt-nav-timeoff" />
          <PillButton c={c} tone="outline" icon="repeat" label={t('p2.appointments.nav.series')} onPress={() => router.push('/appointments/series' as Href)} testID="appt-nav-series" />
          <PillButton c={c} tone="outline" icon="ticket-confirmation-outline" label={t('p2.appointments.nav.packages')} onPress={() => router.push('/appointments/packages' as Href)} testID="appt-nav-packages" />
        </ActionRow>
        </Rise>
        <Rise index={1}><DayStepper c={c} day={day} onChange={setDay} testID="appt-day" /></Rise>
        {staff.length ? (
          <ChoiceChips c={c} options={chips} value={[filter]} onChange={(v) => setFilter(v[0] ?? 'ALL')} testID="appt-staff-filter" />
        ) : null}
        {/* M22 — re-keyed per day, so moving ◀ ▶ slides the new day in. */}
        <Rise key={day} index={2}>{body}</Rise>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 96, gap: 12 },
  columns: { gap: 12, paddingBottom: 8, alignItems: 'flex-start' },
  fab: { position: 'absolute', right: 16, bottom: 24 },
});
