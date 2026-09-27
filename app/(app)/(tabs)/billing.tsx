import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Button, Searchbar, SegmentedButtons, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii, ColorScheme } from '../../../src/constants/colors';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { formatPaise } from '../../../src/lib/money';
import { documentsApi, documentStatusGroup } from '../../../src/features/billing/documents.api';
import { useOfflineDrafts } from '../../../src/features/billing/useOfflineDrafts';
import {
  DocumentDirection, PURCHASE_DOCUMENT_TYPES, PartnerDocumentRecord, SALES_DOCUMENT_TYPES, documentTypeLabelKey,
} from '../../../src/features/billing/types';
import { useIsGstRegistered } from '../../../src/features/billing/useGstRegistration';
import { DocumentStatusChip } from '../../../src/features/billing/components/StatusChip';
import { UsageMeter } from '../../../src/features/billing/components/UsageMeter';
import { toHref } from '../../../src/features/billing/routeHref';
import { Hero, GlassStat } from '../../../src/components/Hero';
import { HelpButton } from '../../../src/features/help/HelpButton';
import { ErrorBlock } from '../../../src/features/more/ui';
import { apiErrorMessage } from '../../../src/api/axios';

/**
 * Billing: the two-tap invoice, offline drafts and WhatsApp share
 * (PARTNERS_PLAN §12.5, build spec §4). This tab is only reachable once
 * `(tabs)/_layout.tsx` has already checked `INVOICING` + `INVOICING_VIEW` —
 * see that file's header — but the "New Invoice" action below still checks
 * `INVOICING_MANAGE` at FULL itself: READ opened this tab, and READ is not
 * permission to raise a bill.
 */

type FilterKey = 'ALL' | 'DRAFT' | 'UNPAID' | 'ISSUED';

/**
 * The filter VALUES are this screen's own state and are turned into a status
 * CSV by `filterToStatus` below; only the button copy is looked up.
 */
const FILTERS: { value: FilterKey; labelKey: string }[] = [
  { value: 'ALL', labelKey: 'billing.list.filterAll' },
  { value: 'ISSUED', labelKey: 'billing.list.filterIssued' },
  { value: 'UNPAID', labelKey: 'billing.list.filterUnpaid' },
  { value: 'DRAFT', labelKey: 'billing.list.filterDraft' },
];

function filterToStatus(filter: FilterKey): string | undefined {
  if (filter === 'ALL') return undefined;
  if (filter === 'DRAFT') return documentStatusGroup.DRAFT;
  if (filter === 'UNPAID') return documentStatusGroup.UNPAID;
  return documentStatusGroup.ISSUED;
}

