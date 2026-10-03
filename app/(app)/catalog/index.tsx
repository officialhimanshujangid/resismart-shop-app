import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, useColorScheme, Pressable } from 'react-native';
import { Text, Searchbar, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { Hero, GlassStat } from '../../../src/components/Hero';
import { ErrorBlock } from '../../../src/features/more/ui';
import { apiErrorMessage } from '../../../src/api/axios';
import { useProducts, useProductCategories, ProductCard, UsageMeterBar } from '../../../src/features/catalog';
import type { Product } from '../../../src/features/catalog';
// Commerce C6: print barcode labels for several items at once.
import { ProductPickerSheet } from '../../../src/features/commerce/components/ui';
import { LabelsSheet } from '../../../src/features/commerce/components/LabelsSheet';

/**
 * The catalog list. Gate 3 (`CATALOG_VIEW` READ) got this far —
 * `catalog/_layout.tsx` already refused anyone without it. `canManage` below
 * is gate 3 at FULL, and it is what decides whether Add/Scan/stock-adjust
 * even render: READ opened this screen, and it is not permission to change
 * anything.
 */

/** One page of the product list. See the accumulate effect below for why 100 was wrong. */
const PAGE_LIMIT = 30;

export default function CatalogListScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const canManage = can('CATALOG_MANAGE', 'FULL');
  const { capacity } = usePlanUsage();
  const cap = capacity('max_products');

  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Product[]>([]);
  /** C6 labels: pick items (sheet 1), then copies / layout (sheet 2). */
  const [labelPicking, setLabelPicking] = useState(false);
  const [labelItems, setLabelItems] = useState<Array<{ productId: string; name: string }>>([]);
  const [labelsOpen, setLabelsOpen] = useState(false);

  // `handle`, not `t` — the local used to shadow the translator.
  useEffect(() => {
    const handle = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Any filter change starts the accumulated list over at page 1.
  useEffect(() => {
    setPage(1);
    setRows([]);
  }, [q, categoryId, lowStockOnly]);

  const categoriesQuery = useProductCategories();
  const productsQuery = useProducts({
    q: q || undefined,
    categoryId,
    lowStock: lowStockOnly ? 'true' : undefined,
    page,
    limit: PAGE_LIMIT,
  });

  /**
   * Pages accumulated into one list, the same way `(tabs)/orders.tsx` does it.
   *
   * This screen asked for `limit: 100` and drew whatever came back, which was
   * not a generous default but a CEILING: a shop with 150 SKUs could not reach
   * the last 50 from anywhere in this app, and nothing on screen admitted it.
   * The endpoint has always been paginated (`page`/`limit`/`total`); nothing was
   * asking for the second page.
   *
   * De-duplicated by `_id` on append: a stock adjustment refetches page 1 while
   * later pages are held here, and a product can shift between pages between two
   * requests.
   */
  useEffect(() => {
    if (!productsQuery.data) return;
    setRows((prev) => {
      if (productsQuery.data.page === 1) return productsQuery.data.data;
      const seen = new Set(prev.map((p) => p._id));
      return [...prev, ...productsQuery.data.data.filter((p) => !seen.has(p._id))];
    });
  }, [productsQuery.data]);

  const total = productsQuery.data?.total ?? rows.length;
  const hasMore = productsQuery.data ? rows.length < total : false;
  const loadMore = useCallback(() => {
    if (productsQuery.isFetching || !hasMore) return;
    setPage((p) => p + 1);
  }, [productsQuery.isFetching, hasMore]);

  /**
   * Why the catalogue is empty, when it is empty for a reason other than
   * "nothing added yet".
   *
   * `isLoading` is false on a failed request just as it is on a successful
   * one, so a 500 or a dropped connection used to read as "No products yet" —
   * a shop being shown an empty shelf and invited to start typing its stock in
   * again. `isPaused` is the offline case: `onlineManager` (see
   * `lib/queryClient.ts`) holds the request rather than firing it into a dead
   * radio, which without this would be an unexplained spinner.
   */
  const loadError = productsQuery.isError
    ? apiErrorMessage(productsQuery.error, t('catalog.list.loadFailed'))
    : productsQuery.isPending && productsQuery.isPaused
      ? t('catalog.list.noConnection')
      : null;

  const goCreate = useCallback(() => {
    if (cap.atLimit) return;
    router.push('/catalog/create');
  }, [cap.atLimit]);

  const categories = categoriesQuery.data ?? [];
  const activeCategoryCount = categories.filter((cat) => cat.isActive).length;

  // Low-stock count across what is currently listed — mirrors the ProductCard's
  // own `isLowStock` rule so the hero tile and the card badges never disagree.
  const lowCount = useMemo(
    () =>
      rows.filter(
        (p) => p.trackStock && (p.stockQty <= 0 || (typeof p.lowStockAt === 'number' && p.stockQty <= p.lowStockAt)),
      ).length,
    [rows],
  );

  const heroSubtitle = lowStockOnly
    ? t('catalog.list.subtitleLowStock')
    : q || categoryId
      ? t('catalog.list.subtitleFiltered')
      : t('catalog.list.subtitleAll');

  const chips = useMemo(
    // Only the "All" pseudo-chip is copy; every other name is a category the
    // partner created, shown back as they typed it.
    () => [{ _id: undefined as string | undefined, name: t('catalog.list.allCategories') }, ...categories.filter((cat) => cat.isActive)],
    [categories, t],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['bottom']}>
      {/* >>> WEB-UI — the whole screen scrolls as one list: the hero, search
          and chips are the list's header (an element, so the search box keeps
          its focus), and the products are no longer squeezed under them. */}
      <FlatList
        data={rows}
        keyExtractor={(p) => p._id}
        ListHeaderComponent={
          <View>
      <Hero
        isDark={isDark}
        rounded={false}
        eyebrow={t('catalog.list.eyebrow')}
        // The server's `total`, not `rows.length`: now that the list pages, the
        // loaded count is "how far you have scrolled", which is not what a shop
        // wants to read off its own catalogue header.
        // `_one`/`_other`, not an English `-s`: Hindi cannot pluralise by
        // suffixing, and CLDR puts BOTH 0 and 1 in its `one` category.
        headline={{ value: String(total), label: t('catalog.list.product', { count: total }) }}
        subtitle={heroSubtitle}
      >
        <GlassStat icon="alert-octagon-outline" label={t('catalog.list.statRunningLow')} value={String(lowCount)} />
        <GlassStat icon="tag-outline" label={t('catalog.list.statCategories')} value={String(activeCategoryCount)} />
      </Hero>

      <Searchbar
        placeholder={t('catalog.list.searchPlaceholder')}
        value={searchInput}
        onChangeText={setSearchInput}
        style={[styles.search, { backgroundColor: c.surfaceVariant }]}
        elevation={0}
      />

      <FlatList
        horizontal
        data={chips}
        keyExtractor={(item) => item._id ?? 'all'}
        showsHorizontalScrollIndicator={false}
        style={styles.chipList /* >>> WEB-UI — never grows to fill the column on web */}
        contentContainerStyle={styles.chipRow}
        renderItem={({ item }) => {
          const active = item._id === categoryId;
          return (
            <Pressable
              onPress={() => setCategoryId(item._id)}
              style={[styles.chip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
            >
              <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12.5, fontWeight: '600' }}>{item.name}</Text>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <View style={{ flexDirection: 'row' }}>
            <Pressable
              onPress={() => setLowStockOnly((v) => !v)}
              style={[
                styles.chip,
                styles.lowStockChip,
                { backgroundColor: lowStockOnly ? c.warning : c.surfaceVariant, borderColor: lowStockOnly ? c.warning : c.divider },
              ]}
            >
              <MaterialCommunityIcons name="alert-outline" size={13} color={lowStockOnly ? '#fff' : c.textSecondary} />
              <Text style={{ color: lowStockOnly ? '#fff' : c.textSecondary, fontSize: 12.5, fontWeight: '600', marginLeft: 4 }}>
                {t('catalog.list.lowStock')}
              </Text>
            </Pressable>
            {rows.length > 0 ? (
              <Pressable
                onPress={() => { setLabelItems([]); setLabelPicking(true); }}
                accessibilityRole="button"
                style={[styles.chip, styles.lowStockChip, { backgroundColor: c.surfaceVariant, borderColor: c.divider }]}
                testID="catalog-print-labels"
              >
                <MaterialCommunityIcons name="printer-outline" size={13} color={c.textSecondary} />
                <Text style={{ color: c.textSecondary, fontSize: 12.5, fontWeight: '600', marginLeft: 4 }}>
                  {t('commerce.labels.print')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
      />
          </View>
        }
        // <<< WEB-UI
        renderItem={({ item }) => (
          <ProductCard product={item} onPress={() => router.push({ pathname: '/catalog/[id]', params: { id: item._id } })} />
        )}
        contentContainerStyle={rows.length === 0 ? styles.emptyGrow : styles.listPad}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListFooterComponent={
          productsQuery.isFetching && page > 1 ? (
            <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          // >>> WEB-UI — centred in the space under the header.
          <View style={styles.emptyFill}>
          {loadError ? (
            <ErrorBlock c={c} message={loadError} onRetry={() => void productsQuery.refetch()} />
          ) : productsQuery.isLoading ? (
            <ActivityIndicator color={c.primary} />
          ) : (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="package-variant-closed" size={30} color={c.textDisabled} />
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>{t('catalog.list.emptyTitle')}</Text>
              <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
                {t(canManage ? 'catalog.list.emptyManage' : 'catalog.list.emptyRead')}
              </Text>
            </View>
          )}
          </View>
          // <<< WEB-UI
        }
      />

      <ProductPickerSheet
        visible={labelPicking}
        title={t('commerce.labels.pickTitle')}
        multi
        hideParents
        picked={labelItems.map((i) => i.productId)}
        onPick={(p) => setLabelItems((x) => (x.some((i) => i.productId === p._id)
          ? x.filter((i) => i.productId !== p._id)
          : [...x, { productId: p._id, name: p.name }]))}
        onDismiss={() => { setLabelPicking(false); if (labelItems.length) setLabelsOpen(true); }}
      />
      <LabelsSheet visible={labelsOpen} onDismiss={() => setLabelsOpen(false)} items={labelItems} />

      {canManage && (
        <View style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
          <View style={styles.meterWrap}>
            <UsageMeterBar cap={cap} c={c} />
          </View>
          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => router.push('/catalog/scan')}
              style={[styles.scanBtn, { borderColor: c.primary }]}
            >
              <MaterialCommunityIcons name="barcode-scan" size={18} color={c.primary} />
              <Text style={[styles.scanBtnText, { color: c.primary }]}>{t('catalog.list.scan')}</Text>
            </Pressable>
            <Pressable
              onPress={goCreate}
              disabled={cap.atLimit}
              style={[styles.createBtn, { backgroundColor: cap.atLimit ? c.textDisabled : c.primary }]}
            >
              <MaterialCommunityIcons name="plus" size={18} color="#fff" />
              <Text style={styles.createBtnText}>{t('catalog.list.addProduct')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  search: { marginHorizontal: 14, marginTop: 10, borderRadius: radii.field },
  // >>> WEB-UI
  chipList: { flexGrow: 0, flexShrink: 0 },
  // <<< WEB-UI
  chipRow: { paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, marginRight: 8 },
  lowStockChip: { flexDirection: 'row', alignItems: 'center' },
  listPad: { paddingBottom: 12 },
  // >>> WEB-UI — the header is inside the list; only the empty block is centred.
  emptyGrow: { flexGrow: 1 },
  emptyFill: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  // <<< WEB-UI
  emptyBox: { alignItems: 'center', gap: 6, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  emptyBody: { fontSize: 13, textAlign: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, gap: 10 },
  meterWrap: {},
  actionsRow: { flexDirection: 'row', gap: 10 },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: radii.card, paddingVertical: 12, paddingHorizontal: 16,
  },
  scanBtnText: { fontWeight: '600', fontSize: 13.5 },
  createBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: radii.card, paddingVertical: 12,
  },
  createBtnText: { color: '#fff', fontWeight: '600', fontSize: 13.5 },
});
