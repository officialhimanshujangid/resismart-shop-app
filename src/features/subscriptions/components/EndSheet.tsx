import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { DateField } from '../../../components/DateField';
import { Banner, PillButton } from '../../p1/ui';
import { Sheet } from '../../p2/ui';
import { istToday } from '../../p2/dates';

/**
 * End subscription: the last day it delivers and why (3–200 characters). A day
 * inside a month already billed is refused by the server (SUBSCRIPTION_PERIOD_BILLED).
 */
export function EndSheet({
  visible, onDismiss, submitting, error, onSubmit,
}: {
  visible: boolean; onDismiss: () => void; submitting: boolean; error?: string | null;
  onSubmit: (v: { endDate: string; reason: string }) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [endDate, setEndDate] = useState(istToday());
  const [reason, setReason] = useState('');
  useEffect(() => { if (visible) { setEndDate(istToday()); setReason(''); } }, [visible]);
  const ok = !!endDate && reason.trim().length >= 3;
  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t('p2.subscriptions.end.title')}
      footer={(
        <PillButton c={c} tone="danger" icon="stop-circle-outline" label={submitting ? t('common.saving') : t('p2.subscriptions.end.confirm')}
          disabled={submitting || !ok} onPress={() => onSubmit({ endDate, reason: reason.trim() })} testID="end-save" />
      )}
    >
      <DateField label={t('p2.subscriptions.end.lastDay')} value={endDate} onChangeText={setEndDate} />
      <AppInput label={t('p2.common.reason')} value={reason} onChangeText={(v) => setReason(v.slice(0, 200))} />
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.subscriptions.end.help')}</Text>
      {error ? <Banner c={c} tone="error" body={error} /> : null}
    </Sheet>
  );
}
