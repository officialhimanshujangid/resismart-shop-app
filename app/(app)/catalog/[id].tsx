import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View, useColorScheme, Pressable } from 'react-native';
import { Text, Switch } from 'react-native-paper';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { fontFamily } from '../../../src/theme/tokens';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage, apiErrorCode, apiErrorParams } from '../../../src/api/axios'; // MP1-COMPLETE: + code/params
import { ErrorBlock } from '../../../src/features/more/ui';
import { parseRupeesToPaise, paiseToInput, formatPaise } from '../../../src/lib/money';
import { AppInput } from '../../../src/components/AppInput';
// M20 — DS v1 kit (green, light + dark): buttons, badges, skeletons, motion, stock bar.
import { Button, Skeleton, StatusBadge } from '../../../src/components/ui';
import { Rise, useCountUp } from '../../../src/theme/motion';
import { StockBar } from '../../../src/features/catalog/components/StockBar';
import { PRODUCT_UNITS, ProductUnit } from '../../../src/types/api-contract.generated';
import {
  useProduct, useProductCategories, useUpdateProduct, useDeactivateProduct, useAdjustStock,
  CategoryPicker, ProductImages, StockAdjustModal,
} from '../../../src/features/catalog';
import type { StockAdjustTarget } from '../../../src/features/catalog';
import { formatI18nDate } from '../../../src/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../../src/lib/queryKeys';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { stockApi } from '../../../src/features/stock/api';
import { OpeningStockDialog } from '../../../src/features/stock/components/OpeningStockDialog';
import { useCategoryModules } from '../../../src/features/p2/useCategoryModules';
// Commerce C3 bundles / C6 sizes & labels — each card draws nothing unless it applies.
import { VariantsCard } from '../../../src/features/commerce/components/VariantsCard';
import { BundleCard } from '../../../src/features/commerce/components/BundleCard';
import { LabelsSheet } from '../../../src/features/commerce/components/LabelsSheet';
// >>> MP1-COMPLETE — P1: online-shop page + quantity rules (C1 product fields).
import { useCommerceAccess } from '../../../src/features/commerce/access';
import { ProductCommerceFields } from '../../../src/features/catalog/components/ProductCommerceFields';
import {
  EMPTY_SHOP_FIELDS, ShopFieldKey, ShopFieldsForm, shopFieldOfError, shopFieldsBody, shopFieldsFormOf, shopFieldsOn,
  shopFieldsProblems,
} from '../../../src/features/catalog/commerceFields';
// <<< MP1-COMPLETE

