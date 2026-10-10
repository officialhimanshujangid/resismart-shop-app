import React, { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../../src/hooks';
import { apiErrorMessage } from '../../../../src/api/axios';
import { EmptyBlock, ErrorBlock, Loading, Screen } from '../../../../src/features/more/ui';
import { ActionRow, PillButton } from '../../../../src/features/p1/ui';
import { Pill } from '../../../../src/features/p2/ui';
import { Segmented } from '../../../../src/components/ui'; // M22 — sliding pill
import { PressableScale } from '../../../../src/theme/motion'; // M22
import { dayTimeLabel } from '../../../../src/features/p2/dates'; // M22
import { appointmentsApi, apptKeys } from '../../../../src/features/appointments/api';
import { ruleLabel } from '../../../../src/features/appointments/logic';
import type { SeriesStatus } from '../../../../src/features/appointments/types';

/** Repeating appointments: code, customer, service, the rule, running / ended. */
export default function SeriesListScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { can } = usePartnerEntitlements();
  const [status, setStatus] = useState<SeriesStatus | 'ALL'>('ACTIVE');
  const q = useQuery({
    queryKey: apptKeys.series(status === 'ALL' ? undefined : status),
    queryFn: () => appointmentsApi.series(status === 'ALL' ? undefined : status),
  });
  const rows = q.data ?? [];

  return (
    <Screen c={c} rise title={t('p2.appointments.nav.series')}>
      {can('BOOKINGS_MANAGE', 'FULL') ? (
        <ActionRow>
          <PillButton c={c} icon="plus" label={t('p2.appointments.series.new')} onPress={() => router.push('/appointments/series/new' as Href)} testID="series-new" />
        </ActionRow>
      ) : null}
      <Segmented<SeriesStatus | 'ALL'>
        options={[
          { key: 'ACTIVE', label: t('p2.appointments.series.status.ACTIVE') },
          { key: 'ENDED', label: t('p2.appointments.series.status.ENDED') },
          { key: 'ALL', label: t('p2.common.all') },
        ]}
        value={status}
        onChange={setStatus}
        testID="series-status"
      />
      {q.isLoading ? <Loading c={c} skeleton={4} />
        : q.isError ? <ErrorBlock c={c} message={apiErrorMessage(q.error, t('p2.common.loadFailed'))} onRetry={() => q.refetch()} />
        : !rows.length ? <EmptyBlock c={c} icon="repeat-off" title={t('p2.appointments.series.empty')} />
        : rows.map((s) => (
          <PressableScale
            key={s.id}
            onPress={() => router.push(`/appointments/series/${s.id}` as Href)}
            accessibilityRole="button"
            testID={`series-row-${s.id}`}
            style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ color: c.textPrimary, fontWeight: '700' }} numberOfLines={1}>{`${s.code} · ${s.customerName}`}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>{s.serviceName}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={2}>{s.rule ? ruleLabel(s.rule, t) : s.ruleText}</Text>
              {s.nextVisitAt ? (
                <Text style={{ color: c.textPrimary, fontSize: 13 }} numberOfLines={1}>{t('p2.appointments.series.nextVisit', { when: dayTimeLabel(s.nextVisitAt, t) })}</Text>
              ) : null}
            </View>
            <Pill c={c} label={t(`p2.appointments.series.status.${s.status}`)} tone={s.status === 'ACTIVE' ? 'good' : 'neutral'} />
          </PressableScale>
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radii.card, padding: 14, minHeight: 64, borderWidth: StyleSheet.hairlineWidth },
});
