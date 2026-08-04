import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Button, Searchbar, SegmentedButtons, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { themeColors, radii, ColorScheme } from '../../../src/constants/colors';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { formatPaise } from '../../../src/lib/money';
import { documentsApi, documentStatusGroup } from '../../../src/features/billing/documents.api';
import { useOfflineDrafts } from '../../../src/features/billing/useOfflineDrafts';
import { DOCUMENT_TYPE_LABEL, PartnerDocumentRecord } from '../../../src/features/billing/types';
import { DocumentStatusChip } from '../../../src/features/billing/components/StatusChip';
import { UsageMeter } from '../../../src/features/billing/components/UsageMeter';
import { toHref } from '../../../src/features/billing/routeHref';

/**
 * Billing: the two-tap invoice, offline drafts and WhatsApp share
 * (PARTNERS_PLAN §12.5, build spec §4). This tab is only reachable once
 * `(tabs)/_layout.tsx` has already checked `INVOICING` + `INVOICING_VIEW` —
 * see that file's header — but the "New Invoice" action below still checks
 * `INVOICING_MANAGE` at FULL itself: READ opened this tab, and READ is not
 * permission to raise a bill.
 */

type FilterKey = 'ALL' | 'DRAFT' | 'UNPAID' | 'ISSUED';

const FILTERS: { value: FilterKey; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ISSUED', label: 'Issued' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'DRAFT', label: 'Draft' },
];

function filterToStatus(filter: FilterKey): string | undefined {
  if (filter === 'ALL') return undefined;
  if (filter === 'DRAFT') return documentStatusGroup.DRAFT;
  if (filter === 'UNPAID') return documentStatusGroup.UNPAID;
  return documentStatusGroup.ISSUED;
}

export default function BillingScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const { capacity } = usePlanUsage();
  const { pendingCount, online, syncing, syncPending } = useOfflineDrafts();

  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [search, setSearch] = useState('');

  const filters = useMemo(
    () => ({ status: filterToStatus(filter), q: search.trim() || undefined, limit: 30 }),
    [filter, search],
  );

  const query = useQuery({
    queryKey: qk.billing.documents(filters),
    queryFn: () => documentsApi.list(filters),
    staleTime: 15_000,
  });

  const rows = query.data?.data ?? [];
  const canManage = can('INVOICING_MANAGE', 'FULL');
  const invoiceCapacity = capacity('max_invoices_month');

  const onRefresh = useCallback(() => {
    void query.refetch();
    void syncPending();
  }, [query, syncPending]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Billing</Text>
        {!online && (
          <Text style={[styles.offlineHint, { color: c.warning }]}>No connection — bills save on this device</Text>
        )}
      </View>

      {pendingCount > 0 && (
        <Surface style={[styles.draftBanner, { backgroundColor: c.surfaceVariant }]} elevation={0}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.draftBannerTitle, { color: c.textPrimary }]}>
              {pendingCount} bill{pendingCount === 1 ? '' : 's'} waiting to sync
            </Text>
            <Text style={[styles.draftBannerBody, { color: c.textSecondary }]}>
              {syncing ? 'Syncing now…' : online ? 'Will sync shortly.' : 'Will sync when you are back online.'}
            </Text>
          </View>
          <Button mode="text" compact onPress={() => router.push('/(app)/billing/drafts')}>
            View
          </Button>
        </Surface>
      )}

      {canManage && (
        <View style={styles.newInvoiceRow}>
          <UsageMeter capacity={invoiceCapacity} c={c} />
          <Button
            mode="contained"
            icon="plus"
            onPress={() => router.push('/(app)/billing/new')}
            disabled={invoiceCapacity.atLimit}
            style={styles.newInvoiceButton}
          >
            New invoice
          </Button>
        </View>
      )}

      <Searchbar
        placeholder="Search number or customer"
        value={search}
        onChangeText={setSearch}
        style={[styles.search, { backgroundColor: c.surface }]}
        inputStyle={{ fontSize: 14 }}
      />

      <View style={styles.filterRow}>
        <SegmentedButtons
          value={filter}
          onValueChange={(v) => setFilter(v as FilterKey)}
          buttons={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          density="small"
        />
      </View>

      {query.isPending ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No bills here yet</Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
            {canManage
              ? 'Tap "New invoice" to bill your first customer.'
              : 'Nothing has been billed in this view yet.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <DocumentRow item={item} c={c} onPress={() => router.push(toHref(`/(app)/billing/${item._id}`))} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function DocumentRow({
  item, c, onPress,
}: {
  item: PartnerDocumentRecord;
  c: ColorScheme;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <Surface style={[styles.row, { backgroundColor: c.surface }]} elevation={1}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowNumber, { color: c.textPrimary }]}>
            {item.number ?? `${DOCUMENT_TYPE_LABEL[item.type]} · draft`}
          </Text>
          <Text style={[styles.rowAmount, { color: c.textPrimary }]}>{formatPaise(item.totals.grandPaise)}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text style={[styles.rowParty, { color: c.textSecondary }]} numberOfLines={1}>
            {item.partySnapshot.name}
          </Text>
          <DocumentStatusChip status={item.status} c={c} />
        </View>
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, gap: 2 },
  title: { fontSize: 24, fontWeight: '800' },
  offlineHint: { fontSize: 12, fontWeight: '600' },
  draftBanner: {
    marginHorizontal: 20, marginTop: 12, borderRadius: radii.card, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  draftBannerTitle: { fontSize: 13, fontWeight: '700' },
  draftBannerBody: { fontSize: 12, marginTop: 2 },
  newInvoiceRow: { paddingHorizontal: 20, marginTop: 14, gap: 8 },
  newInvoiceButton: { borderRadius: radii.field },
  search: { marginHorizontal: 20, marginTop: 12, borderRadius: radii.field },
  filterRow: { paddingHorizontal: 20, marginTop: 10 },
  list: { padding: 20, paddingTop: 10, gap: 10 },
  row: { borderRadius: radii.card, padding: 14 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowNumber: { fontSize: 14, fontWeight: '700' },
  rowAmount: { fontSize: 15, fontWeight: '800' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  rowParty: { fontSize: 13, flex: 1, marginRight: 8 },
  empty: { padding: 32, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyBody: { fontSize: 13, textAlign: 'center' },
});
