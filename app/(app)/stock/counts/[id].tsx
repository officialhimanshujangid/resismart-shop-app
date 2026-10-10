import React, { useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../../src/hooks';
import { qk } from '../../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../../src/api/axios';
import { newIdempotencyKey } from '../../../../src/lib/idempotency';
import { formatPaise } from '../../../../src/lib/money';
import { StockCountLine, StockCountReasonCode, stockApi } from '../../../../src/features/stock/api';
import { useCountQueue } from '../../../../src/features/stock/useCountQueue';
import { CountLineRow } from '../../../../src/features/stock/components/CountLineRow';
import { VarianceRow } from '../../../../src/features/stock/components/VarianceRow';
import { SetCountDialog } from '../../../../src/features/stock/components/SetCountDialog';
import { CountScanner } from '../../../../src/features/stock/components/CountScanner';
import { EmptyBlock, ErrorBlock, Loading, Screen, SectionLabel } from '../../../../src/features/more/ui';
// M20 — DS v1: sliding segment, search pill, progress bar, row stagger.
import { SearchField, Segmented } from '../../../../src/components/ui';
import { Rise } from '../../../../src/theme/motion';
import { StockBar } from '../../../../src/features/catalog/components/StockBar';
import { ActionRow, Banner, PillButton, StatGrid, StatTile, TwoPane } from '../../../../src/features/p1/ui';
import { ReasonDialog } from '../../../../src/features/p1/ReasonDialog';

/**
 * One stock count (screen S11), by its status:
 *
 *  COUNTING — scan (each scan +1, ADD mode, queued on the phone and sent when
 *             there is signal) or tap a product to type the shelf's count (SET).
 *             "Done counting" sends it for review.
 *  REVIEW   — the differences, a reason per line (manager), then Post: the
 *             counted stock replaces the system stock (confirmed first).
 *  POSTING  — being posted; Post again resumes (the server posts in chunks).
 *  POSTED / CANCELLED — the result.
 *
 * Counting needs STOCK_COUNT; reviewing, posting, reopening and cancelling
 * need STOCK_MANAGE (a counter cannot post their own count).
 */
type LineFilter = 'all' | 'uncounted' | 'counted';

export default function StockCountScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { id } = useLocalSearchParams<{ id: string }>();
  const countId = String(id);
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const canCount = can('STOCK_COUNT', 'FULL');
  const canManage = can('STOCK_MANAGE', 'FULL');

  const [filter, setFilter] = useState<LineFilter>('all');
  const [q, setQ] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [setTarget, setSetTarget] = useState<StockCountLine | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const count = useQuery({ queryKey: qk.stock.count(countId), queryFn: () => stockApi.getCount(countId) });
  const status = count.data?.status;
  const reviewing = status === 'REVIEW' || status === 'POSTING' || status === 'POSTED';
  const lineFilter = reviewing ? 'variance' : filter;
  const lines = useQuery({
    queryKey: qk.stock.countLines(countId, lineFilter, q.trim()),
    queryFn: () => stockApi.countLines(countId, { filter: lineFilter, q: q.trim() || undefined, limit: 200 }),
    enabled: !!status,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.stock.count(countId) });
  };
  const queue = useCountQueue(countId, () => refresh());

  const setCount = useMutation({
    mutationFn: ({ productId, qty }: { productId: string; qty: number }) =>
      stockApi.putEntries(countId, [{ productId, countedQty: qty, mode: 'SET' }], newIdempotencyKey('count')),
    onSuccess: () => { setSetTarget(null); refresh(); },
    onError: (e) => setToast(apiErrorMessage(e, t('stock.count.saveFailed'))),
  });
  const submit = useMutation({
    mutationFn: () => stockApi.submit(countId),
    onSuccess: () => refresh(),
    onError: (e) => setToast(apiErrorMessage(e, t('stock.count.submitFailed'))),
  });
  const reason = useMutation({
    mutationFn: ({ productId, code }: { productId: string; code: StockCountReasonCode }) => stockApi.setReason(countId, productId, { reasonCode: code }),
    onSuccess: () => refresh(),
    onError: (e) => setToast(apiErrorMessage(e, t('stock.count.saveFailed'))),
  });
  const post = useMutation({
    mutationFn: () => stockApi.post(countId),
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: qk.catalog.all() });
    },
    onError: (e) => setToast(apiErrorMessage(e, t('stock.count.postFailed'))),
  });
  const reopen = useMutation({
    mutationFn: () => stockApi.reopen(countId),
    onSuccess: () => refresh(),
    onError: (e) => setToast(apiErrorMessage(e, t('stock.count.saveFailed'))),
  });
  const cancel = useMutation({
    mutationFn: (why: string) => stockApi.cancel(countId, why),
    onSuccess: () => { setCancelOpen(false); refresh(); router.back(); },
    onError: (e) => setToast(apiErrorMessage(e, t('stock.count.saveFailed'))),
  });

  const confirmSubmit = () => {
    if (queue.unsent > 0) { setToast(t('stock.count.waitUnsent', { count: queue.unsent })); return; }
    Alert.alert(t('stock.count.submitTitle'), t('stock.count.submitBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('stock.count.submit'), onPress: () => submit.mutate() },
    ]);
  };
  const confirmPost = () => {
    Alert.alert(t('stock.count.postTitle'), t('stock.count.postBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('stock.count.post'), style: 'destructive', onPress: () => post.mutate() },
    ]);
  };

  const title = count.data?.number ?? t('stock.count.listTitle');
  if (count.isPending) return <Screen c={c} rise title={title}><Loading c={c} skeleton={3} /></Screen>;
  if (count.isError || !count.data) {
    return <Screen c={c} rise title={title}><ErrorBlock c={c} message={apiErrorMessage(count.error, t('stock.count.loadFailed'))} onRetry={() => count.refetch()} /></Screen>;
  }
  const sc = count.data;
  const rows = lines.data?.data ?? [];
  const totals = submit.data?.preview ?? sc.totals;

  const summary = (
    <View style={{ gap: 10 }}>
      <StatGrid>
        <StatTile c={c} label={t('stock.count.counted')} value={t('stock.count.progress', { counted: sc.countedLineCount, total: sc.lineCount })} />
        <StatTile c={c} label={t('stock.count.statusLabel')} value={t(`stock.countStatus.${sc.status}`)} />
        {totals ? (
          <>
            <StatTile c={c} label={t('stock.count.gain')} value={`+${totals.gainQty}`} tone={c.success} />
            <StatTile c={c} label={t('stock.count.loss')} value={`−${Math.abs(totals.lossQty)}`} tone={c.error} />
            {totals.gainValuePaise !== undefined && totals.lossValuePaise !== undefined && (
              <StatTile c={c} label={t('stock.count.netValue')} value={formatPaise(totals.gainValuePaise - Math.abs(totals.lossValuePaise))} />
            )}
          </>
        ) : null}
      </StatGrid>
      {/* M20 — how far the count has got, filling from the left. */}
      <StockBar qty={sc.countedLineCount ?? 0} max={Math.max(1, sc.lineCount ?? 0)} width={240} style={styles.progress} />

      {sc.status === 'COUNTING' && canCount && (
        <>
          {sc.blind && <Banner c={c} body={t('stock.count.blindNote')} />}
          {!queue.online && <Banner c={c} tone="warn" body={t('stock.count.offlineQueued', { count: queue.unsent })} />}
          {queue.error && <Banner c={c} tone="error" body={queue.error} testID="count-queue-error" />}
          {queue.dropped.length > 0 && (
            <Banner c={c} tone="warn" body={t('stock.count.dropped', { list: queue.dropped.map((d) => d.label).join(', ') })} />
          )}
          <ActionRow>
            <PillButton c={c} icon="barcode-scan" label={t('stock.count.scan')} onPress={() => setScannerOpen(true)} testID="count-scan" />
            {queue.unsent > 0 && (
              <PillButton c={c} tone="outline" icon="cloud-upload-outline" label={t('stock.count.sendNow', { count: queue.unsent })} onPress={() => void queue.flush()} />
            )}
            <PillButton c={c} tone="outline" icon="check-all" label={t('stock.count.submit')} onPress={confirmSubmit} disabled={submit.isPending} testID="count-submit" />
          </ActionRow>
        </>
      )}
      {sc.status === 'COUNTING' && !canCount && <Banner c={c} body={t('stock.count.viewOnly')} />}

      {(sc.status === 'REVIEW' || sc.status === 'POSTING') && canManage && (
        <>
          {sc.status === 'POSTING' && <Banner c={c} tone="warn" body={t('errors.STOCK_COUNT_POSTING_IN_PROGRESS')} />}
          <ActionRow>
            <PillButton c={c} icon="check-decagram-outline" label={post.isPending ? t('p1.saving') : t('stock.count.post')} onPress={confirmPost} disabled={post.isPending} testID="count-post" />
            {sc.status === 'REVIEW' && (
              <PillButton c={c} tone="outline" icon="undo" label={t('stock.count.reopen')} onPress={() => reopen.mutate()} disabled={reopen.isPending} />
            )}
          </ActionRow>
        </>
      )}
      {sc.status === 'REVIEW' && !canManage && <Banner c={c} body={t('stock.count.waitingManager')} />}

      {(sc.status === 'COUNTING' || sc.status === 'REVIEW') && canManage && (
        <ActionRow>
          <PillButton c={c} tone="danger" icon="close-circle-outline" label={t('stock.count.cancel')} onPress={() => setCancelOpen(true)} />
        </ActionRow>
      )}
      {sc.status === 'POSTED' && <Banner c={c} title={t('stock.count.postedTitle')} body={t('stock.count.postedBody')} />}
      {sc.status === 'CANCELLED' && <Banner c={c} tone="warn" body={t('stock.count.cancelledBody', { reason: sc.cancelReason ?? '' })} />}
    </View>
  );

  const list = (
    <View style={{ gap: 8 }}>
      <SectionLabel c={c}>{reviewing ? t('stock.count.differences') : t('stock.count.products')}</SectionLabel>
      {!reviewing && (
        <Segmented<LineFilter>
          value={filter}
          options={(['all', 'uncounted', 'counted'] as LineFilter[]).map((k) => ({ key: k, label: t(`stock.count.filter.${k}`) }))}
          onChange={setFilter}
          testID="count-filter"
        />
      )}
      <SearchField placeholder={t('stock.count.search')} value={q} onChangeText={setQ} />
      {lines.isPending ? (
        <Loading c={c} skeleton={3} />
      ) : rows.length === 0 ? (
        <EmptyBlock c={c} icon="clipboard-text-outline" title={reviewing ? t('stock.count.noDifferences') : t('stock.count.noLines')} />
      ) : reviewing ? (
        rows.map((l, i) => (
          <Rise key={l.productId} index={i < 8 ? Math.min(i, 5) + 1 : 0} duration={i < 8 ? undefined : 1}>
            <VarianceRow
              c={c}
              line={l}
              canSetReason={canManage && sc.status === 'REVIEW'}
              onReason={(code) => reason.mutate({ productId: l.productId, code })}
            />
          </Rise>
        ))
      ) : (
        rows.map((l, i) => (
          <Rise key={l.productId} index={i < 8 ? Math.min(i, 5) + 1 : 0} duration={i < 8 ? undefined : 1}>
            <CountLineRow c={c} line={l} onPress={sc.status === 'COUNTING' && canCount ? () => setSetTarget(l) : undefined} />
          </Rise>
        ))
      )}
      {(lines.data?.total ?? 0) > rows.length && (
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('stock.count.more', { shown: rows.length, total: lines.data?.total ?? 0 })}</Text>
      )}
    </View>
  );

  return (
    <Screen
      rise
      c={c}
      title={title}
      subtitle={sc.name}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      <TwoPane left={summary} right={list} />
      <CountScanner
        c={c}
        visible={scannerOpen}
        onClose={() => { setScannerOpen(false); refresh(); }}
        onScan={queue.add}
        unsent={queue.unsent}
        online={queue.online}
      />
      <SetCountDialog
        line={setTarget}
        submitting={setCount.isPending}
        onCancel={() => setSetTarget(null)}
        onSubmit={(qty) => setTarget && setCount.mutate({ productId: setTarget.productId, qty })}
      />
      <ReasonDialog
        visible={cancelOpen}
        title={t('stock.count.cancelTitle')}
        body={t('stock.count.cancelBody')}
        confirmLabel={t('stock.count.cancel')}
        submitting={cancel.isPending}
        onCancel={() => setCancelOpen(false)}
        onSubmit={(why) => cancel.mutate(why)}
        danger
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { borderRadius: radii.field, elevation: 0 },
  progress: { marginTop: 2 },
});