export default function ProductDetailScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = usePartnerEntitlements();
  const canManage = can('CATALOG_MANAGE', 'FULL');
  // P1 (§5.2): stock changes are STOCK_MANAGE (derived from CATALOG_MANAGE);
  // cost prices are COSTS (screens S9, S10, S26).
  const canStock = can('STOCK_MANAGE', 'FULL');
  const canCosts = can('COSTS', 'READ');
  /** P2: the Pharmacy module is on and this person may see it. */
  const pharmacyOn = useCategoryModules().has('PHARMACY') && can('PHARMACY_VIEW', 'READ');
  const queryClient = useQueryClient();
  const [openingOpen, setOpeningOpen] = useState(false);
  const opening = useMutation({
    mutationFn: (body: { qty: number; unitCostPaise: number }) => stockApi.openingStock(id, body, newIdempotencyKey('opening')),
    onSuccess: () => {
      setOpeningOpen(false);
      void queryClient.invalidateQueries({ queryKey: qk.catalog.all() });
    },
    onError: (e: unknown) => Alert.alert(t('catalog.detail.adjustFailed'), apiErrorMessage(e)),
  });

  const productQuery = useProduct(id);
  // M20 — a product beyond the plan's catalogue items is VIEW-ONLY (the server refuses
  // ITEM_VIEW_ONLY on save); the form opens read-only and says why. Taking it off sale stays.
  const viewOnly = productQuery.data?.viewOnly === true;
  const editable = canManage && !viewOnly;
  const shownQty = useCountUp(productQuery.data?.trackStock ? productQuery.data.stockQty : 0);
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
  const [labelsOpen, setLabelsOpen] = useState(false);
  /** C3/C6: a bundle and a sizes parent keep no stock of their own — never send `trackStock: true` for them. */
  const noOwnStock = !!productQuery.data?.isVariantParent || !!productQuery.data?.bundleComponents?.length;
  // >>> MP1-COMPLETE — P1
  const commerceAccess = useCommerceAccess();
  const shopOn = shopFieldsOn(commerceAccess, productQuery.data);
  const [shopFields, setShopFields] = useState<ShopFieldsForm>(EMPTY_SHOP_FIELDS);
  const [shopErrors, setShopErrors] = useState<Partial<Record<ShopFieldKey, string>>>({});
  useEffect(() => {
    if (productQuery.data) setShopFields(shopFieldsFormOf(productQuery.data));
  }, [productQuery.data]);
  // <<< MP1-COMPLETE

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
    if (!name.trim()) nextErrors.name = t('catalog.form.nameRequired');
    const sellPaise = parseRupeesToPaise(sellPrice);
    if (sellPaise === null) nextErrors.sellPrice = t('catalog.form.sellPriceRequired');
    const mrpPaise = mrp.trim() ? parseRupeesToPaise(mrp) : 0;
    if (mrp.trim() && mrpPaise === null) nextErrors.mrp = t('catalog.form.amountInvalid');
    if (mrpPaise !== null && mrpPaise > 0 && sellPaise !== null && sellPaise > mrpPaise) {
      nextErrors.sellPrice = t('catalog.form.sellAboveMrp');
    }
    const taxRateNum = Number(taxRate || '0');
    if (!Number.isFinite(taxRateNum) || taxRateNum < 0 || taxRateNum > 100) nextErrors.taxRate = t('catalog.form.taxRateRange');
    const lowStockNum = lowStockAt.trim() ? Number(lowStockAt) : undefined;
    if (lowStockAt.trim() && (!Number.isFinite(lowStockNum) || (lowStockNum as number) < 0)) {
      nextErrors.lowStockAt = t('catalog.form.wholeNumber');
    }

    setErrors(nextErrors);
    // >>> MP1-COMPLETE — P1: the shop-page fields are checked with the rest (server rules, said sooner).
    const shopProblems = shopOn ? shopFieldsProblems(shopFields, unit) : {};
    const nextShopErrors: Partial<Record<ShopFieldKey, string>> = {};
    for (const [k, p] of Object.entries(shopProblems)) if (p) nextShopErrors[k as ShopFieldKey] = t(p.key, p.params);
    setShopErrors(nextShopErrors);
    if (Object.keys(nextShopErrors).length > 0) return;
    // <<< MP1-COMPLETE
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
        lowStockAt: noOwnStock ? null : lowStockNum ?? null,
        trackStock: noOwnStock ? false : trackStock,
        // This screen omitted `images` entirely, so a product could never gain a
        // photo after it was created — and, worse, `updateProductSchema` treats
        // a missing key as "leave it alone", which meant the omission was silent
        // rather than an error anybody would notice. Sent as a whole array,
        // matching how the schema reads it: this IS the new list.
        images,
        categoryId: categoryId ?? null,
        // MP1-COMPLETE — P1: only what changed; an emptied box is sent as `null` (clears it).
        ...(shopOn ? shopFieldsBody(shopFields, productQuery.data) : {}),
      },
      {
        onError: (e: unknown) => {
          // MP1-COMPLETE — P1: COMMERCE_FIELD_INVALID {field} marks that box with the server's sentence.
          const badField = shopFieldOfError(apiErrorCode(e), apiErrorParams(e));
          if (badField) setShopErrors({ [badField]: apiErrorMessage(e) });
          Alert.alert(t('catalog.form.saveFailed'), apiErrorMessage(e));
        },
      },
    );
  };

  const confirmDeactivate = () => {
    if (!productQuery.data) return;
    Alert.alert(
      t('catalog.detail.takeOffSaleTitle'),
      t('catalog.detail.takeOffSaleBody', { name: productQuery.data.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('catalog.detail.takeOffSale'), style: 'destructive',
          onPress: () => deactivateProduct.mutate(id, {
            onError: (e: unknown) => Alert.alert(t('catalog.detail.actionFailed'), apiErrorMessage(e)),
            onSuccess: () => router.back(),
          }),
        },
      ],
    );
  };

  const reactivate = () => {
    updateProduct.mutate({ isActive: true }, { onError: (e: unknown) => Alert.alert(t('catalog.detail.actionFailed'), apiErrorMessage(e)) });
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
    ? apiErrorMessage(productQuery.error, t('catalog.detail.loadFailed'))
    : productQuery.isPending && productQuery.isPaused
      ? t('catalog.detail.noConnection')
      : null;

  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ErrorBlock c={c} message={loadError} onRetry={() => void productQuery.refetch()} />
      </View>
    );
  }

  if (!productQuery.data) {
    // M20 — content-shaped placeholders, not a lone spinner.
    return (
      <View style={[styles.skeleton, { backgroundColor: c.background }]} accessibilityLabel={t('common.loading')}>
        <Skeleton height={96} rounded={22} />
        <Skeleton height={52} rounded={16} />
        <Skeleton height={52} rounded={16} />
        <Skeleton width="60%" height={52} rounded={16} />
      </View>
    );
  }

  const product = productQuery.data;

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.body}>
      {!product.isActive && (
        <Rise index={0} style={[styles.offSaleBanner, { backgroundColor: c.surfaceVariant }]}>
          <Text style={{ color: c.textPrimary, fontSize: 12.5, fontWeight: '600', flexShrink: 1 }}>{t('catalog.detail.offSale')}</Text>
          {canManage && (
            <Button size="sm" variant="ghost" label={t('catalog.detail.turnBackOn')} onPress={reactivate} />
          )}
        </Rise>
      )}

      {/* >>> M20 — view-only (beyond the plan's catalogue items). */}
      {viewOnly && (
        <Rise index={0} style={[styles.viewOnlyBanner, { borderColor: c.warning }]} testID="product-view-only">
          <StatusBadge tone="warn" label={t('catalog.viewOnly.badge')} style={styles.viewOnlyBadge} />
          <Text style={{ color: c.textPrimary, fontSize: 12.5, lineHeight: 18 }}>{t('catalog.viewOnly.detail')}</Text>
        </Rise>
      )}
      {/* <<< M20 */}

      {!canManage && (
        <View style={[styles.readOnlyBanner, { backgroundColor: c.surfaceVariant }]}>
          <Text style={[styles.readOnlyText, { color: c.textSecondary }]}>
            {t('catalog.form.readOnlyBanner')}
          </Text>
        </View>
      )}

      <Rise index={1} style={[styles.stockCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.stockText}>
          <Text style={[styles.stockLabel, { color: c.textSecondary }]}>{t('catalog.detail.onHand')}</Text>
          <Text style={[styles.stockValue, { color: c.textPrimary }]}>
            {/* M20: the count counts up (whole numbers; final at once under reduce-motion). */}
            {product.trackStock
              ? (Number.isInteger(product.stockQty) ? String(Math.round(shownQty)) : product.stockQty)
              : t('catalog.detail.notTracked')}
          </Text>
          {product.trackStock ? (
            <StockBar qty={product.stockQty} lowAt={product.lowStockAt} max={product.maxStockQty} width={120} style={styles.stockBar} />
          ) : null}
          {/* Every stock change is on the ledger (contract §5) — who, when, why. */}
          <Pressable
            onPress={() => router.push({ pathname: '/catalog/history/[id]', params: { id: product._id, name: product.name } })}
            accessibilityRole="link"
            hitSlop={8}
            style={styles.historyLink}
          >
            <Text style={{ color: c.primary, fontWeight: '600', fontSize: 12.5 }}>{t('stockHistory.openLink')}</Text>
          </Pressable>
        </View>
        {canStock && product.trackStock && (
          <Button
            size="sm"
            variant="outline"
            label={t('catalog.detail.adjustStock')}
            onPress={() => setStockTarget({ productId: product._id, productName: product.name, currentQty: product.stockQty })}
          />
        )}
      </Rise>

      {/* P2 PHARMACY: medicine details (schedule, batch tracking) and batches. */}
      {pharmacyOn && (
        <Button
          size="sm"
          variant="soft"
          icon="pill"
          label={t('p2.billing.medicineDetails')}
          onPress={() => router.push(`/pharmacy/product/${product._id}` as Href)}
          style={styles.sideAction}
          testID="product-pharmacy-link"
        />
      )}

      {/* Commerce: sizes & types (C6), bundle contents (C3), barcode labels (C6). */}
      <VariantsCard product={product} />
      <BundleCard product={product} />
      {product.barcode && !product.isVariantParent ? (
        <Button
          size="sm"
          variant="soft"
          icon="printer-outline"
          label={t('commerce.labels.print')}
          onPress={() => setLabelsOpen(true)}
          style={styles.sideAction}
          testID="product-print-labels"
        />
      ) : null}
      <LabelsSheet visible={labelsOpen} onDismiss={() => setLabelsOpen(false)} items={[{ productId: product._id, name: product.name }]} />

      {/* P1 cost line — the fields arrive only for a COSTS holder. */}
      {typeof product.avgCostPaise === 'number' && (
        <Text style={[styles.mrpNote, { color: c.textSecondary, textAlign: 'left', marginBottom: 8 }]} testID="product-cost">
          {t('catalog.detail.costLine', {
            avg: formatPaise(product.avgCostPaise),
            value: formatPaise(product.stockValuePaise ?? 0),
          })}
          {typeof product.marginPercent === 'number' ? t('catalog.detail.marginSuffix', { margin: product.marginPercent.toFixed(1) }) : ''}
        </Text>
      )}
      {canStock && canCosts && product.trackStock && (
        <Button size="sm" variant="outline" label={t('catalog.opening.button')} onPress={() => setOpeningOpen(true)} style={styles.sideAction} />
      )}

      <AppInput label={t('catalog.form.name')} value={name} onChangeText={setName} error={errors.name} disabled={!editable} />

      <View style={styles.row2}>
        <AppInput label={t('catalog.form.sellPrice')} value={sellPrice} onChangeText={setSellPrice} keyboardType="numeric" error={errors.sellPrice} style={styles.half} disabled={!editable} />
        <AppInput label={t('catalog.form.mrp')} value={mrp} onChangeText={setMrp} keyboardType="numeric" error={errors.mrp} style={styles.half} disabled={!editable} />
      </View>

      <View style={styles.row2}>
        <AppInput label={t('catalog.form.taxRate')} value={taxRate} onChangeText={setTaxRate} keyboardType="numeric" error={errors.taxRate} style={styles.half} disabled={!editable} />
        <View style={[styles.half, styles.switchBox]}>
          <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600', flexShrink: 1 }}>{t('catalog.form.priceIncludesTax')}</Text>
          <Switch value={taxInclusive} onValueChange={setTaxInclusive} disabled={!editable} />
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('catalog.form.unit')}</Text>
      {/* The unit CODES are not translated — see `catalog/create.tsx`'s note on
          why: they are the wire value and are printed on every invoice line. */}
      {/* `disabled`, not an `onPress` that evaluates to `false`: every field
          above already refuses a viewer visibly (`AppInput disabled`), and the
          unit chips were the one control on this screen that took the tap and
          did nothing with it. The banner at the top says why. */}
      <View style={[styles.unitRow, !editable && styles.readOnlyRow]}>
        {PRODUCT_UNITS.map((u) => {
          const active = u === unit;
          return (
            <Pressable
              key={u}
              onPress={() => setUnit(u)}
              disabled={!editable}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: !editable }}
              style={[styles.unitChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
            >
              {/* M20: `textInverse`, not white — in dark mode the green fill takes deep-green ink. */}
              <Text style={{ color: active ? c.textInverse : c.textSecondary, fontSize: 12.5, fontWeight: '600' }}>{u}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Uploaded immediately, saved with the form. Adding a photo and then
          leaving without pressing Save leaves an orphan in the bucket and no
          reference to it — the cheaper of the two failures, and the same trade
          `ProductImages`'s remove path documents. */}
      <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('catalog.form.photos')}</Text>
      <ProductImages value={images} onChange={setImages} c={c} canManage={editable} />

      <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('catalog.form.category')}</Text>
      <CategoryPicker categories={categoriesQuery.data ?? []} value={categoryId} onChange={setCategoryId} canManage={editable} />

      <AppInput label={t('catalog.form.sku')} value={sku} onChangeText={setSku} autoCapitalize="characters" disabled={!editable} />
      <AppInput label={t('catalog.form.barcode')} value={barcode} onChangeText={setBarcode} autoCapitalize="characters" disabled={!editable} />
      <AppInput label={t('catalog.form.hsn')} value={hsnCode} onChangeText={setHsnCode} disabled={!editable} />

      {noOwnStock ? (
        <Text style={{ color: c.textSecondary, fontSize: 12.5, marginTop: 4 }} testID="product-no-own-stock">
          {product.isVariantParent ? t('commerce.variants.stockOnSizes') : t('commerce.bundles.stockOnItems')}
        </Text>
      ) : (
        <View style={[styles.switchBox, { marginTop: 4 }]}>
          <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600', flexShrink: 1 }}>{t('catalog.form.trackStock')}</Text>
          <Switch value={trackStock} onValueChange={setTrackStock} disabled={!editable} />
        </View>
      )}

      {trackStock && !noOwnStock && (
        <AppInput label={t('catalog.form.lowStockAt')} value={lowStockAt} onChangeText={setLowStockAt} keyboardType="numeric" error={errors.lowStockAt} disabled={!editable} />
      )}

      {/* >>> MP1-COMPLETE — P1 */}
      {shopOn ? (
        <ProductCommerceFields
          c={c}
          unit={unit}
          value={shopFields}
          onChange={(patch) => setShopFields((f) => ({ ...f, ...patch }))}
          errors={shopErrors}
          disabled={!editable}
        />
      ) : null}
      {/* <<< MP1-COMPLETE */}

      {canManage && (
        <View style={styles.actions}>
          {editable ? (
            <Button label={t('catalog.form.saveChanges')} onPress={save} loading={updateProduct.isPending} fullWidth />
          ) : null}
          {product.isActive && (
            <Button
              label={t('catalog.detail.takeOffSale')}
              variant="dangerOutline"
              onPress={confirmDeactivate}
              loading={deactivateProduct.isPending}
              fullWidth
            />
          )}
        </View>
      )}

      <Text style={[styles.mrpNote, { color: c.textSecondary }]}>
        {t('catalog.detail.footnote', { price: formatPaise(product.sellPaise), date: formatI18nDate(product.updatedAt, t) })}
      </Text>

      <OpeningStockDialog
        visible={openingOpen}
        name={product.name}
        submitting={opening.isPending}
        onCancel={() => setOpeningOpen(false)}
        onSubmit={(body) => opening.mutate(body)}
      />
      <StockAdjustModal
        showCost={canCosts}
        target={stockTarget}
        submitting={adjustStock.isPending}
        onCancel={() => setStockTarget(null)}
        onSubmit={(input) => {
          if (!stockTarget) return;
          adjustStock.mutate(
            { id: stockTarget.productId, ...input },
            {
              onSuccess: () => setStockTarget(null),
              onError: (e: unknown) => Alert.alert(t('catalog.detail.adjustFailed'), apiErrorMessage(e)),
            },
          );
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  skeleton: { flex: 1, padding: 16, gap: 12 },
  viewOnlyBanner: { borderWidth: 1, borderRadius: radii.card, padding: 12, gap: 6, marginBottom: 10 },
  viewOnlyBadge: { alignSelf: 'flex-start' },
  stockBar: { marginTop: 8 },
  sideAction: { marginBottom: 10 },
  actions: { gap: 10, marginTop: 12 },
  body: { padding: 16, gap: 4, paddingBottom: 40 },
  offSaleBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderRadius: radii.card, padding: 10, marginBottom: 10 },
  stockCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    borderRadius: radii.card, borderWidth: 1, padding: 16, marginBottom: 12,
  },
  stockText: { flex: 1, minWidth: 0 },
  historyLink: { alignSelf: 'flex-start', marginTop: 6 },
  stockLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  stockValue: { fontSize: 26, fontFamily: fontFamily.sora600, marginTop: 2 },
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