export default function BillingScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const { capacity } = usePlanUsage();
  const { pendingCount, online, syncing, syncPending } = useOfflineDrafts();
  const isGstRegistered = useIsGstRegistered();

  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [search, setSearch] = useState('');
  // C5 — All/Sales/Purchase, on top of the status filter above. 'ALL' asks for
  // every one of the nine types at once (the server accepts the CSV either way).
  const [direction, setDirection] = useState<'ALL' | DocumentDirection>('ALL');

  const filters = useMemo(
    () => ({
      status: filterToStatus(filter),
      type: direction === 'ALL' ? undefined : (direction === 'SALES' ? SALES_DOCUMENT_TYPES : PURCHASE_DOCUMENT_TYPES).join(','),
      q: search.trim() || undefined,
      limit: 30,
    }),
    [filter, direction, search],
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

  /**
   * Why there are no bills, when there are no bills for a reason other than
   * "none raised yet".
   *
   * `isPending` alone cannot tell a partner apart from a failed request, so a
   * 500 or a dropped connection used to arrive as "No bills here yet" — a
   * ledger reporting itself empty. `isPaused` covers the offline case, where
   * `onlineManager` (see `lib/queryClient.ts`) deliberately holds the request
   * rather than firing it into a dead radio.
   */
  const loadError = query.isError
    ? apiErrorMessage(query.error, t('billing.list.loadFailed'))
    : query.isPending && query.isPaused
      ? t('billing.list.noConnection')
      : null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <Hero
        action={<HelpButton c={c} variant="hero" />}
        isDark={isDark}
        eyebrow={t('billing.list.eyebrow')}
        title={t('billing.list.title')}
        subtitle={online ? t('billing.list.subtitleOnline') : t('billing.list.subtitleOffline')}
        style={styles.hero}
      >
        {query.data ? (
          <GlassStat icon="file-document-outline" label={t('billing.list.inThisView')} value={String(query.data.total)} />
        ) : null}
      </Hero>

      {pendingCount > 0 && (
        <Surface style={[styles.draftBanner, { backgroundColor: c.surfaceVariant }]} elevation={0}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.draftBannerTitle, { color: c.textPrimary }]}>
              {t('billing.list.waitingToSync', { count: pendingCount })}
            </Text>
            <Text style={[styles.draftBannerBody, { color: c.textSecondary }]}>
              {syncing ? t('billing.list.syncingNow') : online ? t('billing.list.willSyncShortly') : t('billing.list.willSyncOnline')}
            </Text>
          </View>
          <Button mode="text" compact onPress={() => router.push('/(app)/billing/drafts')}>
            {t('billing.list.view')}
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
            {t('billing.list.newInvoice')}
          </Button>
        </View>
      )}

      <Searchbar
        placeholder={t('billing.list.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
        style={[styles.search, { backgroundColor: c.surface }]}
        inputStyle={{ fontSize: 14 }}
      />

      <View style={styles.filterRow}>
        <SegmentedButtons
          value={direction}
          onValueChange={(v) => setDirection(v as 'ALL' | DocumentDirection)}
          buttons={[
            { value: 'ALL', label: t('billing.list.dirAll') },
            { value: 'SALES', label: t('billing.list.dirSales') },
            { value: 'PURCHASE', label: t('billing.list.dirPurchase') },
          ]}
          density="small"
        />
      </View>

      <View style={styles.filterRow}>
        <SegmentedButtons
          value={filter}
          onValueChange={(v) => setFilter(v as FilterKey)}
          buttons={FILTERS.map((f) => ({ value: f.value, label: t(f.labelKey) }))}
          density="small"
        />
      </View>

      {loadError ? (
        <ErrorBlock c={c} message={loadError} onRetry={onRefresh} />
      ) : query.isPending ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>{t('billing.list.emptyTitle')}</Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
            {canManage ? t('billing.list.emptyManage') : t('billing.list.emptyRead')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <DocumentRow item={item} c={c} isGstRegistered={isGstRegistered} onPress={() => router.push(toHref(`/(app)/billing/${item._id}`))} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function DocumentRow({
  item, c, isGstRegistered, onPress,
}: {
  item: PartnerDocumentRecord;
  c: ColorScheme;
  /** Business Settings' answer — renames an untaxed TAX_INVOICE to a bill of supply. */
  isGstRegistered: boolean | undefined;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress}>
      <Surface style={[styles.row, { backgroundColor: c.surface }]} elevation={1}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowNumber, { color: c.textPrimary }]}>
            {item.number ?? t('billing.list.draftNumber', { type: t(documentTypeLabelKey(item.type, isGstRegistered, item.totals.taxPaise)) })}
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
  hero: { marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  draftBanner: {
    marginHorizontal: 20, marginTop: 12, borderRadius: radii.card, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  draftBannerTitle: { fontSize: 13, fontWeight: '600' },
  draftBannerBody: { fontSize: 12, marginTop: 2 },
  newInvoiceRow: { paddingHorizontal: 20, marginTop: 14, gap: 8 },
  newInvoiceButton: { borderRadius: radii.field },
  search: { marginHorizontal: 20, marginTop: 12, borderRadius: radii.field },
  filterRow: { paddingHorizontal: 20, marginTop: 10 },
  list: { padding: 20, paddingTop: 10, gap: 10 },
  row: { borderRadius: radii.card, padding: 14 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowNumber: { fontSize: 14, fontWeight: '600' },
  rowAmount: { fontSize: 15, fontWeight: '600' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  rowParty: { fontSize: 13, flex: 1, marginRight: 8 },
  empty: { padding: 32, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyBody: { fontSize: 13, textAlign: 'center' },
});
