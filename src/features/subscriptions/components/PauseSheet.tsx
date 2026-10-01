import React, { useEffect, useState } from 'react';
import { Text } from 'react-native-paper';
import { useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { DateField } from '../../../components/DateField';
import { Banner, PillButton } from '../../p1/ui';
import { ChoiceChips, Sheet } from '../../p2/ui';
import { addDays, istToday } from '../../p2/dates';
import { rangeProblem } from '../logic';

export interface PauseInput { from: string; to: string; reason?: string; routeId?: string }

/**
 * Pause a subscription — or, with `routes`, a shop holiday (whole shop or one
 * route). From / to (inclusive) and an optional reason; the longest pause is the
 * `maxPauseDays` setting (the server refuses longer: SUBSCRIPTION_PAUSE_TOO_LONG).
 */
export function PauseSheet({
  visible, onDismiss, title, confirmLabel, maxDays, submitting, error, onSubmit, routes, testID,
}: {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  confirmLabel: string;
  maxDays: number;
  submitting: boolean;
  error?: string | null;
  onSubmit: (v: PauseInput) => void;
  routes?: { id: string; name: string }[];
  testID?: string;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [from, setFrom] = useState(addDays(istToday(), 1));
  const [to, setTo] = useState(addDays(istToday(), 1));
  const [reason, setReason] = useState('');
  const [routeId, setRouteId] = useState('');
  useEffect(() => {
    if (!visible) return;
    const d = addDays(istToday(), 1);
    setFrom(d); setTo(d); setReason(''); setRouteId('');
  }, [visible]);

  const problem = rangeProblem(from, to, maxDays);
  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={title}
      testID={testID}
      footer={(
        <PillButton c={c} icon="pause-circle-outline" label={submitting ? t('common.saving') : confirmLabel}
          disabled={submitting || !!problem}
          onPress={() => onSubmit({ from, to, ...(reason.trim() ? { reason: reason.trim() } : {}), ...(routeId ? { routeId } : {}) })}
          testID="pause-save" />
      )}
    >
      <DateField label={t('p2.common.from')} value={from} onChangeText={(v) => { setFrom(v); if (to < v) setTo(v); }} />
      <DateField label={t('p2.common.to')} value={to} onChangeText={setTo} />
      {problem === 'ORDER' ? <Text style={{ color: c.error }}>{t('p2.subscriptions.pause.order')}</Text> : null}
      {problem === 'TOO_LONG' ? (
        <Text style={{ color: c.error }}>{t('errors.SUBSCRIPTION_PAUSE_TOO_LONG', { max: maxDays })}</Text>
      ) : null}
      {routes && routes.length > 0 ? (
        <>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.subscriptions.holidays.which')}</Text>
          <ChoiceChips
            c={c}
            options={[{ key: '', label: t('p2.subscriptions.holidays.wholeShop') }, ...routes.map((r) => ({ key: r.id, label: r.name }))]}
            value={[routeId]}
            onChange={(v) => setRouteId(v[0] ?? '')}
          />
        </>
      ) : null}
      <AppInput label={t('p2.common.reason')} value={reason} onChangeText={(v) => setReason(v.slice(0, 200))} />
      {error ? <Banner c={c} tone="error" body={error} testID="pause-error" /> : null}
    </Sheet>
  );
}

/** "Restart deliveries" on a running pause: from which day deliveries start again. */
export function RestartSheet({
  visible, onDismiss, submitting, error, onSubmit,
}: { visible: boolean; onDismiss: () => void; submitting: boolean; error?: string | null; onSubmit: (resumeFrom: string) => void }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [day, setDay] = useState(istToday());
  useEffect(() => { if (visible) setDay(istToday()); }, [visible]);
  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t('p2.subscriptions.pause.restartTitle')}
      footer={(
        <PillButton c={c} icon="play-circle-outline" label={submitting ? t('common.saving') : t('p2.subscriptions.pause.restart')}
          disabled={submitting || !day} onPress={() => onSubmit(day)} testID="restart-save" />
      )}
    >
      <DateField label={t('p2.subscriptions.pause.resumeFrom')} value={day} onChangeText={setDay} />
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.subscriptions.pause.restartHelp')}</Text>
      {error ? <Banner c={c} tone="error" body={error} /> : null}
    </Sheet>
  );
}
