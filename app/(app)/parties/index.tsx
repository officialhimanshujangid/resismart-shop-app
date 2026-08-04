import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { FAB, Searchbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { partiesApi, PartnerParty, PartySide } from '../../../src/api/parties.api';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { ChipRow, EmptyBlock, ErrorBlock, Loading } from '../../../src/features/more/ui';

/**
 * The Parties list — customers, suppliers, and the ones who are both.
 *
 * Tabs use `side`, never `kind`: a party who is `BOTH` must appear under
 * Customers AND Suppliers, and `kindsForSide()` on the server is exactly the
 * `$in` filter that keeps that true. Filtering this list by `kind === side`
 * here would silently drop every dual party from whichever tab renders
 * second, the precise bug the model's header documents.
 */

const TABS: { key: PartySide; label: string }[] = [
  { key: 'CUSTOMER', label: 'Customers' },
  { key: 'SUPPLIER', label: 'Suppliers' },
];

export default function PartiesListScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can, ready } = usePartnerEntitlements();
  const { capacity } = usePlanUsage();
  const [side, setSide] = useState<PartySide>('CUSTOMER');
  const [q, setQ] = useState('');

  const canManage = can('CUSTOMERS', 'FULL');
  const cap = capacity('max_customers');

  const query = useQuery({
    queryKey: [...qk.parties.list(q), side],
    queryFn: () => partiesApi.list({ side, q: q.trim() || undefined, isActive: 'true', page: 1, limit: 100 }),
    enabled: ready,
    staleTime: 15_000,
  });

  const renderItem = ({ item }: { item: PartnerParty }) => (
    <View style={[styles.row, { backgroundColor: c.surface }]}>
      <Pressable
        onPress={() => router.push({ pathname: '/parties/[id]', params: { id: item._id } })}
        style={styles.rowTouchable}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
            {item.phone || item.email || (item.isWalkIn ? 'Walk-in' : '—')}
            {item.kind === 'BOTH' ? ' · Customer & supplier' : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text
            style={[
              styles.balance,
              { color: item.outstandingPaise > 0 ? c.error : item.outstandingPaise < 0 ? c.success : c.textSecondary },
            ]}
          >
            {formatPaise(Math.abs(item.outstandingPaise))}
          </Text>
          <Text style={[styles.balanceLabel, { color: c.textDisabled }]}>
            {item.outstandingPaise > 0 ? 'they owe' : item.outstandingPaise < 0 ? 'you owe' : 'settled'}
          </Text>
        </View>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Parties</Text>
      </View>

      <View style={styles.controls}>
        <ChipRow c={c} value={side} options={TABS} onChange={setSide} />
        <Searchbar
          placeholder="Search name, phone, GSTIN"
          value={q}
          onChangeText={setQ}
          style={[styles.search, { backgroundColor: c.surfaceVariant }]}
          inputStyle={{ fontSize: 14 }}
        />
      </View>

      {query.isPending ? (
        <Loading c={c} />
      ) : query.isError ? (
        <ErrorBlock c={c} message={apiErrorMessage(query.error, 'Could not load your parties.')} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          data={query.data?.data ?? []}
          keyExtractor={(p) => p._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          onRefresh={() => query.refetch()}
          refreshing={query.isRefetching}
          ListEmptyComponent={
            <EmptyBlock
              c={c}
              icon="account-group-outline"
              title={q ? 'No match' : side === 'CUSTOMER' ? 'No customers yet' : 'No suppliers yet'}
              body={q ? 'Try a different name, phone or GSTIN.' : 'Add one with the button below.'}
            />
          }
        />
      )}

      {canManage && (
        <FAB
          icon="plus"
          label={cap.atLimit ? 'Limit reached' : 'Add party'}
          disabled={cap.atLimit}
          style={[styles.fab, { backgroundColor: cap.atLimit ? c.textDisabled : c.primary }]}
          color={c.textInverse}
          onPress={() => router.push({ pathname: '/parties/new', params: { kind: side } })}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: '800' },
  controls: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  search: { borderRadius: radii.field, elevation: 0 },
  listContent: { padding: 16, paddingBottom: 96, flexGrow: 1 },
  row: { borderRadius: radii.card },
  rowTouchable: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  balance: { fontSize: 14, fontWeight: '700' },
  balanceLabel: { fontSize: 10, marginTop: 1 },
  fab: { position: 'absolute', right: 16, bottom: 20, borderRadius: radii.pill },
});
