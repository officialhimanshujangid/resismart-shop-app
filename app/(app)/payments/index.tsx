import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, useColorScheme } from 'react-native';
import { ActivityIndicator, Button, IconButton, Snackbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { formatI18nDate } from '../../../src/i18n';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { paymentsApi } from '../../../src/features/payments/payments.api';
import {
  PAYMENT_MODE_LABEL_KEY, PaymentDirection, PaymentRecord, partyNameOf,
} from '../../../src/features/payments/types';
import { ChipRow, EmptyBlock, ErrorBlock, Loading } from '../../../src/features/more/ui';
import { toHref } from '../../../src/features/billing/routeHref';
import { Hero, GlassStat } from '../../../src/components/Hero';
import { HelpButton } from '../../../src/features/help/HelpButton';

/**
 * Payments, both directions — C1. `IN`/`OUT` are two tabs of the SAME model
 * (see `types.ts`'s header); this screen and `billing/[id].tsx`'s
 * record-on-a-document action are the two places `POST /partners/me/payments`
 * is reached from this app. Mirrors web `payments/page.tsx`.
 */

const PAGE_LIMIT = 25;

export default function PaymentsScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const canManage = can('INVOICING_MANAGE', 'FULL');

  const [direction, setDirection] = useState<PaymentDirection>('IN');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PaymentRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    setRows([]);
  }, [direction]);

  const filters = useMemo(() => ({ direction, page, limit: PAGE_LIMIT }), [direction, page]);
  const query = useQuery({
    queryKey: qk.payments.list(filters),
    queryFn: () => paymentsApi.list(filters),
  });

  useEffect(() => {
    if (!query.data) return;
    setRows((prev) => {
      if (query.data.page === 1) return query.data.data;
      const seen = new Set(prev.map((p) => p._id));
      return [...prev, ...query.data.data.filter((p) => !seen.has(p._id))];
    });
  }, [query.data]);

  const total = query.data?.total ?? 0;
  const hasMore = rows.length < total;
  const loadMore = useCallback(() => {
    if (query.isFetching || !hasMore) return;
    setPage((p) => p + 1);
  }, [query.isFetching, hasMore]);

  const onRefresh = useCallback(() => {
    setPage(1);
    void queryClient.invalidateQueries({ queryKey: qk.payments.all() });
  }, [queryClient]);

  const cancelPayment = useCallback(
    async (payment: PaymentRecord) => {
      setCancellingId(payment._id);
      try {
        await paymentsApi.cancel(payment._id);
        setRows((prev) => prev.map((p) => (p._id === payment._id ? { ...p, status: 'CANCELLED' } : p)));
        void queryClient.invalidateQueries({ queryKey: qk.payments.all() });
        setToast(t('payments.list.cancelledToast'));
      } catch (e: unknown) {
        setToast(apiErrorMessage(e, t('payments.list.cancelFailed')));
      } finally {
        setCancellingId(null);
      }
    },
    [queryClient, t],
  );

  if (!can('INVOICING_VIEW', 'READ')) {
    // The layout already redirects this case; this is only the render frame
    // between "ready" flipping true and the redirect committing.
    return null;
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <Hero
        action={<HelpButton c={c} variant="hero" />}
        isDark={isDark}
        eyebrow={t('payments.list.eyebrow')}
        title={t('payments.list.title')}
        subtitle={t('payments.list.subtitle')}
        style={styles.hero}
      >
        {query.data ? (
          <GlassStat
            icon={direction === 'IN' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
            label={direction === 'IN' ? t('payments.list.in') : t('payments.list.out')}
            value={String(query.data.total)}
          />
        ) : null}
      </Hero>

      <View style={styles.filterRow}>
        <ChipRow
          c={c}
          value={direction}
          onChange={setDirection}
          // `IN`/`OUT` are the wire `direction` — only the labels are translated.
          options={[
            { key: 'IN', label: t('payments.list.in') },
            { key: 'OUT', label: t('payments.list.out') },
          ]}
        />
        {canManage && (
          <IconButton
            icon="plus"
            mode="contained"
            size={20}
            onPress={() => router.push(toHref(`/(app)/payments/new?direction=${direction}`))}
            accessibilityLabel={t('payments.list.recordA11y')}
          />
        )}
      </View>

      {query.isPending ? (
        <Loading c={c} label={t('payments.list.loading')} />
      ) : query.isError ? (
        <ErrorBlock c={c} message={apiErrorMessage(query.error, t('payments.list.loadFailed'))} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBlock
          c={c}
          icon="wallet-outline"
          title={direction === 'IN' ? t('payments.list.emptyInTitle') : t('payments.list.emptyOutTitle')}
          body={direction === 'IN'
            ? t('payments.list.emptyInBody')
            : t('payments.list.emptyOutBody')}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isFetching && page === 1} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListFooterComponent={query.isFetching && page > 1 ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item }) => (
            <PaymentRow
              item={item}
              c={c}
              direction={direction}
              // P1 §2: cancelling a payment needs DOCUMENTS_VOID too — hidden without it.
              canManage={canManage && can('DOCUMENTS_VOID', 'FULL')}
              cancelling={cancellingId === item._id}
              onCancel={() => cancelPayment(item)}
            />
          )}
        />
      )}

      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3500}>
        {toast}
      </Snackbar>
    </SafeAreaView>
  );
}

