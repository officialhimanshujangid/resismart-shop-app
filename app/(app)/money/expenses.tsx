import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { formatPaise } from '../../../src/lib/money';
import { formatI18nDate } from '../../../src/i18n';
import { Expense, moneyApi } from '../../../src/features/money/api';
import { ChipRow, EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { ActionRow, PillButton, StatGrid, StatTile } from '../../../src/features/p1/ui';
import { ReasonDialog } from '../../../src/features/p1/ReasonDialog';
import { isoEndOfDay, isoOfDay, monthStartYmd, todayYmd } from '../../../src/features/p1/dates';

/**
 * Expenses (screen S20): this month or last 30 days, with the total and the
 * GST inside it. Cancelling needs DOCUMENTS_VOID (hidden otherwise, §2); a
 * closed day refuses a non-owner (409 DAY_ALREADY_CLOSED, shown as sent).
 */
type Period = 'MONTH' | 'LAST30';

export default function ExpensesScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const canVoid = can('DOCUMENTS_VOID', 'FULL');
  const [period, setPeriod] = useState<Period>('MONTH');
  const [cancelTarget, setCancelTarget] = useState<Expense | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const from = period === 'MONTH' ? monthStartYmd() : todayYmd(new Date(Date.now() - 29 * 86_400_000));
  const to = todayYmd();

  const query = useInfiniteQuery({
    queryKey: qk.money.expenses({ from, to }),
    queryFn: ({ pageParam }) => moneyApi.expenses({ from: isoOfDay(from), to: isoEndOfDay(to), status: 'ALL', page: pageParam, limit: 30 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last && last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  const rows = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p?.data ?? []), [query.data]);
  const totals = query.data?.pages?.[0]?.totals;

  const cancel = useMutation({
    mutationFn: (reason: string) => moneyApi.cancelExpense(cancelTarget!._id, reason),
    onSuccess: () => { setCancelTarget(null); void queryClient.invalidateQueries({ queryKey: qk.money.all() }); },
    onError: (e) => setToast(apiErrorMessage(e, t('money.expense.cancelFailed'))),
  });

  const renderItem = ({ item }: { item: Expense }) => {
    const off = item.status === 'CANCELLED';
    return (
      <View style={[styles.row, { backgroundColor: c.surface, opacity: off ? 0.6 : 1 }]} testID={`expense-${item._id}`}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>{item.description}</Text>
          <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
            {item.categoryName} · {formatI18nDate(item.expenseDate, t)} · {t(`money.mode.${item.mode}`)}
          </Text>
          {off ? <Text style={[styles.meta, { color: c.error }]}>{t('money.expense.cancelled')}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[styles.amount, { color: c.textPrimary, textDecorationLine: off ? 'line-through' : 'none' }]}>{formatPaise(item.amountPaise)}</Text>
          {canVoid && !off ? (
            <Text onPress={() => setCancelTarget(item)} style={[styles.link, { color: c.error }]} accessibilityRole="button">{t('money.expense.cancel')}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <Screen
      c={c}
      title={t('money.expenses')}
      scroll={false}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      <View style={styles.controls}>
        <ChipRow c={c} value={period} options={[{ key: 'MONTH', label: t('stock.home.thisMonth') }, { key: 'LAST30', label: t('stock.home.last30') }]} onChange={setPeriod} />
        {totals && (
          <StatGrid>
            <StatTile c={c} label={t('money.expense.total')} value={formatPaise(totals.amountPaise)} />
            <StatTile c={c} label={t('money.expense.gstTotal')} value={formatPaise(totals.gstPaise)} />
          </StatGrid>
        )}
        {can('EXPENSES_MANAGE', 'FULL') && (
          <ActionRow>
            <PillButton c={c} icon="plus" label={t('money.addExpense')} onPress={() => router.push('/money/expense')} />
          </ActionRow>
        )}
      </View>
      {query.isPending ? <Loading c={c} /> : query.isError && !rows.length ? (
        <ErrorBlock c={c} message={apiErrorMessage(query.error, t('money.loadFailed'))} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={<EmptyBlock c={c} icon="receipt" title={t('money.expense.empty')} />}
        />
      )}
      <ReasonDialog
        visible={!!cancelTarget}
        title={t('money.expense.cancelTitle')}
        body={cancelTarget ? `${cancelTarget.description} · ${formatPaise(cancelTarget.amountPaise)}` : undefined}
        confirmLabel={t('money.expense.cancel')}
        submitting={cancel.isPending}
        onCancel={() => setCancelTarget(null)}
        onSubmit={(r) => cancel.mutate(r)}
        danger
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radii.card, padding: 14, minHeight: 60 },
  title: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700' },
  link: { fontSize: 13, fontWeight: '600', paddingVertical: 6 },
});
