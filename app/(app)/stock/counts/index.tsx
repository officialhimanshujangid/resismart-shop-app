import React, { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../../src/hooks';
import { qk } from '../../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../../src/api/axios';
import { newIdempotencyKey } from '../../../../src/lib/idempotency';
import { formatI18nDate } from '../../../../src/i18n';
import { StockCount, stockApi } from '../../../../src/features/stock/api';
import { StartCountDialog } from '../../../../src/features/stock/components/StartCountDialog';
import { EmptyBlock, ErrorBlock, Loading, Screen } from '../../../../src/features/more/ui';
import { ActionRow, PillButton } from '../../../../src/features/p1/ui';

/** Stock counts (screen S11): the list, and "Start a count" for whoever may count. */
export default function StockCountsScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const canCount = can('STOCK_COUNT', 'FULL');
  const [startOpen, setStartOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const startKey = useRef<string | null>(null);

  const list = useQuery({ queryKey: qk.stock.counts(), queryFn: () => stockApi.listCounts({ limit: 50 }) });
  const rows = list.data?.data ?? [];
  const hasOpen = rows.some((r) => r.status === 'COUNTING' || r.status === 'REVIEW' || r.status === 'POSTING');

  const start = useMutation({
    mutationFn: (body: Parameters<typeof stockApi.createCount>[0]) => {
      if (!startKey.current) startKey.current = newIdempotencyKey('count');
      return stockApi.createCount(body, startKey.current);
    },
    onSuccess: (count) => {
      startKey.current = null;
      setStartOpen(false);
      void queryClient.invalidateQueries({ queryKey: qk.stock.all() });
      router.push({ pathname: '/stock/counts/[id]', params: { id: count._id } });
    },
    onError: (e) => { startKey.current = null; setToast(apiErrorMessage(e, t('stock.count.startFailed'))); },
  });

  const renderItem = ({ item }: { item: StockCount }) => (
    <Pressable
      onPress={() => router.push({ pathname: '/stock/counts/[id]', params: { id: item._id } })}
      style={[styles.row, { backgroundColor: c.surface }]}
      accessibilityRole="button"
      testID={`count-${item._id}`}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>{item.name ? `${item.number} · ${item.name}` : item.number}</Text>
        <Text style={[styles.meta, { color: c.textSecondary }]}>
          {t('stock.count.progress', { counted: item.countedLineCount, total: item.lineCount })} · {formatI18nDate(item.startedAt, t)}
        </Text>
      </View>
      <View style={[styles.status, { backgroundColor: c.surfaceVariant }]}>
        <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '700' }}>{t(`stock.countStatus.${item.status}`)}</Text>
      </View>
    </Pressable>
  );

  return (
    <Screen
      c={c}
      title={t('stock.count.listTitle')}
      scroll={false}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      {canCount && !hasOpen && (
        <View style={styles.controls}>
          <ActionRow>
            <PillButton c={c} icon="barcode-scan" label={t('stock.count.startNew')} onPress={() => setStartOpen(true)} testID="count-start" />
          </ActionRow>
        </View>
      )}
      {list.isPending ? (
        <Loading c={c} />
      ) : list.isError ? (
        <ErrorBlock c={c} message={apiErrorMessage(list.error, t('stock.count.loadFailed'))} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={<EmptyBlock c={c} icon="clipboard-check-outline" title={t('stock.count.emptyTitle')} body={t('stock.count.emptyBody')} />}
        />
      )}
      <StartCountDialog visible={startOpen} submitting={start.isPending} onCancel={() => setStartOpen(false)} onSubmit={(b) => start.mutate(b)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: 16, paddingTop: 4 },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radii.card, padding: 14, minHeight: 60 },
  title: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  status: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
});
