import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View, useColorScheme, Pressable } from 'react-native';
import { Text, Switch, ActivityIndicator } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { ErrorBlock } from '../../../src/features/more/ui';
import { parseRupeesToPaise, paiseToInput, formatPaise } from '../../../src/lib/money';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { PRODUCT_UNITS, ProductUnit } from '../../../src/types/api-contract.generated';
import {
  useProduct, useProductCategories, useUpdateProduct, useDeactivateProduct, useAdjustStock,
  CategoryPicker, ProductImages, StockAdjustModal,
} from '../../../src/features/catalog';
import type { StockAdjustTarget } from '../../../src/features/catalog';

export default function ProductDetailScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = usePartnerEntitlements();
  const canManage = can('CATALOG_MANAGE', 'FULL');

  const productQuery = useProduct(id);
  const categoriesQuery = useProductCategories();
  const updateProduct = useUpdateProduct(id);
  const deactivateProduct = useDeactivateProduct();
  const adjustStock = useAdjustStock();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [unit, setUnit] = useState<ProductUnit>('PCS');
  const [mrp, setMrp] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [lowStockAt, setLowStockAt] = useState('');
  const [trackStock, setTrackStock] = useState(true);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [images, setImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stockTarget, setStockTarget] = useState<StockAdjustTarget | null>(null);

  useEffect(() => {
    const p = productQuery.data;
    if (!p) return;
    setName(p.name);
    setSku(p.sku ?? '');
    setBarcode(p.barcode ?? '');
    setHsnCode(p.hsnCode ?? '');
    setUnit(p.unit);
    setMrp(p.mrpPaise ? paiseToInput(p.mrpPaise) : '');
    setSellPrice(paiseToInput(p.sellPaise));
    setTaxRate(String(p.taxRatePercent));
    setTaxInclusive(p.taxInclusive);
    setLowStockAt(p.lowStockAt !== undefined ? String(p.lowStockAt) : '');
    setTrackStock(p.trackStock);
    setCategoryId(p.categoryId?._id);
    // `?? []` because a product created before photos existed has no `images`
    // key at all, and `ProductImages` maps over this.
    setImages(p.images ?? []);
  }, [productQuery.data]);

  const save = () => {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = 'A product needs a name.';
    const sellPaise = parseRupeesToPaise(sellPrice);
    if (sellPaise === null) nextErrors.sellPrice = 'Enter a selling price.';
    const mrpPaise = mrp.trim() ? parseRupeesToPaise(mrp) : 0;
    if (mrp.trim() && mrpPaise === null) nextErrors.mrp = 'That does not look like an amount.';
    if (mrpPaise !== null && mrpPaise > 0 && sellPaise !== null && sellPaise > mrpPaise) {
      nextErrors.sellPrice = 'Selling price cannot be above the MRP.';
    }
    const taxRateNum = Number(taxRate || '0');
    if (!Number.isFinite(taxRateNum) || taxRateNum < 0 || taxRateNum > 100) nextErrors.taxRate = 'Enter 0–100.';
    const lowStockNum = lowStockAt.trim() ? Number(lowStockAt) : undefined;
    if (lowStockAt.trim() && (!Number.isFinite(lowStockNum) || (lowStockNum as number) < 0)) {
      nextErrors.lowStockAt = 'Enter a whole number.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || sellPaise === null) return;

    updateProduct.mutate(
      {
        name: name.trim(),
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        hsnCode: hsnCode.trim() || undefined,
        unit,
        mrpPaise: mrpPaise ?? 0,
        sellPaise,
        taxRatePercent: taxRateNum,
        taxInclusive,
        lowStockAt: lowStockNum ?? null,
        trackStock,
        // This screen omitted `images` entirely, so a product could never gain a
        // photo after it was created — and, worse, `updateProductSchema` treats
        // a missing key as "leave it alone", which meant the omission was silent
        // rather than an error anybody would notice. Sent as a whole array,
        // matching how the schema reads it: this IS the new list.
        images,
        categoryId: categoryId ?? null,
      },
      { onError: (e: unknown) => Alert.alert('Could not save changes', apiErrorMessage(e)) },
    );
  };

  const confirmDeactivate = () => {
    if (!productQuery.data) return;
    Alert.alert(
      'Take off sale?',
      `"${productQuery.data.name}" will stop appearing for residents. You can still find it here and switch it back on.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Take off sale', style: 'destructive',
          onPress: () => deactivateProduct.mutate(id, {
            onError: (e: unknown) => Alert.alert('Could not do that', apiErrorMessage(e)),
            onSuccess: () => router.back(),
          }),
        },
      ],
    );
  };

  const reactivate = () => {
    updateProduct.mutate({ isActive: true }, { onError: (e: unknown) => Alert.alert('Could not do that', apiErrorMessage(e)) });
  };

  /**
   * `isLoading` goes false the moment the request settles — success OR failure
   * — and `data` is undefined on failure, so the single `isLoading || !data`
   * spinner this used to be had no way out of a failed load: the screen sat
   * spinning under a back arrow with nothing to retry and nothing to read.
   * `isPaused` is the same dead end reached from offline, where `onlineManager`
   * (see `lib/queryClient.ts`) holds the request rather than firing it.
   */
  const loadError = productQuery.isError
    ? apiErrorMessage(productQuery.error, 'Could not load this product.')
    : productQuery.isPending && productQuery.isPaused
      ? 'No connection. Check your network and try again.'
      : null;

  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ErrorBlock c={c} message={loadError} onRetry={() => void productQuery.refetch()} />
      </View>
    );
  }

  if (!productQuery.data) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const product = productQuery.data;

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.body}>
      {!product.isActive && (
        <View style={[styles.offSaleBanner, { backgroundColor: c.textDisabled + '22' }]}>
          <Text style={{ color: c.textSecondary, fontSize: 12.5, fontWeight: '600' }}>This product is off sale.</Text>
          {canManage && (
            <Pressable onPress={reactivate}>
              <Text style={{ color: c.primary, fontSize: 12.5, fontWeight: '600' }}>Turn back on</Text>
            </Pressable>
          )}
        </View>
      )}

      {!canManage && (
        <View style={[styles.readOnlyBanner, { backgroundColor: c.surfaceVariant }]}>
          <Text style={[styles.readOnlyText, { color: c.textSecondary }]}>
            View only — your role does not include managing the catalogue.
          </Text>
        </View>
      )}

      <View style={[styles.stockCard, { backgroundColor: c.surface, borderColor: c.divider }]}>
        <View>
          <Text style={[styles.stockLabel, { color: c.textSecondary }]}>On hand</Text>
          <Text style={[styles.stockValue, { color: c.textPrimary }]}>
            {product.trackStock ? product.stockQty : 'Not tracked'}
          </Text>
        </View>
        {canManage && product.trackStock && (
          <Pressable
            onPress={() => setStockTarget({ productId: product._id, productName: product.name, currentQty: product.stockQty })}
            style={[styles.adjustBtn, { borderColor: c.primary }]}
          >
            <Text style={{ color: c.primary, fontWeight: '600', fontSize: 12.5 }}>Adjust stock</Text>
          </Pressable>
        )}
      </View>

      <AppInput label="Product name" value={name} onChangeText={setName} error={errors.name} disabled={!canManage} />

      <View style={styles.row2}>
        <AppInput label="Selling price (₹)" value={sellPrice} onChangeText={setSellPrice} keyboardType="numeric" error={errors.sellPrice} style={styles.half} disabled={!canManage} />
        <AppInput label="MRP (₹, optional)" value={mrp} onChangeText={setMrp} keyboardType="numeric" error={errors.mrp} style={styles.half} disabled={!canManage} />
      </View>

      <View style={styles.row2}>
        <AppInput label="Tax rate %" value={taxRate} onChangeText={setTaxRate} keyboardType="numeric" error={errors.taxRate} style={styles.half} disabled={!canManage} />
        <View style={[styles.half, styles.switchBox]}>
          <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>Price includes tax</Text>
          <Switch value={taxInclusive} onValueChange={setTaxInclusive} disabled={!canManage} />
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>Unit</Text>
      {/* `disabled`, not an `onPress` that evaluates to `false`: every field
          above already refuses a viewer visibly (`AppInput disabled`), and the
          unit chips were the one control on this screen that took the tap and
          did nothing with it. The banner at the top says why. */}
      <View style={[styles.unitRow, !canManage && styles.readOnlyRow]}>
        {PRODUCT_UNITS.map((u) => {
          const active = u === unit;
          return (
            <Pressable
              key={u}
              onPress={() => setUnit(u)}
              disabled={!canManage}
              style={[styles.unitChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
            >
              <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12.5, fontWeight: '600' }}>{u}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Uploaded immediately, saved with the form. Adding a photo and then
          leaving without pressing Save leaves an orphan in the bucket and no
          reference to it — the cheaper of the two failures, and the same trade
          `ProductImages`'s remove path documents. */}
      <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>Photos</Text>
      <ProductImages value={images} onChange={setImages} c={c} canManage={canManage} />

      <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>Category</Text>
      <CategoryPicker categories={categoriesQuery.data ?? []} value={categoryId} onChange={setCategoryId} canManage={canManage} />

      <AppInput label="SKU (optional)" value={sku} onChangeText={setSku} autoCapitalize="characters" disabled={!canManage} />
      <AppInput label="Barcode (optional)" value={barcode} onChangeText={setBarcode} autoCapitalize="characters" disabled={!canManage} />
      <AppInput label="HSN code (optional)" value={hsnCode} onChangeText={setHsnCode} disabled={!canManage} />

      <View style={[styles.switchBox, { marginTop: 4 }]}>
        <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>Track stock for this product</Text>
        <Switch value={trackStock} onValueChange={setTrackStock} disabled={!canManage} />
      </View>

      {trackStock && (
        <AppInput label="Low-stock alert at" value={lowStockAt} onChangeText={setLowStockAt} keyboardType="numeric" error={errors.lowStockAt} disabled={!canManage} />
      )}

      {canManage && (
        <>
          <AppButton label="Save changes" onPress={save} loading={updateProduct.isPending} />
          {product.isActive && (
            <AppButton
              label="Take off sale"
              mode="outlined"
              onPress={confirmDeactivate}
              loading={deactivateProduct.isPending}
              labelStyle={{ color: c.error }}
            />
          )}
        </>
      )}

      <Text style={[styles.mrpNote, { color: c.textDisabled }]}>
        Sells for {formatPaise(product.sellPaise)} · updated {new Date(product.updatedAt).toLocaleDateString('en-IN')}
      </Text>

      <StockAdjustModal
        target={stockTarget}
        submitting={adjustStock.isPending}
        onCancel={() => setStockTarget(null)}
        onSubmit={(input) => {
          if (!stockTarget) return;
          adjustStock.mutate(
            { id: stockTarget.productId, ...input },
            {
              onSuccess: () => setStockTarget(null),
              onError: (e: unknown) => Alert.alert('Could not adjust stock', apiErrorMessage(e)),
            },
          );
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 4, paddingBottom: 40 },
  offSaleBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: radii.sm, padding: 10, marginBottom: 10 },
  stockCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 12,
  },
  stockLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  stockValue: { fontSize: 22, fontWeight: '600', marginTop: 2 },
  adjustBtn: { borderWidth: 1.5, borderRadius: radii.card, paddingHorizontal: 14, paddingVertical: 9 },
  row2: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  switchBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2, marginTop: 12, marginBottom: 6 },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  unitChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  /** Dims the row for a viewer while leaving the CHOSEN unit readable — it is still the answer they came to read. */
  readOnlyRow: { opacity: 0.65 },
  readOnlyBanner: { borderRadius: radii.sm, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 10 },
  readOnlyText: { fontSize: 11.5, fontWeight: '600' },
  mrpNote: { fontSize: 11, textAlign: 'center', marginTop: 8 },
});
