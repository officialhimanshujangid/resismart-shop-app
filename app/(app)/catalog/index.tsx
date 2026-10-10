import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, Pressable, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { CatalogueHero } from '../../../src/features/catalog/components/CatalogueHero'; // M20 — DS v1 hero
import { ErrorBlock } from '../../../src/features/more/ui';
import { apiErrorMessage } from '../../../src/api/axios';
import { useProducts, useProductCategories, ProductCard, ProductTile, UsageMeterBar } from '../../../src/features/catalog';
import type { Product } from '../../../src/features/catalog';
// Commerce C6: print barcode labels for several items at once.
import { ProductPickerSheet } from '../../../src/features/commerce/components/ui';
import { LabelsSheet } from '../../../src/features/commerce/components/LabelsSheet';
// M20 — DS v1 kit (green, light + dark) + motion (reduce-motion aware).
import { Button, Chip, EmptyState, SearchField, Skeleton, SkeletonGrid, SkeletonList, StatusBadge } from '../../../src/components/ui';
import { useAppTheme } from '../../../src/theme/useAppTheme';
import { MIN_TOUCH, radius } from '../../../src/theme/tokens';
import { Rise } from '../../../src/theme/motion';

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
  /** UX-P (idea P5): grid of image-first tiles, or the list. View only — same rows, same order. */
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  const grid = layout === 'grid';
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
        key={layout}
        data={rows}
        keyExtractor={(p) => p._id}
        numColumns={grid ? 2 : 1}
        columnWrapperStyle={grid ? styles.gridRow : undefined}
        ListHeaderComponent={
          <View>
      {/* The server's `total`, not `rows.length`: now that the list pages, the
          loaded count is "how far you have scrolled". `_one`/`_other`, not an
          English `-s`: Hindi cannot pluralise by suffixing. */}
      <CatalogueHero
        eyebrow={t('catalog.list.eyebrow')}
        total={total}
        totalLabel={t('catalog.list.product', { count: total })}
        subtitle={heroSubtitle}
        lowLabel={t('catalog.list.statRunningLow')}
        lowCount={lowCount}
        lowActive={lowStockOnly}
        onLowPress={() => setLowStockOnly((v) => !v)}
        categoriesLabel={t('catalog.list.statCategories')}
        categoryCount={activeCategoryCount}
      />

      <Rise index={1} style={styles.searchRow}>
        <SearchField
          placeholder={t('catalog.list.searchPlaceholder')}
          accessibilityLabel={t('catalog.list.searchPlaceholder')}
          value={searchInput}
          onChangeText={setSearchInput}
          style={styles.searchFlex}
        />
        {/* UX-P (A ShopKhata catalogue): grid / list switch. */}
        <ViewToggle value={layout} onChange={setLayout} />
      </Rise>

      <FlatList
        horizontal
        data={chips}
        keyExtractor={(item) => item._id ?? 'all'}
        showsHorizontalScrollIndicator={false}
        style={styles.chipList /* >>> WEB-UI — never grows to fill the column on web */}
        contentContainerStyle={styles.chipRow}
        renderItem={({ item }) => (
          // M20 — DS chips: selected = ink pill (≥ 4.5:1 in light and dark), press scale.
          <Chip label={item.name} selected={item._id === categoryId} onPress={() => setCategoryId(item._id)} style={styles.chipGap} />
        )}
        ListFooterComponent={
          <View style={{ flexDirection: 'row' }}>
            <Chip
              label={t('catalog.list.lowStock')}
              icon="alert-outline"
              selected={lowStockOnly}
              onPress={() => setLowStockOnly((v) => !v)}
              style={styles.chipGap}
            />
            {rows.length > 0 ? (
              <Chip
                label={t('commerce.labels.print')}
                icon="printer-outline"
                onPress={() => { setLabelItems([]); setLabelPicking(true); }}
                style={styles.chipGap}
                testID="catalog-print-labels"
              />
            ) : null}
          </View>
        }
      />
      {/* >>> M20 — say it before the partner opens a form that cannot be saved. */}
      {rows.some((p) => p.viewOnly) ? (
        <Rise index={2} style={[styles.viewOnlyBanner, { borderColor: c.warning, backgroundColor: c.surface }]} testID="catalog-view-only-banner">
          <StatusBadge tone="warn" label={t('catalog.viewOnly.badge')} style={styles.viewOnlyBadge} />
          <Text style={{ color: c.textPrimary, fontSize: 12.5, lineHeight: 18 }}>{t('catalog.viewOnly.banner')}</Text>
        </Rise>
      ) : null}
      {/* <<< M20 */}
          </View>
        }
        // <<< WEB-UI
        renderItem={({ item, index }) => {
          const open = () => router.push({ pathname: '/catalog/[id]', params: { id: item._id } });
          const card = grid ? <ProductTile product={item} index={index} onPress={open} /> : <ProductCard product={item} onPress={open} />;
          // A grid cell takes half the row; the first screenful rises in, later pages arrive at once.
          if (grid) return index < 8 ? <Rise index={Math.min(index, 5) + 2} distance={10} style={styles.gridCell}>{card}</Rise> : <View style={styles.gridCell}>{card}</View>;
          // M20 — the first screenful rises in on a stagger; later pages never animate row by row.
          return index < 8 ? <Rise index={Math.min(index, 5) + 2} distance={10}>{card}</Rise> : card;
        }}
        // M20 — a long catalogue stays at 60 fps: small first render, modest window.
        initialNumToRender={10}
        windowSize={9}
        removeClippedSubviews
        contentContainerStyle={rows.length === 0 ? styles.emptyGrow : styles.listPad}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListFooterComponent={
          productsQuery.isFetching && page > 1 ? (
            <View style={styles.moreSkeleton}><Skeleton height={64} rounded={22} /></View>
          ) : null
        }
        ListEmptyComponent={
          // >>> WEB-UI — centred in the space under the header.
          <View style={styles.emptyFill}>
          {loadError ? (
            <ErrorBlock c={c} message={loadError} onRetry={() => void productsQuery.refetch()} />
          ) : productsQuery.isLoading ? (
            <View style={styles.listSkeleton}>{grid ? <SkeletonGrid tiles={4} /> : <SkeletonList rows={4} />}</View>
          ) : (
            <EmptyState
              illustration="catalog"
              title={t('catalog.list.emptyTitle')}
              body={t(canManage ? 'catalog.list.emptyManage' : 'catalog.list.emptyRead')}
              testID="catalog-empty"
            />
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
          {/* M20 — kit buttons: hug their labels (never stretched), haptic on the primary. */}
          <View style={styles.actionsRow}>
            <Button variant="outline" icon="barcode-scan" label={t('catalog.list.scan')} onPress={() => router.push('/catalog/scan')} />
            <Button icon="plus" label={t('catalog.list.addProduct')} onPress={goCreate} disabled={cap.atLimit} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

/** UX-P: the grid / list switch — a soft track with a sliding-feel green fill on the chosen icon. */
function ViewToggle({ value, onChange }: { value: 'list' | 'grid'; onChange: (v: 'list' | 'grid') => void }) {
  const { t } = useTranslation();
  const { ds } = useAppTheme();
  const opt = (key: 'list' | 'grid', icon: string, label: string) => {
    const on = value === key;
    return (
      <Pressable
        key={key}
        onPress={() => onChange(key)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        testID={`catalog-view-${key}`}
        style={[styles.toggleBtn, on ? { backgroundColor: ds.primaryFill } : null]}
      >
        <MaterialCommunityIcons name={icon as never} size={18} color={on ? ds.onPrimary : ds.muted} />
      </Pressable>
    );
  };
  return (
    <View style={[styles.toggle, { backgroundColor: ds.track }]} accessibilityRole="radiogroup">
      {opt('grid', 'view-grid-outline', t('catalog.list.viewGrid'))}
      {opt('list', 'format-list-bulleted', t('catalog.list.viewList'))}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  toggleBtn: { width: MIN_TOUCH, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  root: { flex: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12 },
  searchFlex: { flex: 1, minWidth: 0 },
  gridRow: { gap: 10, paddingHorizontal: 16 },
  // maxWidth: a lone last tile keeps its half instead of stretching across the row.
  gridCell: { flex: 1, maxWidth: '49%', marginVertical: 5 },
  chipGap: { marginRight: 8 },
  viewOnlyBanner: { marginHorizontal: 16, marginBottom: 6, borderWidth: 1, borderRadius: radii.card, padding: 12, gap: 6 },
  viewOnlyBadge: { alignSelf: 'flex-start' },
  moreSkeleton: { marginHorizontal: 16, marginVertical: 8 },
  listSkeleton: { paddingHorizontal: 16 },
  // >>> WEB-UI
  chipList: { flexGrow: 0, flexShrink: 0 },
  // <<< WEB-UI
  chipRow: { paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  listPad: { paddingBottom: 12 },
  // >>> WEB-UI — the header is inside the list; only the empty block is centred.
  emptyGrow: { flexGrow: 1 },
  emptyFill: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  // <<< WEB-UI
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, gap: 10 },
  meterWrap: {},
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
});
