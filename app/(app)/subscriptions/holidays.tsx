import React, { useRef, useState } from 'react';
import { Alert, useColorScheme } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { ActionRow, PillButton } from '../../../src/features/p1/ui';
import { istToday } from '../../../src/features/p2/dates';
import { useModuleSettings } from '../../../src/features/p2/useCategoryModules';
import { subKeys, subscriptionsApi } from '../../../src/features/subscriptions/api';
import type { Pause } from '../../../src/features/subscriptions/types';
import { PausesList } from '../../../src/features/subscriptions/components/PausesList';
import { PauseSheet, PauseInput } from '../../../src/features/subscriptions/components/PauseSheet';

/**
 * Shop holidays: days the whole shop (or one route) does not deliver. Every
 * subscription on it is paused for those days and its customers are told. A
 * holiday can be removed before it starts.
 */
export default function HolidaysScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { can } = usePartnerEntitlements();
  const canManage = can('SUBSCRIPTIONS_MANAGE', 'FULL');
  const { settings } = useModuleSettings();
  const qc = useQueryClient();
  const today = istToday();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  const holidays = useQuery({ queryKey: subKeys.holidays(), queryFn: subscriptionsApi.holidays });
  const routes = useQuery({ queryKey: subKeys.routes(), queryFn: subscriptionsApi.routes });
  const routeName = new Map((routes.data ?? []).map((r) => [r._id, r.name]));
  const refresh = () => { void qc.invalidateQueries({ queryKey: subKeys.all() }); };

  const add = useMutation({
    mutationFn: (v: PauseInput) => {
      if (!key.current) key.current = newIdempotencyKey('subholiday');
      return subscriptionsApi.addHoliday(v, key.current);
    },
    onSuccess: () => { key.current = null; setOpen(false); setToast(t('p2.subscriptions.holidays.saved')); refresh(); },
    onError: (e) => setError(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });
  const remove = useMutation({
    mutationFn: (p: Pause) => subscriptionsApi.removeHoliday(p._id),
    onSuccess: () => { setToast(t('p2.subscriptions.holidays.removed')); refresh(); },
    onError: (e) => setToast(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });
  const confirmRemove = (p: Pause) => Alert.alert(t('p2.subscriptions.holidays.removeTitle'), t('p2.subscriptions.holidays.removeBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('p2.subscriptions.pause.remove'), style: 'destructive', onPress: () => remove.mutate(p) },
  ]);

  // Say which route a holiday is for, in its reason line.
  const list = (holidays.data ?? []).map((h) => (h.routeId && routeName.has(String(h.routeId))
    ? { ...h, reason: [routeName.get(String(h.routeId)), h.reason].filter(Boolean).join(' · ') }
    : h));

  return (
    <Screen
      c={c}
      rise
      title={t('p2.subscriptions.holidays.title')}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('p2.subscriptions.holidays.help')}</Text>
      {canManage ? (
        <ActionRow>
          <PillButton c={c} icon="plus" label={t('p2.subscriptions.holidays.add')}
            onPress={() => { setError(null); key.current = null; setOpen(true); }} testID="holiday-add" />
        </ActionRow>
      ) : null}
      {holidays.isPending ? <Loading c={c} skeleton={3} />
        : holidays.isError ? <ErrorBlock c={c} message={apiErrorMessage(holidays.error, t('p2.common.loadFailed'))} onRetry={() => void holidays.refetch()} />
          : (
            <PausesList c={c} pauses={list} today={today} busy={remove.isPending}
              onRemove={canManage ? confirmRemove : undefined} emptyText={t('p2.subscriptions.holidays.empty')} />
          )}
      <PauseSheet
        visible={open}
        onDismiss={() => setOpen(false)}
        title={t('p2.subscriptions.holidays.add')}
        confirmLabel={t('common.save')}
        maxDays={settings.subscriptions.maxPauseDays}
        submitting={add.isPending}
        error={error}
        onSubmit={(v) => add.mutate(v)}
        routes={(routes.data ?? []).filter((r) => r.kind === 'ROUTE' && r.isActive).map((r) => ({ id: r._id, name: r.name }))}
        testID="holiday-sheet"
      />
    </Screen>
  );
}
