import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { FitSegments } from '../../../src/components/FitSegments'; // >>> WEB-UI
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii } from '../../../src/constants/colors';
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
import { apiErrorMessage } from '../../../src/api/axios';
// M06b — Design System v1 kit (green, light + dark, reduce-motion aware).
import { Button, Card, EmptyState, ErrorState, Money, SearchField, SkeletonList } from '../../../src/components/ui';
import { Rise } from '../../../src/theme/motion';
import { useAppTheme } from '../../../src/theme/useAppTheme';

/**
 * Billing: the two-tap invoice, offline drafts and WhatsApp share
 * (PARTNERS_PLAN §12.5, build spec §4). This tab is only reachable once
 * `(tabs)/_layout.tsx` has already checked `INVOICING` + `INVOICING_VIEW` —
 * see that file's header — but the "New Invoice" action below still checks
 * `INVOICING_MANAGE` at FULL itself: READ opened this tab, and READ is not
 * permission to raise a bill.
 *
 * M06b (2026-10-09):
 *  - the list PAGES now. It asked for the newest 30 and stopped there, so a
 *    shop with 31 bills could not scroll to its oldest one (the web pages);
 *    the next 30 load as the list nears its end (`useInfiniteQuery`).
 *  - the search box waits for the typing to settle (`useDeferredValue`)
 *    instead of one request per keystroke;
 *  - kit states (skeleton rows, error with Retry, empty), kit cards and
 *    buttons on the DS tokens, and the first screenful rises in.
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

const PAGE = 30;

function filterToStatus(filter: FilterKey): string | undefined {
  if (filter === 'ALL') return undefined;
  if (filter === 'DRAFT') return documentStatusGroup.DRAFT;
  if (filter === 'UNPAID') return documentStatusGroup.UNPAID;
  return documentStatusGroup.ISSUED;
}

export default function BillingScreen() {
  const { t } = useTranslation();
  const { isDark, c, ds, status } = useAppTheme();
  const { can } = usePartnerEntitlements();
  const { capacity } = usePlanUsage();
  const { pendingCount, online, syncing, syncPending } = useOfflineDrafts();
  const isGstRegistered = useIsGstRegistered();

  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  // C5 — All/Sales/Purchase, on top of the status filter above. 'ALL' asks for
  // every one of the nine types at once (the server accepts the CSV either way).
  const [direction, setDirection] = useState<'ALL' | DocumentDirection>('ALL');

  const filters = useMemo(
    () => ({
      status: filterToStatus(filter),
      type: direction === 'ALL' ? undefined : (direction === 'SALES' ? SALES_DOCUMENT_TYPES : PURCHASE_DOCUMENT_TYPES).join(','),
      q: q || undefined,
      limit: PAGE,
    }),
    [filter, direction, q],
  );

  // Its own key under `billing/documents` (an infinite list keeps pages, a
  // different cache shape); `qk.billing.all()` still refreshes it after a save.
  const query = useInfiniteQuery({
    queryKey: [...qk.billing.documents(filters), 'pages'],
    queryFn: ({ pageParam }) => documentsApi.list({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      // E-VISUAL-APPS: an empty answer (no body) ends the list instead of crashing the tab.
      if (!last) return undefined;
      const page = last.page || 1;
      const limit = last.limit || PAGE;
      return page * limit < (last.total ?? 0) ? page + 1 : undefined;
    },
    staleTime: 15_000,
  });

  // P3R: offset pages shift when a bill is saved while the list is open (a
  // synced draft, another device), so page 2 can repeat page 1's last row —
  // keep the first copy (the FlatList keys by `_id`).
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? []).flatMap((p) => p?.data ?? []).filter((r) => (seen.has(r._id) ? false : (seen.add(r._id), true)));
  }, [query.data]);
  const total = query.data?.pages?.[0]?.total;
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
  const loadError = query.isError && rows.length === 0
    ? apiErrorMessage(query.error, t('billing.list.loadFailed'))
    : query.isPending && query.isPaused
      ? t('billing.list.noConnection')
      : null;

  /**
   * >>> WEB-UI — everything above the bills scrolls WITH them.
   *
   * The hero, the usage bar, "New invoice", the search box and both filters
   * used to stay fixed while only the list scrolled, which left a ~640dp phone
   * with room for about one and a half bills. They are the list's header now.
   * It is an ELEMENT rebuilt each render, not a component function, so React
   * keeps the same search box mounted and typing never loses focus.
   */
  const listHeader = (
    <View>
      <Rise index={0}>
        <Hero
          action={<HelpButton c={c} variant="hero" />}
          isDark={isDark}
          eyebrow={t('billing.list.eyebrow')}
          title={t('billing.list.title')}
          subtitle={online ? t('billing.list.subtitleOnline') : t('billing.list.subtitleOffline')}
          style={styles.hero}
        >
          {typeof total === 'number' ? (
            <GlassStat icon="file-document-outline" label={t('billing.list.inThisView')} value={String(total)} />
          ) : null}
        </Hero>
      </Rise>

      {pendingCount > 0 && (
        <Rise index={1} style={styles.side}>
          <Card tone="soft" padding={12} onPress={() => router.push('/(app)/billing/drafts')} accessibilityLabel={t('billing.list.view')}>
            <View style={styles.draftBanner}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.draftBannerTitle, { color: ds.ink }]}>
                  {t('billing.list.waitingToSync', { count: pendingCount })}
                </Text>
                <Text style={[styles.draftBannerBody, { color: ds.muted }]}>
                  {syncing ? t('billing.list.syncingNow') : online ? t('billing.list.willSyncShortly') : t('billing.list.willSyncOnline')}
                </Text>
              </View>
              <Text style={[styles.draftBannerLink, { color: status.brand.fg }]}>{t('billing.list.view')}</Text>
            </View>
          </Card>
        </Rise>
      )}

      {canManage && (
        <Rise index={2} style={styles.newInvoiceRow}>
          <UsageMeter capacity={invoiceCapacity} c={c} />
          <Button
            label={t('billing.list.newInvoice')}
            icon="plus"
            onPress={() => router.push('/(app)/billing/new')}
            disabled={invoiceCapacity.atLimit}
            fullWidth
          />
        </Rise>
      )}

      <Rise index={3}>
        <SearchField
          placeholder={t('billing.list.searchPlaceholder')}
          value={search}
          onChangeText={setSearch}
          style={styles.search}
        />

        {/* >>> WEB-UI — FitSegments: each segment as wide as its words, so
            "Unpaid" is never cut to "Unp…" on a narrow phone. */}
        <View style={styles.filterRow}>
          <FitSegments
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
          <FitSegments
            value={filter}
            onValueChange={(v) => setFilter(v as FilterKey)}
            buttons={FILTERS.map((f) => ({ value: f.value, label: t(f.labelKey) }))}
            density="small"
          />
        </View>
      </Rise>
      {/* <<< WEB-UI */}
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: ds.ground }]} edges={['top']}>
      {/* >>> WEB-UI — one list for the whole screen; the error / loading /
          empty states sit in the space under the header. */}
      <FlatList
        data={loadError || query.isPending ? [] : rows}
        keyExtractor={(item) => item._id}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
        initialNumToRender={10}
        windowSize={7}
        renderItem={({ item, index }) => (
          <DocumentRow index={index} item={item} isGstRegistered={isGstRegistered} onPress={() => router.push(toHref(`/(app)/billing/${item._id}`))} />
        )}
        ListFooterComponent={query.isFetchingNextPage ? <View style={styles.side}><SkeletonList rows={2} /></View> : null}
        ListEmptyComponent={
          loadError ? (
            <View style={styles.side}><ErrorState message={loadError} onRetry={onRefresh} /></View>
          ) : query.isPending ? (
            <View style={styles.side}><SkeletonList rows={4} /></View>
          ) : (
            <EmptyState
              icon="file-document-outline"
              title={t('billing.list.emptyTitle')}
              body={canManage ? t('billing.list.emptyManage') : t('billing.list.emptyRead')}
            />
          )
        }
      />
      {/* <<< WEB-UI */}
    </SafeAreaView>
  );
}

