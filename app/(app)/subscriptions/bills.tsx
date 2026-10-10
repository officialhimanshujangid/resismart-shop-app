import React, { useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { ChipRow, Screen } from '../../../src/features/more/ui';
import { ActionRow, Banner } from '../../../src/features/p1/ui';
// M06b — Design System v1 kit (green, light + dark, reduce-motion aware).
import { Button, EmptyState, ErrorState, SkeletonList } from '../../../src/components/ui';
import { Rise } from '../../../src/theme/motion';
import { istToday, monthLabel, periodOf } from '../../../src/features/p2/dates';
import { subKeys, subscriptionsApi } from '../../../src/features/subscriptions/api';
import { billRunSummary, defaultBillPeriod, isPeriod } from '../../../src/features/subscriptions/logic';
import { BILL_STATUSES, BillStatus, BillOutcome } from '../../../src/features/subscriptions/types';
import { MonthSwitcher } from '../../../src/features/subscriptions/components/MonthCalendar';
import { BillRow } from '../../../src/features/subscriptions/components/BillRow';

/**
 * Monthly bills. The morning run bills each subscription on its bill day; this
 * screen shows the result per month and lets a manager "Make the bills" by hand
 * (SUBSCRIPTIONS_MANAGE + INVOICING_MANAGE) or retry one that failed / was
 * skipped / is still a draft. Opens on the previous month, or the month a
 * notification named (`?period=&status=`).
 */
type StatusKey = 'ALL' | BillStatus;

export default function BillsScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const params = useLocalSearchParams<{ period?: string; status?: string }>();
  const { can } = usePartnerEntitlements();
  const canRun = can('SUBSCRIPTIONS_MANAGE', 'FULL') && can('INVOICING_MANAGE', 'FULL');
  const today = istToday();
  const [period, setPeriod] = useState(isPeriod(params.period) ? params.period : defaultBillPeriod(today));
  const [status, setStatus] = useState<StatusKey>(
    typeof params.status === 'string' && (BILL_STATUSES as readonly string[]).includes(params.status) ? params.status as BillStatus : 'ALL',
  );
  const [summary, setSummary] = useState<BillOutcome[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const runKey = useRef<{ period: string; key: string } | null>(null);
  const retryKeys = useRef<Record<string, string>>({});
  const qc = useQueryClient();

  const bills = useQuery({
    queryKey: subKeys.bills(period, status),
    queryFn: () => subscriptionsApi.bills({ period, ...(status !== 'ALL' ? { status } : {}) }),
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['p2', 'subscriptions', 'bills'] }); };

  const run = useMutation({
    mutationFn: () => {
      if (!runKey.current || runKey.current.period !== period) runKey.current = { period, key: newIdempotencyKey('subbills') };
      return subscriptionsApi.runBills(period, runKey.current.key);
    },
    onSuccess: (r) => { runKey.current = null; setSummary(r?.results ?? []); refresh(); },
    onError: (e) => setToast(apiErrorMessage(e, t('p2.subscriptions.bills.runFailed'))),
  });
  const retry = useMutation({
    mutationFn: (billId: string) => {
      retryKeys.current[billId] = retryKeys.current[billId] ?? newIdempotencyKey('subbill');
      return subscriptionsApi.retryBill(billId, retryKeys.current[billId]);
    },
    onSuccess: (r, billId) => {
      delete retryKeys.current[billId];
      const out = r?.results?.[0];
      setToast(out ? t(`p2.subscriptions.billStatus.${out.status}`) + (out.number ? ` · ${out.number}` : '') : t('common.done'));
      refresh();
    },
    // The key is kept: a retry of the same tap is the same request (a refused one was never stored).
    onError: (e) => setToast(apiErrorMessage(e, t('p2.subscriptions.bills.runFailed'))),
  });

  const confirmRun = () => Alert.alert(
    t('p2.subscriptions.bills.runTitle'),
    t('p2.subscriptions.bills.runBody', { month: monthLabel(period, t) }),
    [{ text: t('common.cancel'), style: 'cancel' }, { text: t('p2.subscriptions.bills.run'), onPress: () => run.mutate() }],
  );

  const counts = summary ? billRunSummary(summary) : null;
  const rows = bills.data ?? [];
  const header = (
    <Rise index={0} style={styles.header}>
      <MonthSwitcher c={c} period={period} onChange={(p) => { setPeriod(p); setSummary(null); }} max={periodOf(today)} testID="bills-month" />
      <ChipRow<StatusKey>
        c={c}
        value={status}
        onChange={setStatus}
        options={(['ALL', ...BILL_STATUSES.filter((s) => s !== 'CLAIMED')] as StatusKey[]).map((k) => ({
          key: k, label: k === 'ALL' ? t('p2.common.all') : t(`p2.subscriptions.billStatus.${k}`),
        }))}
      />
      {canRun ? (
        <ActionRow>
          <Button icon="file-document-edit-outline" label={run.isPending ? t('p2.subscriptions.bills.running') : t('p2.subscriptions.bills.run')}
            onPress={confirmRun} disabled={run.isPending} loading={run.isPending} testID="bills-run" />
        </ActionRow>
      ) : null}
      {counts ? (
        <Banner
          c={c}
          testID="bills-summary"
          title={t('p2.subscriptions.bills.summaryTitle', { count: summary?.length ?? 0 })}
          body={(Object.keys(counts) as BillStatus[]).map((s) => `${t(`p2.subscriptions.billStatus.${s}`)}: ${counts[s]}`).join(' · ') || t('p2.subscriptions.bills.nothing')}
        />
      ) : null}
    </Rise>
  );

  const empty = bills.isPending ? <SkeletonList rows={3} />
    : bills.isError ? <ErrorState message={apiErrorMessage(bills.error, t('p2.common.loadFailed'))} onRetry={() => void bills.refetch()} />
      : <EmptyState icon="file-document-outline" title={t('p2.subscriptions.bills.empty')} />;

  return (
    <Screen
      c={c}
      title={t('p2.subscriptions.bills.title')}
      scroll={false}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      <FlatList
        data={rows}
        keyExtractor={(b) => b.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={Gap}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => {
          const row = (
            <BillRow c={c} bill={item} showCustomer onRetry={canRun ? () => retry.mutate(item.id) : undefined}
              retrying={retry.isPending && retry.variables === item.id} />
          );
          // The first screenful rises in; a long month never animates row by row.
          return index < 8 ? <Rise index={Math.min(index, 4) + 1} distance={10}>{row}</Rise> : row;
        }}
      />
    </Screen>
  );
}

function Gap() { return <View style={{ height: 8 }} />; }

const styles = StyleSheet.create({
  header: { gap: 10, marginBottom: 10 },
  list: { padding: 16, paddingBottom: 40 },
});
