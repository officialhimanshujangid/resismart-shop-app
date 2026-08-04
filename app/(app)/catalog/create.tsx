import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View, useColorScheme, Pressable } from 'react-native';
import { Text, Switch, HelperText } from 'react-native-paper';
import { router, useLocalSearchParams, Href } from 'expo-router';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { apiErrorMessage, isUpgradeRequired } from '../../../src/api/axios';
import { parseRupeesToPaise } from '../../../src/lib/money';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { PRODUCT_UNITS, ProductUnit } from '../../../src/types/api-contract.generated';
import { useCreateProduct, useProductCategories, CategoryPicker, UsageMeterBar } from '../../../src/features/catalog';

/**
 * New product. `?barcode=` and `?returnTo=` are the scanner's contract — see
 * `src/features/scanner/index.ts`'s header: an unknown code opens THIS screen
 * pre-filled, and saving returns to where the scan happened.
 *
 * The `max_products` meter is drawn again here (index.tsx already showed it
 * before the Add button) because this screen is also reachable straight from
 * `/catalog/scan` — a partner who scans nine items and is at their limit on
 * the tenth must see why Save is refusing them, not just a 402 after typing
 * a name and a price.
 */
export default function CreateProductScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const params = useLocalSearchParams<{ barcode?: string; returnTo?: string }>();
  const { can } = usePartnerEntitlements();
  const { capacity } = usePlanUsage();
  const cap = capacity('max_products');
  const categoriesQuery = useProductCategories();
  const createProduct = useCreateProduct();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState(params.barcode ?? '');
  const [hsnCode, setHsnCode] = useState('');
  const [unit, setUnit] = useState<ProductUnit>('PCS');
  const [mrp, setMrp] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [stockQty, setStockQty] = useState('0');
  const [lowStockAt, setLowStockAt] = useState('');
  const [trackStock, setTrackStock] = useState(true);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const canManage = can('CATALOG_MANAGE', 'FULL');

  const goBackToOrigin = () => {
    if (params.returnTo) {
      // `returnTo` is a caller-chosen path, not one of this app's own
      // statically-known routes — expo-router's typed `Href` union can only
      // describe destinations this build has files for, and a scanner caller
      // this agent does not own (billing) may point it anywhere in this app.
      // The cast is the documented escape hatch for exactly that case; the
      // value itself already came from `useLocalSearchParams`, which decodes
      // the query string once, so it is not re-decoded here.
      router.replace(params.returnTo as Href);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      // Deliberately NOT cast. `/catalog` is a statically-known route
      // (`catalog/index.tsx`), so the generated declaration file is what
      // proves it still exists — if the screen is ever renamed or moved this
      // line must fail to compile. The `as Href` that used to be here was
      // added on the belief that the generator emitted a malformed union. It
      // does not: the union was malformed because the working tree's
      // `.expo/types/router.d.ts` had been hand-written rather than
      // generated, and the cast hid that for a whole phase.
      router.replace('/catalog');
    }
  };

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = 'A product needs a name.';
    const sellPaise = parseRupeesToPaise(sellPrice);
    if (sellPaise === null) nextErrors.sellPrice = 'Enter a selling price.';
    const mrpPaise = mrp.trim() ? parseRupeesToPaise(mrp) : 0;
    if (mrp.trim() && mrpPaise === null) nextErrors.mrp = 'That does not look like an amount.';
    if (mrpPaise !== null && mrpPaise > 0 && sellPaise !== null && sellPaise > mrpPaise) {
      nextErrors.sellPrice = 'Selling price cannot be above the MRP.';
    }
    const stockQtyNum = Number(stockQty || '0');
    if (!Number.isFinite(stockQtyNum) || stockQtyNum < 0) nextErrors.stockQty = 'Opening stock cannot be negative.';
    const taxRateNum = Number(taxRate || '0');
    if (!Number.isFinite(taxRateNum) || taxRateNum < 0 || taxRateNum > 100) nextErrors.taxRate = 'Enter 0–100.';
    const lowStockNum = lowStockAt.trim() ? Number(lowStockAt) : undefined;
    if (lowStockAt.trim() && (!Number.isFinite(lowStockNum) || (lowStockNum as number) < 0)) {
      nextErrors.lowStockAt = 'Enter a whole number.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || sellPaise === null) return;

    createProduct.mutate(
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
        stockQty: stockQtyNum,
        lowStockAt: lowStockNum,
        trackStock,
        images: [],
        categoryId,
        isActive: true,
      },
      {
        onSuccess: goBackToOrigin,
        onError: (e: unknown) => {
          if (isUpgradeRequired(e)) {
            Alert.alert('Plan limit reached', apiErrorMessage(e));
            return;
          }
          Alert.alert('Could not add product', apiErrorMessage(e));
        },
      },
    );
  };

  if (!canManage) {
    return (
      <View style={[styles.deniedBox, { backgroundColor: c.background }]}>
        <Text style={{ color: c.textSecondary, textAlign: 'center' }}>
          Your role does not include managing the catalog.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.body}>
      <UsageMeterBar cap={cap} c={c} />

      <AppInput label="Product name" value={name} onChangeText={setName} error={errors.name} />

      <View style={styles.row2}>
        <AppInput label="Selling price (₹)" value={sellPrice} onChangeText={setSellPrice} keyboardType="numeric" error={errors.sellPrice} style={styles.half} />
        <AppInput label="MRP (₹, optional)" value={mrp} onChangeText={setMrp} keyboardType="numeric" error={errors.mrp} style={styles.half} />
      </View>

      <View style={styles.row2}>
        <AppInput label="Tax rate %" value={taxRate} onChangeText={setTaxRate} keyboardType="numeric" error={errors.taxRate} style={styles.half} />
        <View style={[styles.half, styles.switchBox]}>
          <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>Price includes tax</Text>
          <Switch value={taxInclusive} onValueChange={setTaxInclusive} />
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>UNIT</Text>
      <View style={styles.unitRow}>
        {PRODUCT_UNITS.map((u) => {
          const active = u === unit;
          return (
            <Pressable
              key={u}
              onPress={() => setUnit(u)}
              style={[styles.unitChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
            >
              <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12.5, fontWeight: '700' }}>{u}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>CATEGORY</Text>
      <CategoryPicker categories={categoriesQuery.data ?? []} value={categoryId} onChange={setCategoryId} canManage={canManage} />

      <AppInput label="SKU (optional)" value={sku} onChangeText={setSku} autoCapitalize="characters" />
      <AppInput label="Barcode (optional)" value={barcode} onChangeText={setBarcode} autoCapitalize="characters" />
      <AppInput label="HSN code (optional)" value={hsnCode} onChangeText={setHsnCode} />

      <View style={[styles.switchBox, { marginTop: 4 }]}>
        <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>Track stock for this product</Text>
        <Switch value={trackStock} onValueChange={setTrackStock} />
      </View>

      {trackStock && (
        <View style={styles.row2}>
          <AppInput label="Opening stock" value={stockQty} onChangeText={setStockQty} keyboardType="numeric" error={errors.stockQty} style={styles.half} />
          <AppInput label="Low-stock alert at" value={lowStockAt} onChangeText={setLowStockAt} keyboardType="numeric" error={errors.lowStockAt} style={styles.half} />
        </View>
      )}

      {cap.atLimit && (
        <HelperText type="error" visible>
          You are at your plan's product limit — remove or deactivate one first, or ask to upgrade.
        </HelperText>
      )}

      <AppButton label="Save product" onPress={submit} loading={createProduct.isPending} disabled={cap.atLimit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 4, paddingBottom: 40 },
  row2: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  switchBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  unitChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  deniedBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