function PaymentRow({
  item, c, direction, canManage, cancelling, onCancel,
}: {
  item: PaymentRecord;
  c: ReturnType<typeof themeColors>;
  direction: PaymentDirection;
  canManage: boolean;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const cancelled = item.status === 'CANCELLED';
  return (
    <View style={[styles.row, { backgroundColor: c.surface }]}>
      <View style={[styles.rowIcon, { backgroundColor: direction === 'IN' ? c.success + '1f' : c.error + '1f' }]}>
        <IconButtonGlyph direction={direction} color={direction === 'IN' ? c.success : c.error} />
      </View>
      <View style={{ flex: 1 }}>
        {/* The party's own name, straight off the populated row. `partyNameOf`
            returns '' on the unpopulated shape — see its header for why the
            placeholder is chosen here rather than in that module. */}
        <Text style={[styles.partyName, { color: c.textPrimary }]} numberOfLines={1}>
          {partyNameOf(item) || t('payments.list.unknownParty')}
        </Text>
        <Text style={[styles.meta, { color: c.textSecondary }]}>
          {/* `formatI18nDate`, not `toLocaleDateString('en-IN')`: the month is a
              WORD, the locale was pinned to English whatever the partner chose,
              and Hermes on Android cannot be relied on for `Intl` month names
              at all — see `src/i18n/index.ts#formatI18nDate`. */}
          {t('payments.list.rowMeta', {
            date: formatI18nDate(item.receivedAt, t),
            mode: t(PAYMENT_MODE_LABEL_KEY[item.mode]),
          })}
        </Text>
        {item.onAccountPaise > 0 && !cancelled && (
          <Text style={[styles.onAccount, { color: c.primary }]}>
            {t('payments.list.onAccount', { amount: formatPaise(item.onAccountPaise) })}
          </Text>
        )}
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.amount, { color: c.textPrimary }]}>{formatPaise(item.amountPaise)}</Text>
        {cancelled ? (
          <Text style={[styles.cancelledLabel, { color: c.textDisabled }]}>{t('payments.list.cancelledLabel')}</Text>
        ) : canManage ? (
          <Button
            mode="text"
            compact
            textColor={c.error}
            loading={cancelling}
            disabled={cancelling}
            onPress={onCancel}
            style={styles.cancelBtn}
            labelStyle={styles.cancelLabel}
          >
            {t('common.cancel')}
          </Button>
        ) : null}
      </View>
    </View>
  );
}

/** Tiny inline glyph rather than pulling in another icon dependency for two arrows. */
function IconButtonGlyph({ direction, color }: { direction: PaymentDirection; color: string }) {
  return (
    <Text style={{ color, fontSize: 16, fontWeight: '600' }}>{direction === 'IN' ? '↓' : '↑'}</Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  filterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8,
  },
  list: { padding: 16, paddingTop: 4, gap: 10, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radii.card, padding: 14 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  partyName: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  onAccount: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  amount: { fontSize: 15, fontWeight: '600' },
  cancelledLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  cancelBtn: { margin: 0, minWidth: 0 },
  cancelLabel: { fontSize: 11, marginVertical: 0, marginHorizontal: 4 },
});
