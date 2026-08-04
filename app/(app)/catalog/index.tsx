import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, useColorScheme, Pressable } from 'react-native';
import { Text, Searchbar, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { useProducts, useProductCategories, ProductCard, UsageMeterBar } from '../../../src/features/catalog';
import type { Product } from '../../../src/features/catalog';

/**
 * The catalog list. Gate 3 (`CATALOG_VIEW` READ) got this far —
 * `catalog/_layout.tsx` already refused anyone without it. `canManage` below
 * is gate 3 at FULL, and it is what decides whether Add/Scan/stock-adjust
 * even render: READ opened this screen, and it is not permission to change
 * anything.
 */
export default function CatalogListScreen() {
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

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const categoriesQuery = useProductCategories();
  const productsQuery = useProducts({
    q: q || undefined,
    categoryId,
    lowStock: lowStockOnly ? 'true' : undefined,
    limit: 100,
  });

  const rows: Product[] = productsQuery.data?.data ?? [];

  const goCreate = useCallback(() => {
    if (cap.atLimit) return;
    router.push('/catalog/create');
  }, [cap.atLimit]);

  const categories = categoriesQuery.data ?? [];

  const chips = useMemo(
    () => [{ _id: undefined as string | undefined, name: 'All' }, ...categories.filter((cat) => cat.isActive)],
    [categories],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['bottom']}>
      <Searchbar
        placeholder="Search products, SKU or barcode"
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
        contentContainerStyle={styles.chipRow}
        renderItem={({ item }) => {
          const active = item._id === categoryId;
          return (
            <Pressable
              onPress={() => setCategoryId(item._id)}
              style={[styles.chip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
            >
              <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12.5, fontWeight: '700' }}>{item.name}</Text>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <Pressable
            onPress={() => setLowStockOnly((v) => !v)}
            style={[
              styles.chip,
              styles.lowStockChip,
              { backgroundColor: lowStockOnly ? c.warning : c.surfaceVariant, borderColor: lowStockOnly ? c.warning : c.divider },
            ]}
          >
            <MaterialCommunityIcons name="alert-outline" size={13} color={lowStockOnly ? '#fff' : c.textSecondary} />
            <Text style={{ color: lowStockOnly ? '#fff' : c.textSecondary, fontSize: 12.5, fontWeight: '700', marginLeft: 4 }}>
              Low stock
            </Text>
          </Pressable>
        }
      />

      <FlatList
        data={rows}
        keyExtractor={(p) => p._id}
        renderItem={({ item }) => (
          <ProductCard product={item} onPress={() => router.push({ pathname: '/catalog/[id]', params: { id: item._id } })} />
        )}
        contentContainerStyle={rows.length === 0 ? styles.emptyGrow : styles.listPad}
        ListEmptyComponent={
          productsQuery.isLoading ? (
            <ActivityIndicator color={c.primary} />
          ) : (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="package-variant-closed" size={30} color={c.textDisabled} />
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No products yet</Text>
              <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
                {canManage ? 'Add your first product, or scan a barcode to start.' : 'Nothing has been added to the catalog yet.'}
              </Text>
            </View>
          )
        }
      />

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
              <Text style={[styles.scanBtnText, { color: c.primary }]}>Scan</Text>
            </Pressable>
            <Pressable
              onPress={goCreate}
              disabled={cap.atLimit}
              style={[styles.createBtn, { backgroundColor: cap.atLimit ? c.textDisabled : c.primary }]}
            >
              <MaterialCommunityIcons name="plus" size={18} color="#fff" />
              <Text style={styles.createBtnText}>Add product</Text>
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
  chipRow: { paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, marginRight: 8 },
  lowStockChip: { flexDirection: 'row', alignItems: 'center' },
  listPad: { paddingBottom: 12 },
  emptyGrow: { flexGrow: 1, justifyContent: 'center' },
  emptyBox: { alignItems: 'center', gap: 6, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  emptyBody: { fontSize: 13, textAlign: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, gap: 10 },
  meterWrap: {},
  actionsRow: { flexDirection: 'row', gap: 10 },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: radii.card, paddingVertical: 12, paddingHorizontal: 16,
  },
  scanBtnText: { fontWeight: '700', fontSize: 13.5 },
  createBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: radii.card, paddingVertical: 12,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
});
