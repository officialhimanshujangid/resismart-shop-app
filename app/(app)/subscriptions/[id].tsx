import React, { useRef, useState } from 'react';
import { Alert, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { formatPaise } from '../../../src/lib/money';
import { ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { ActionRow, PillButton, StatGrid, StatTile, TwoPane } from '../../../src/features/p1/ui';
import { istToday, periodOf } from '../../../src/features/p2/dates';
import { useModuleSettings } from '../../../src/features/p2/useCategoryModules';
import { subKeys, subscriptionsApi } from '../../../src/features/subscriptions/api';
import type { Pause } from '../../../src/features/subscriptions/types';
import { SubscriptionHeader } from '../../../src/features/subscriptions/components/SubscriptionHeader';
import { MonthSwitcher } from '../../../src/features/subscriptions/components/MonthCalendar';
import { AttendanceMonthView, DeliveryMonth } from '../../../src/features/subscriptions/components/MonthSection';
import { PausesList } from '../../../src/features/subscriptions/components/PausesList';
import { PauseSheet, PauseInput, RestartSheet } from '../../../src/features/subscriptions/components/PauseSheet';
import { EndSheet } from '../../../src/features/subscriptions/components/EndSheet';
import { ReviseSheet } from '../../../src/features/subscriptions/components/ReviseSheet';
import { EditSheet } from '../../../src/features/subscriptions/components/EditSheet';
import { revisionOn } from '../../../src/features/subscriptions/logic';
import type { EditBody, ReviseBody } from '../../../src/features/subscriptions/types';
import { BillRow } from '../../../src/features/subscriptions/components/BillRow';

/**
 * One subscription: who and what, the month calendar (switch months), the bill
 * as it stands, the pauses (Pause / Remove / Restart deliveries), End
 * subscription or Restart, and its monthly bills. Tuition shows attendance for
 * the month instead of deliveries.
 */
export default function SubscriptionDetailScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = String(rawId);
  const { can } = usePartnerEntitlements();
  const canManage = can('SUBSCRIPTIONS_MANAGE', 'FULL');
  const { settings } = useModuleSettings();
  const today = istToday();
  const [month, setMonth] = useState(periodOf(today));
  const [pauseOpen, setPauseOpen] = useState(false);
  const [restartOf, setRestartOf] = useState<Pause | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pauseKey = useRef<string | null>(null);
  const qc = useQueryClient();

  const detail = useQuery({ queryKey: subKeys.detail(id, month), queryFn: () => subscriptionsApi.detail(id, month) });
  const sub = detail.data?.subscription;
  const tuition = sub?.kind === 'TUITION';
  const attendance = useQuery({
    queryKey: subKeys.attendanceMonth(id, month),
    queryFn: () => subscriptionsApi.attendanceMonth(id, month),
    enabled: tuition,
  });
  const routes = useQuery({ queryKey: subKeys.routes(), queryFn: subscriptionsApi.routes });
  const routeName = sub?.routeId ? (routes.data ?? []).find((r) => r._id === String(sub.routeId))?.name : undefined;

  const refresh = () => { void qc.invalidateQueries({ queryKey: subKeys.all() }); };
  const onFail = (e: unknown) => setSheetError(apiErrorMessage(e, t('p2.common.saveFailed')));
  const toastFail = (e: unknown) => setToast(apiErrorMessage(e, t('p2.common.saveFailed')));

  const addPause = useMutation({
    mutationFn: (v: PauseInput) => {
      if (!pauseKey.current) pauseKey.current = newIdempotencyKey('subpause');
      return subscriptionsApi.addPause(id, { from: v.from, to: v.to, ...(v.reason ? { reason: v.reason } : {}) }, pauseKey.current);
    },
    onSuccess: () => { pauseKey.current = null; setPauseOpen(false); setToast(t('p2.subscriptions.pause.saved')); refresh(); },
    onError: onFail,
  });
  const removePause = useMutation({
    mutationFn: (p: Pause) => subscriptionsApi.removePause(id, p._id),
    onSuccess: () => { setToast(t('p2.subscriptions.pause.removedToast')); refresh(); },
    onError: toastFail,
  });
  const restart = useMutation({
    mutationFn: ({ p, day }: { p: Pause; day: string }) => subscriptionsApi.endPause(id, p._id, day),
    onSuccess: () => { setRestartOf(null); setToast(t('p2.subscriptions.pause.restarted')); refresh(); },
    onError: onFail,
  });
  const revise = useMutation({
    mutationFn: (body: ReviseBody) => subscriptionsApi.revise(id, body),
    onSuccess: () => { setReviseOpen(false); setToast(t('p2.subscriptions.revise.saved')); refresh(); },
    onError: onFail,
  });
  const edit = useMutation({
    mutationFn: (body: EditBody) => subscriptionsApi.edit(id, body),
    onSuccess: () => { setEditOpen(false); setToast(t('p2.subscriptions.edit.saved')); refresh(); },
    onError: onFail,
  });
  const end = useMutation({
    mutationFn: (v: { endDate: string; reason: string }) => subscriptionsApi.end(id, v),
    onSuccess: () => { setEndOpen(false); refresh(); },
    onError: onFail,
  });
  const resume = useMutation({
    mutationFn: () => subscriptionsApi.resume(id),
    onSuccess: () => { setToast(t('p2.subscriptions.detail.resumed')); refresh(); },
    onError: toastFail,
  });

  const confirmRemove = (p: Pause) => Alert.alert(t('p2.subscriptions.pause.removeTitle'), t('p2.subscriptions.pause.removeBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('p2.subscriptions.pause.remove'), style: 'destructive', onPress: () => removePause.mutate(p) },
  ]);
  const confirmResume = () => Alert.alert(t('p2.subscriptions.detail.resumeTitle'), t('p2.subscriptions.detail.resumeBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('p2.subscriptions.detail.resume'), onPress: () => resume.mutate() },
  ]);

  const title = sub?.code ?? t('p2.subscriptions.detail.title');
  if (detail.isPending) return <Screen c={c} title={title}><Loading c={c} skeleton={5} /></Screen>;
  if (detail.isError || !detail.data || !sub) {
    return (
      <Screen c={c} title={title}>
        <ErrorBlock c={c} message={apiErrorMessage(detail.error, t('p2.common.loadFailed'))} onRetry={() => void detail.refetch()} />
      </Screen>
    );
  }
  const { pauses, bills } = detail.data;
  const active = sub.status === 'ACTIVE';

  const left = (
    <View style={{ gap: 12 }}>
      <SubscriptionHeader c={c} sub={sub} routeName={routeName} today={today} />
      {canManage ? (
        <ActionRow>
          {active ? (
            <>
              <PillButton c={c} icon="pause-circle-outline" label={t('p2.subscriptions.pause.pause')}
                onPress={() => { setSheetError(null); pauseKey.current = null; setPauseOpen(true); }} testID="sub-pause" />
              <PillButton c={c} tone="outline" icon="swap-horizontal" label={t('p2.subscriptions.revise.open')}
                onPress={() => { setSheetError(null); setReviseOpen(true); }} testID="sub-revise" />
              <PillButton c={c} tone="danger" icon="stop-circle-outline" label={t('p2.subscriptions.end.confirm')}
                onPress={() => { setSheetError(null); setEndOpen(true); }} testID="sub-end" />
            </>
          ) : (
            <PillButton c={c} icon="play-circle-outline" label={t('p2.subscriptions.detail.resume')} onPress={confirmResume}
              disabled={resume.isPending} testID="sub-resume" />
          )}
          <PillButton c={c} tone="outline" icon="pencil-outline" label={t('p2.subscriptions.edit.open')}
            onPress={() => { setSheetError(null); setEditOpen(true); }} testID="sub-edit" />
        </ActionRow>
      ) : null}
      <SectionLabel c={c}>{t('p2.subscriptions.detail.pauses')}</SectionLabel>
      <PausesList
        c={c}
        pauses={pauses ?? []}
        today={today}
        busy={removePause.isPending || restart.isPending}
        onRemove={canManage ? confirmRemove : undefined}
        onRestart={canManage ? (p) => { setSheetError(null); setRestartOf(p); } : undefined}
        emptyText={t('p2.subscriptions.detail.noPauses')}
      />
    </View>
  );

  const right = (
    <View style={{ gap: 12 }}>
      <MonthSwitcher c={c} period={month} onChange={setMonth} testID="month-switcher" />
      {tuition ? (
        <>
          <AttendanceMonthView c={c} data={attendance.data} period={month} />
          <StatGrid>
            <StatTile c={c} label={t('p2.subscriptions.detail.monthFee')} value={formatPaise(detail.data.month.amountPaise)} />
          </StatGrid>
        </>
      ) : (
        <DeliveryMonth c={c} month={detail.data.month} />
      )}
      <SectionLabel c={c}>{t('p2.subscriptions.detail.bills')}</SectionLabel>
      {(bills ?? []).length ? (bills ?? []).map((b) => (
        <BillRow key={b._id} c={c} bill={{ ...b, id: b._id }} />
      )) : <Text style={{ color: c.textSecondary }}>{t('p2.subscriptions.detail.noBills')}</Text>}
    </View>
  );

  return (
    <Screen
      c={c}
      rise
      title={title}
      subtitle={sub.customerName}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      <TwoPane left={left} right={right} />
      <PauseSheet
        visible={pauseOpen}
        onDismiss={() => setPauseOpen(false)}
        title={t('p2.subscriptions.pause.title')}
        confirmLabel={t('p2.subscriptions.pause.pause')}
        maxDays={settings.subscriptions.maxPauseDays}
        submitting={addPause.isPending}
        error={sheetError}
        onSubmit={(v) => addPause.mutate(v)}
        testID="pause-sheet"
      />
      <RestartSheet
        visible={!!restartOf}
        onDismiss={() => setRestartOf(null)}
        submitting={restart.isPending}
        error={sheetError}
        onSubmit={(day) => restartOf && restart.mutate({ p: restartOf, day })}
      />
      <ReviseSheet
        visible={reviseOpen}
        current={revisionOn(sub.revisions ?? [], today)}
        onDismiss={() => setReviseOpen(false)}
        submitting={revise.isPending}
        error={sheetError}
        onSubmit={(b) => revise.mutate(b)}
      />
      <EditSheet
        visible={editOpen}
        sub={sub}
        routes={routes.data ?? []}
        onDismiss={() => setEditOpen(false)}
        submitting={edit.isPending}
        error={sheetError}
        onSubmit={(b) => edit.mutate(b)}
      />
      <EndSheet visible={endOpen} onDismiss={() => setEndOpen(false)} submitting={end.isPending} error={sheetError} onSubmit={(v) => end.mutate(v)} />
    </Screen>
  );
}
