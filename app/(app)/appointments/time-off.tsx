import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { IconButton, Snackbar, Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { Card, EmptyBlock, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { ActionRow, PillButton } from '../../../src/features/p1/ui';
import { dayTimeLabel } from '../../../src/features/p2/dates';
import { appointmentsApi, apptKeys, useApptStaff } from '../../../src/features/appointments/api';
import { timeOffByStaff } from '../../../src/features/appointments/logic';
import { TimeOffSheet } from '../../../src/features/appointments/components/TimeOffSheet';
import type { TimeOffRow } from '../../../src/features/appointments/types';

/** Time off coming up, by person; add (with the overlap warning) and delete need BOOKINGS_MANAGE. */
export default function TimeOffScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const qc = useQueryClient();
  const { can } = usePartnerEntitlements();
  const canManage = can('BOOKINGS_MANAGE', 'FULL');
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // "Upcoming" = not over yet; fixed for the screen's life so the key is stable.
  const [since] = useState(() => new Date().toISOString());

  const staff = useApptStaff();
  const q = useQuery({ queryKey: [...apptKeys.timeOff(), since], queryFn: () => appointmentsApi.timeOff({ from: since }) });
  const groups = useMemo(() => timeOffByStaff(q.data ?? [], staff.data ?? []), [q.data, staff.data]);

  const remove = useMutation({
    mutationFn: (id: string) => appointmentsApi.removeTimeOff(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: apptKeys.all }); setToast(t('p2.appointments.timeOff.deleted')); },
    onError: (e) => setToast(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });
  const askDelete = (r: TimeOffRow) => Alert.alert(
    t('p2.appointments.timeOff.deleteTitle'),
    t('p2.appointments.timeOff.range', { from: dayTimeLabel(r.from, t), to: dayTimeLabel(r.to, t) }),
    [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate(r.id) }],
  );

  return (
    <Screen
      c={c}
      title={t('p2.appointments.nav.timeOff')}
      subtitle={t('p2.appointments.timeOff.subtitle')}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      {canManage ? (
        <ActionRow>
          <PillButton c={c} icon="plus" label={t('p2.appointments.timeOff.add')} onPress={() => setAdding(true)} testID="timeoff-add" />
        </ActionRow>
      ) : null}
      {q.isLoading ? <Loading c={c} />
        : q.isError ? <ErrorBlock c={c} message={apiErrorMessage(q.error, t('p2.common.loadFailed'))} onRetry={() => q.refetch()} />
        : !groups.length ? <EmptyBlock c={c} icon="calendar-check-outline" title={t('p2.appointments.timeOff.empty')} />
        : groups.map((g) => (
          <View key={g.staffId} style={{ gap: 8 }}>
            <SectionLabel c={c}>{g.name}</SectionLabel>
            {g.rows.map((r) => (
              <Card key={r.id} c={c} style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={2}>
                    {t('p2.appointments.timeOff.range', { from: dayTimeLabel(r.from, t), to: dayTimeLabel(r.to, t) })}
                  </Text>
                  {r.reason ? <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={2}>{r.reason}</Text> : null}
                </View>
                {canManage ? (
                  <IconButton icon="delete-outline" iconColor={c.error} onPress={() => askDelete(r)} accessibilityLabel={t('common.delete')} testID={`timeoff-delete-${r.id}`} />
                ) : null}
              </Card>
            ))}
          </View>
        ))}
      <TimeOffSheet
        c={c}
        visible={adding}
        onDismiss={() => setAdding(false)}
        staff={staff.data ?? []}
        onSaved={() => { setAdding(false); setToast(t('p2.appointments.timeOff.saved')); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingRight: 4, borderRadius: radii.card },
});
