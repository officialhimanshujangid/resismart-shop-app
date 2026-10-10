import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Searchbar, Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { useDebouncedValue } from '../../../src/features/billing/useDebouncedValue';
import { KhataFilter, khataApi } from '../../../src/features/khata/api';
import { useKhataActions } from '../../../src/features/khata/useKhataActions';
import { KhataRowCard } from '../../../src/features/khata/components/KhataRowCard';
import { ChipRow, ErrorBlock, Loading } from '../../../src/features/more/ui';
import { ActionRow, PillButton, useIsWide } from '../../../src/features/p1/ui';
import { Rise } from '../../../src/theme/motion';
// UX-P (A ShopKhata): large title with the total due counting up, illustrated empty state.
import { CountUp, EmptyState, LargeTitle, LargeTitleBar, useLargeTitleScroll } from '../../../src/components/ui';
import { HelpButton } from '../../../src/features/help/HelpButton';
import { useAppTheme } from '../../../src/theme/useAppTheme';
import { fontFamily } from '../../../src/theme/tokens';

/**
 * Khata (screen S14): who owes the shop, oldest first or biggest first, with
 * the over-limit and overdue flags; one tap reminds (share sheet — free). Bulk
 * mode sends an app notification to the customers who use the ResiSmart app
 * (the others are reminded one by one, by share).
 */
const FILTERS: KhataFilter[] = ['due', 'overdue', 'overLimit', 'all'];
const BULK_MAX = 100;

export default function KhataScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const wide = useIsWide();
  const { can } = usePartnerEntitlements();
  const canManage = can('CUSTOMERS', 'FULL');
  const [filter, setFilter] = useState<KhataFilter>('due');
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 300);
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const actions = useKhataActions(setToast);

  const query = useInfiniteQuery({
    queryKey: qk.khata.list(filter, debounced.trim()),
    queryFn: ({ pageParam }) => khataApi.list({ filter, q: debounced.trim() || undefined, page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last && last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  const rows = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p?.data ?? []), [query.data]);
  const totals = query.data?.pages?.[0]?.totals;
  const { ds, isDark } = useAppTheme();
  const { scrollY, onScroll } = useLargeTitleScroll();

  const bulkRemind = useMutation({
    mutationFn: () => khataApi.remindBulk({ partyIds: picked.slice(0, BULK_MAX), channel: 'PUSH', includeUpiLink: true }),
    onSuccess: (res) => {
      const sent = res.filter((r) => r.outcome === 'SENT').length;
      setToast(t('khata.bulkResult', { sent, skipped: res.length - sent }));
      setBulk(false);
      setPicked([]);
    },
    onError: (e) => setToast(apiErrorMessage(e, t('khata.actionFailed'))),
  });

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: ds.ground }]} edges={['top']}>
      <LargeTitleBar title={t('khata.title')} scrollY={scrollY} right={<HelpButton c={c} />} />
      {/* >>> WEB-UI — the whole screen scrolls as one list: totals, filters,
          search and the bulk row are the list's header (an element, so the
          search box keeps its focus); loading / error / empty sit under it. */}
        <Animated.FlatList
          key={wide ? 'w' : 'n'}
          onScroll={onScroll}
          scrollEventThrottle={16}
          data={query.isPending || (query.isError && rows.length === 0) ? [] : rows}
          numColumns={wide ? 2 : 1}
          columnWrapperStyle={wide ? { gap: 10 } : undefined}
          keyExtractor={(r) => r.partyId}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
      <View style={styles.controls}>
        {/* UX-P (A ShopKhata): "Total due · 18 customers" over the big title, the
            amount counting up on the right (reduce-motion: at once). */}
        <LargeTitle
          title={t('khata.title')}
          eyebrow={totals ? t('khata.totalDueEyebrow', { count: totals.parties }) : t('khata.subtitle')}
          scrollY={scrollY}
          trailing={totals ? (
            <CountUp
              value={totals.duePaise}
              format={formatPaise}
              testID="khata-total"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              accessibilityLabel={`${t('khata.totalDue')}: ${formatPaise(totals.duePaise)}`}
              style={[styles.total, { color: isDark ? ds.primary : ds.primaryDeep }]}
            />
          ) : undefined}
        />
        <ChipRow c={c} value={filter} options={FILTERS.map((f) => ({ key: f, label: t(`khata.filter.${f}`) }))} onChange={setFilter} />
        <Searchbar placeholder={t('khata.search')} value={q} onChangeText={setQ} style={[styles.search, { backgroundColor: c.surfaceVariant }]} inputStyle={{ fontSize: 14 }} />
        {canManage && (
          <ActionRow>
            {bulk ? (
              <>
                <PillButton
                  c={c}
                  icon="bell-ring-outline"
                  label={t('khata.bulkSend', { count: picked.length })}
                  disabled={!picked.length || bulkRemind.isPending}
                  onPress={() => bulkRemind.mutate()}
                  testID="khata-bulk-send"
                />
                <PillButton c={c} tone="outline" label={t('common.cancel')} onPress={() => { setBulk(false); setPicked([]); }} />
              </>
            ) : (
              <PillButton c={c} tone="outline" icon="checkbox-multiple-marked-outline" label={t('khata.bulk')} onPress={() => setBulk(true)} />
            )}
          </ActionRow>
        )}
      </View>
          }
          renderItem={({ item, index }) => (
            // M21: the first screenful rises in (FlatList keeps the rest virtualised).
            <Rise index={Math.min(index, 6)} style={wide ? { flex: 1 } : undefined}>
              <KhataRowCard
                c={c}
                row={item}
                onOpen={() => router.push({ pathname: '/parties/[id]', params: { id: item.partyId } })}
                onRemind={canManage && item.outstandingPaise > 0 ? () => void actions.remindShare(item.partyId) : undefined}
                reminding={!!actions.busy}
                selectable={bulk}
                selected={picked.includes(item.partyId)}
                onToggle={() => setPicked((p) => (p.includes(item.partyId) ? p.filter((x) => x !== item.partyId) : p.length >= BULK_MAX ? p : [...p, item.partyId]))}
              />
            </Rise>
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          onRefresh={() => void query.refetch()}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            query.isPending ? (
              <Loading c={c} skeleton={5} />
            ) : query.isError && rows.length === 0 ? (
              <ErrorBlock c={c} message={apiErrorMessage(query.error, t('khata.loadFailed'))} onRetry={() => query.refetch()} />
            ) : (
              <EmptyState illustration="khata" title={t(`khata.empty.${filter}`)} testID="khata-empty" />
            )
          }
        />
      {/* <<< WEB-UI */}
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // >>> WEB-UI — the controls are the list's header now: the list's side padding
  // covers them, and their bottom padding is the 16dp that used to sit above the list.
  root: { flex: 1 },
  controls: { paddingTop: 4, gap: 12, paddingBottom: 16 },
  total: { fontFamily: fontFamily.sora700, fontSize: 22 },
  search: { borderRadius: radii.field, elevation: 0 },
  list: { paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1 },
  // <<< WEB-UI
});
