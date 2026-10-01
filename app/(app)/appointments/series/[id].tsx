import React, { useState } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../../src/hooks';
import { apiErrorMessage } from '../../../../src/api/axios';
import { STATUS_LABEL_KEYS } from '../../../../src/features/bookings/format';
import { Card, ErrorBlock, Loading, Screen, SectionLabel } from '../../../../src/features/more/ui';
import { ActionRow, PillButton } from '../../../../src/features/p1/ui';
import { Pill } from '../../../../src/features/p2/ui';
import { dayTimeLabel, shortDay } from '../../../../src/features/p2/dates';
import { appointmentsApi, apptKeys, useApptStaff } from '../../../../src/features/appointments/api';
import { ruleLabel, statusTone } from '../../../../src/features/appointments/logic';
import { EndSeriesSheet } from '../../../../src/features/appointments/components/EndSeriesSheet';

/** One repeating appointment: the rule, what was skipped, every visit; End series (BOOKINGS_MANAGE). */
export default function SeriesDetailScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = usePartnerEntitlements();
  const [ending, setEnding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const staff = useApptStaff();
  const q = useQuery({ queryKey: apptKeys.seriesOne(String(id)), queryFn: () => appointmentsApi.seriesOne(String(id)), enabled: !!id });

  if (q.isLoading) return <Screen c={c} title={t('p2.appointments.nav.series')}><Loading c={c} /></Screen>;
  if (q.isError || !q.data) {
    return (
      <Screen c={c} title={t('p2.appointments.nav.series')}>
        <ErrorBlock c={c} message={apiErrorMessage(q.error, t('p2.common.loadFailed'))} onRetry={() => q.refetch()} />
      </Screen>
    );
  }
  const { series: s, visits } = q.data;
  const staffName = s.staffId ? staff.data?.find((x) => x.id === s.staffId)?.name : undefined;
  const ends = s.endDate
    ? t('p2.appointments.series.endsOn', { day: shortDay(s.endDate, t) })
    : t('p2.appointments.series.endsAfter', { count: s.count ?? 0 });

  return (
    <Screen
      c={c}
      title={s.code}
      subtitle={s.customerName}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      <Card c={c}>
        <View style={styles.head}>
          <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 16, flex: 1, minWidth: 0 }} numberOfLines={2}>{s.serviceName}</Text>
          <Pill c={c} label={t(`p2.appointments.series.status.${s.status}`)} tone={s.status === 'ACTIVE' ? 'good' : 'neutral'} />
        </View>
        <Text style={{ color: c.textPrimary }}>{ruleLabel(s.rule, t)}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>
          {`${t('p2.appointments.series.startsOn', { day: shortDay(s.startDate, t) })} · ${ends}`}
        </Text>
        {staffName ? <Text style={{ color: c.textSecondary, fontSize: 13 }}>{staffName}</Text> : null}
        {s.endedReason ? <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={3}>{s.endedReason}</Text> : null}
      </Card>
      {s.status === 'ACTIVE' && can('BOOKINGS_MANAGE', 'FULL') ? (
        <ActionRow>
          <PillButton c={c} tone="danger" icon="stop-circle-outline" label={t('p2.appointments.series.end')} onPress={() => setEnding(true)} testID="series-end" />
        </ActionRow>
      ) : null}

      {s.skipped?.length ? (
        <Card c={c}>
          <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{t('p2.appointments.series.skippedTitle')}</Text>
          {s.skipped.map((k) => (
            <Text key={`${k.date}-${k.reason}`} style={{ color: c.textSecondary, fontSize: 13 }}>
              {t('p2.appointments.series.skippedRow', { day: shortDay(k.date, t), reason: k.reason })}
            </Text>
          ))}
        </Card>
      ) : null}

      <SectionLabel c={c}>{t('p2.appointments.series.visits')}</SectionLabel>
      {!visits.length ? <Text style={{ color: c.textSecondary }}>{t('p2.appointments.series.noVisits')}</Text> : visits.map((v) => (
        <Pressable
          key={v.id}
          onPress={() => router.push(`/(app)/(tabs)/bookings?id=${v.id}` as Href)}
          accessibilityRole="button"
          style={[styles.visit, { backgroundColor: c.surface }]}
        >
          <Text style={{ color: c.textPrimary, fontWeight: '600', flex: 1, minWidth: 0 }} numberOfLines={1}>{dayTimeLabel(v.slotStart, t)}</Text>
          <Pill c={c} label={t(STATUS_LABEL_KEYS[v.status] ?? v.status)} tone={statusTone(v.status)} />
        </Pressable>
      ))}

      <EndSeriesSheet
        c={c}
        visible={ending}
        seriesId={s.id}
        onDismiss={() => setEnding(false)}
        onEnded={(n) => { setEnding(false); setToast(t('p2.appointments.series.ended', { count: n })); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  visit: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radii.card, paddingHorizontal: 14, minHeight: 52 },
});