function DocumentRow({
  index, item, isGstRegistered, onPress,
}: {
  index: number;
  item: PartnerDocumentRecord;
  /** Business Settings' answer — renames an untaxed TAX_INVOICE to a bill of supply. */
  isGstRegistered: boolean | undefined;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { c, ds } = useAppTheme();
  const number = item.number ?? t('billing.list.draftNumber', { type: t(documentTypeLabelKey(item.type, isGstRegistered, item.totals.taxPaise)) });
  const row = (
    <Card onPress={onPress} padding={14} accessibilityLabel={`${number}, ${formatPaise(item.totals.grandPaise)}`} style={styles.rowWrap}>
      <View style={styles.rowTop}>
        <Text style={[styles.rowNumber, { color: ds.ink }]} numberOfLines={1}>{number}</Text>
        <Money style={styles.rowAmount}>{formatPaise(item.totals.grandPaise)}</Money>
      </View>
      <View style={styles.rowBottom}>
        <Text style={[styles.rowParty, { color: ds.muted }]} numberOfLines={1}>
          {item.partySnapshot.name}
        </Text>
        <DocumentStatusChip status={item.status} c={c} />
      </View>
    </Card>
  );
  // Only the first screenful rises in; a long list never animates row by row.
  return index < 8 ? <Rise index={Math.min(index, 4)} distance={10}>{row}</Rise> : row;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  side: { marginHorizontal: 20 },
  hero: { marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  draftBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  draftBannerTitle: { fontSize: 13, fontWeight: '600' },
  draftBannerBody: { fontSize: 12, marginTop: 2 },
  draftBannerLink: { fontSize: 13, fontWeight: '700' },
  newInvoiceRow: { paddingHorizontal: 20, marginTop: 14, gap: 8 },
  search: { marginHorizontal: 20, marginTop: 12 },
  filterRow: { paddingHorizontal: 20, marginTop: 10 },
  // >>> WEB-UI — the header is inside the list now, so the 20dp side padding
  // moved onto each bill (`rowWrap`); the gap still gives 10dp above the first.
  list: { paddingBottom: 20, gap: 10 },
  rowWrap: { marginHorizontal: 20, borderRadius: radii.card },
  // <<< WEB-UI
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  rowNumber: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  rowAmount: { fontSize: 15, flexShrink: 0, maxWidth: '50%' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  rowParty: { fontSize: 13, flex: 1, marginRight: 8 },
});
