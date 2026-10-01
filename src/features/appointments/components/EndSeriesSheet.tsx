import React, { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { DateField } from '../../../components/DateField';
import { Banner, PillButton } from '../../p1/ui';
import { Sheet } from '../../p2/ui';
import { istToday } from '../../p2/dates';
import { appointmentsApi, apptKeys } from '../api';

/** End series: from which day, whether to call off the visits after it (default yes), and why. */
export function EndSeriesSheet({
  c, visible, seriesId, onDismiss, onEnded,
}: { c: ColorScheme; visible: boolean; seriesId: string; onDismiss: () => void; onEnded: (cancelled: number) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [fromDate, setFromDate] = useState(istToday());
  const [cancelFuture, setCancelFuture] = useState(true);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (visible) { setFromDate(istToday()); setCancelFuture(true); setReason(''); setProblem(null); }
  }, [visible]);

  const end = useMutation({
    mutationFn: () => appointmentsApi.endSeries(seriesId, {
      fromDate, cancelFuture, ...(reason.trim() ? { reason: reason.trim().slice(0, 300) } : {}),
    }),
    onMutate: () => setProblem(null),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: apptKeys.all }); onEnded(res?.cancelled ?? 0); },
    onError: (e) => setProblem(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t('p2.appointments.series.end')}
      testID="series-end-sheet"
      footer={<PillButton c={c} tone="danger" label={t('p2.appointments.series.end')} onPress={() => end.mutate()} disabled={end.isPending} testID="series-end-confirm" />}
    >
      <DateField label={t('p2.appointments.series.endFrom')} value={fromDate} onChangeText={setFromDate} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
        <Text style={{ color: c.textPrimary, flex: 1, minWidth: 0 }}>{t('p2.appointments.series.cancelFuture')}</Text>
        <Switch value={cancelFuture} onValueChange={setCancelFuture} accessibilityLabel={t('p2.appointments.series.cancelFuture')} />
      </View>
      <TextInput
        mode="outlined"
        label={t('p2.appointments.series.endReason')}
        value={reason}
        onChangeText={(v) => setReason(v.slice(0, 300))}
        outlineStyle={{ borderRadius: radii.field }}
      />
      {problem ? <Banner c={c} tone="error" body={problem} /> : null}
    </Sheet>
  );
}
