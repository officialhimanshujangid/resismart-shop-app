import React, { useMemo, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../../src/hooks';
import { apiErrorMessage } from '../../../../src/api/axios';
import { formatPaise } from '../../../../src/lib/money';
import { dayTimeLabel } from '../../../../src/features/p2/dates';
import { Card, EmptyBlock, ErrorBlock, Loading, Screen, SectionLabel } from '../../../../src/features/more/ui';
import { ActionRow, Banner, PillButton } from '../../../../src/features/p1/ui';
import { pharmacyApi, pharmacyKeys } from '../../../../src/features/pharmacy/api';
import { expiryLabel, fmtQty, istDayOfIso, productPath } from '../../../../src/features/pharmacy/logic';
import { BatchRowItem } from '../../../../src/features/pharmacy/components/BatchRowItem';
import { WriteOffSheet } from '../../../../src/features/pharmacy/components/WriteOffSheet';
import { CorrectBatchSheet } from '../../../../src/features/pharmacy/components/CorrectBatchSheet';
import { PagerFooter } from '../../../../src/features/pharmacy/components/PagerFooter';
import type { BatchMovement, BatchRow } from '../../../../src/features/pharmacy/types';

/**
 * One batch. There is no `GET /batches/:id`: the batch is read from its
 * product's batches (`?productId=` rides in the link) — which lists only
 * batches with stock, so an emptied batch shows its history alone. Actions
 * (PHARMACY_MANAGE): Write off, Correct batch.
 */
const PAGE = 30;

export default function BatchDetailScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const params = useLocalSearchParams<{ id: string; productId?: string }>();
  const id = String(params.id ?? '');
  const productId = params.productId ? String(params.productId) : '';
  const { can } = usePartnerEntitlements();
  const canManage = can('PHARMACY_MANAGE', 'FULL');
  const [writeOff, setWriteOff] = useState<BatchRow | null>(null);
  const [correct, setCorrect] = useState<BatchRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const view = useQuery({
    queryKey: pharmacyKeys.product(productId),
    queryFn: () => pharmacyApi.productBatches(productId),
    enabled: !!productId,
  });
  const batch = view.data?.batches.find((b) => b.id === id) ?? null;

  const moves = useInfiniteQuery({
    queryKey: pharmacyKeys.movements(id),
    queryFn: ({ pageParam }) => pharmacyApi.batchMovements(id, pageParam, PAGE),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    enabled: !!id,
  });
  const rows = useMemo(() => (moves.data?.pages ?? []).flatMap((p) => p.data), [moves.data]);
  const total = moves.data?.pages[moves.data.pages.length - 1]?.total ?? 0;

  const title = batch ? t('p2.pharmacy.batch.title', { batchNo: batch.batchNo }) : t('p2.pharmacy.batch.titlePlain');

  return (
    <Screen
      c={c}
      title={title}
      subtitle={batch?.productName ?? view.data?.product.name}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={2500}>{toast ?? ''}</Snackbar>}
    >
      {productId && view.isPending ? <Loading c={c} /> : null}
      {view.isError ? (
        <ErrorBlock c={c} message={apiErrorMessage(view.error, t('p2.pharmacy.batch.loadFailed'))} onRetry={() => view.refetch()} />
      ) : null}
      {batch ? (
        <>
          <BatchRowItem c={c} row={batch} testID="batch-card" />
          <Card c={c}>
            {batch.mfgDate ? <Line c={c} text={t('p2.pharmacy.batch.mfg', { date: istDayOfIso(batch.mfgDate) })} /> : null}
            <Line c={c} text={t('p2.pharmacy.batch.expiry', { expiry: expiryLabel(batch.expiryDate), day: istDayOfIso(batch.expiryDate) })} />
            {typeof batch.unitCostPaise === 'number' ? (
              <Line c={c} text={t('p2.pharmacy.batch.cost', { value: formatPaise(batch.unitCostPaise) })} />
            ) : null}
          </Card>
          {canManage ? (
            <ActionRow>
              <PillButton c={c} tone="danger" icon="delete-outline" label={t('p2.pharmacy.writeOff.action')} onPress={() => setWriteOff(batch)} testID="batch-writeoff" />
              <PillButton c={c} tone="outline" icon="pencil-outline" label={t('p2.pharmacy.correct.action')} onPress={() => setCorrect(batch)} testID="batch-correct" />
            </ActionRow>
          ) : null}
        </>
      ) : !view.isPending && !view.isError ? (
        <Banner c={c} body={t('p2.pharmacy.batch.notOnShelf')} testID="batch-not-on-shelf" />
      ) : null}
      {productId ? (
        <ActionRow>
          <PillButton c={c} tone="outline" icon="pill" label={t('p2.pharmacy.product.title')} onPress={() => router.push(productPath(productId) as Href)} />
        </ActionRow>
      ) : null}

      <SectionLabel c={c}>{t('p2.pharmacy.batch.history')}</SectionLabel>
      {moves.isPending ? (
        <Loading c={c} />
      ) : moves.isError && rows.length === 0 ? (
        <ErrorBlock c={c} message={apiErrorMessage(moves.error, t('p2.pharmacy.batch.loadFailed'))} onRetry={() => moves.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBlock c={c} icon="history" title={t('p2.pharmacy.batch.noHistory')} />
      ) : (
        rows.map((m) => <MovementRow key={m.id} c={c} m={m} />)
      )}
      <PagerFooter
        c={c}
        shown={rows.length}
        total={total}
        hasMore={!!moves.hasNextPage}
        loading={moves.isFetchingNextPage}
        onMore={() => void moves.fetchNextPage()}
      />

      <WriteOffSheet batch={writeOff} onDismiss={() => setWriteOff(null)} onDone={() => setToast(t('p2.pharmacy.writeOff.done'))} />
      <CorrectBatchSheet batch={correct} onDismiss={() => setCorrect(null)} onDone={() => setToast(t('p2.pharmacy.correct.done'))} />
    </Screen>
  );
}

function Line({ c, text }: { c: ReturnType<typeof themeColors>; text: string }) {
  return <Text style={{ color: c.textPrimary, fontSize: 14 }}>{text}</Text>;
}

function MovementRow({ c, m }: { c: ReturnType<typeof themeColors>; m: BatchMovement }) {
  const { t } = useTranslation();
  const signed = m.qty > 0 ? `+${fmtQty(m.qty)}` : fmtQty(m.qty);
  return (
    <View style={[styles.move, { backgroundColor: c.surface, borderColor: c.divider }]} testID={`move-${m.id}`}>
      <View style={styles.moveTop}>
        <Text style={{ flex: 1, minWidth: 0, color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>
          {t(`p2.pharmacy.batch.kind.${m.kind}`)}{m.sourceRef ? ` · ${m.sourceRef}` : ''}{m.isReversal ? ` · ${t('p2.pharmacy.batch.reversal')}` : ''}
        </Text>
        <Text style={{ color: m.qty < 0 ? c.error : c.success, fontWeight: '700' }}>{signed}</Text>
      </View>
      {m.reason ? <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={2}>{m.reason}</Text> : null}
      <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
        {t('p2.pharmacy.batch.moveMeta', { left: fmtQty(m.balanceAfter), when: dayTimeLabel(m.createdAt, t), name: m.createdByName })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  move: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 2 },
  moveTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
