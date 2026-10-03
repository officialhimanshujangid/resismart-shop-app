import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View, useColorScheme, Pressable } from 'react-native';
import { Text, Switch, HelperText, IconButton, Portal, Modal } from 'react-native-paper';
import { router, useLocalSearchParams, Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { apiErrorMessage, isUpgradeRequired, apiErrorCode, apiErrorParams } from '../../../src/api/axios'; // MP1-COMPLETE: + code/params
import { parseRupeesToPaise } from '../../../src/lib/money';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { PRODUCT_UNITS, ProductUnit } from '../../../src/types/api-contract.generated';
import { useCreateProduct, useProductCategories, CategoryPicker, ProductImages, UsageMeterBar } from '../../../src/features/catalog';
import { BarcodeScannerView, ProductScanOutcome } from '../../../src/features/scanner';
// Commerce C3: "This is a bundle" — only when the shop switched Bundles on.
import { useCommerceAccess } from '../../../src/features/commerce/access';
import { BundleEditor } from '../../../src/features/commerce/components/BundleCard';
import { SwitchRow } from '../../../src/features/commerce/components/ui';
import { bundleProblem } from '../../../src/features/commerce/logic';
import type { BundleComponent } from '../../../src/features/commerce/types';
// >>> MP1-COMPLETE — P1: online-shop page + quantity rules (C1 product fields).
import { ProductCommerceFields } from '../../../src/features/catalog/components/ProductCommerceFields';
import {
  EMPTY_SHOP_FIELDS, ShopFieldKey, ShopFieldsForm, shopFieldOfError, shopFieldsBody, shopFieldsOn, shopFieldsProblems,
} from '../../../src/features/catalog/commerceFields';
// <<< MP1-COMPLETE

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
 *
 * **The Barcode field carries its own scan button too (E5).** Reaching this
 * screen via `/catalog/scan`'s "unknown code" hand-off already covers the
 * common case, but a partner can also open Add straight from the catalog list
 * for an item they have not scanned yet — that path had no camera at all, so
 * the barcode had to be typed by hand. The button below opens the same
 * `BarcodeScannerView` used everywhere else in a `Portal`/`Modal`, over this
 * screen rather than navigating away from it, so nothing already typed above
 * (name, price, unit…) is lost while the camera is open.
 */
export default function CreateProductScreen() {
  const { t } = useTranslation();
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
  const [images, setImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const commerceAccess = useCommerceAccess();
  const bundlesOn = commerceAccess.has('BUNDLES');
  // >>> MP1-COMPLETE — P1
  const shopOn = shopFieldsOn(commerceAccess);
  const [shopFields, setShopFields] = useState<ShopFieldsForm>(EMPTY_SHOP_FIELDS);
  const [shopErrors, setShopErrors] = useState<Partial<Record<ShopFieldKey, string>>>({});
  // <<< MP1-COMPLETE
  const [isBundle, setIsBundle] = useState(false);
  const [components, setComponents] = useState<BundleComponent[]>([]);
  const [componentNames, setComponentNames] = useState<Record<string, string>>({});

  const canManage = can('CATALOG_MANAGE', 'FULL');

  const handleBarcodeScan = useCallback((outcome: ProductScanOutcome) => {
    if (outcome.status === 'unknown') {
      setBarcode(outcome.barcode);
      setScannerOpen(false);
      return;
    }
    if (outcome.status === 'found') {
      // This code already belongs to a product. Filling it in here would only
      // fail at save time on the barcode's unique index — send the partner to
      // the product that already owns it instead of letting them discover
      // that the hard way after typing out a name and a price.
      setScannerOpen(false);
      Alert.alert(
        t('catalog.form.barcodeTakenTitle'),
        t('catalog.form.barcodeTakenBody', { name: outcome.product.name }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('catalog.form.barcodeTakenOpen'),
            onPress: () => router.push({ pathname: '/catalog/[id]', params: { id: outcome.product._id } }),
          },
        ],
      );
      return;
    }
    // 'error' — the lookup itself failed (network/5xx), not "code unknown".
    // The camera stays open; nothing has been decided about this code yet.
    //
    // The retry is a physical one: the scanner latched when it read this code
    // and will not read anything again until the pack has left the frame for a
    // moment, so dismissing this alert while still hovering over the same
    // barcode does nothing. Lifting the phone and re-aiming — which is what a
    // person does after an error anyway — re-arms it. Deliberately not forced
    // by closing and reopening the modal here: that would throw away the
    // camera and the torch state for what is usually a one-second blip.
    Alert.alert(t('catalog.form.barcodeCheckFailed'), outcome.message);
  }, [t]);

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
    if (!name.trim()) nextErrors.name = t('catalog.form.nameRequired');
    const sellPaise = parseRupeesToPaise(sellPrice);
    if (sellPaise === null) nextErrors.sellPrice = t('catalog.form.sellPriceRequired');
    const mrpPaise = mrp.trim() ? parseRupeesToPaise(mrp) : 0;
    if (mrp.trim() && mrpPaise === null) nextErrors.mrp = t('catalog.form.amountInvalid');
    if (mrpPaise !== null && mrpPaise > 0 && sellPaise !== null && sellPaise > mrpPaise) {
      nextErrors.sellPrice = t('catalog.form.sellAboveMrp');
    }
    const stockQtyNum = Number(stockQty || '0');
    if (!Number.isFinite(stockQtyNum) || stockQtyNum < 0) nextErrors.stockQty = t('catalog.form.stockNegative');
    const taxRateNum = Number(taxRate || '0');
    if (!Number.isFinite(taxRateNum) || taxRateNum < 0 || taxRateNum > 100) nextErrors.taxRate = t('catalog.form.taxRateRange');
    const lowStockNum = lowStockAt.trim() ? Number(lowStockAt) : undefined;
    if (lowStockAt.trim() && (!Number.isFinite(lowStockNum) || (lowStockNum as number) < 0)) {
      nextErrors.lowStockAt = t('catalog.form.wholeNumber');
    }
    const bundle = bundlesOn && isBundle;
    if (bundle) {
      const problem = bundleProblem(components);
      if (problem !== 'NONE') nextErrors.bundle = t(`commerce.bundles.err.${problem}`);
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
        // A bundle keeps no stock of its own (C-9): selling it moves its items' stock.
        stockQty: bundle ? 0 : stockQtyNum,
        lowStockAt: bundle ? undefined : lowStockNum,
        trackStock: bundle ? false : trackStock,
        ...(bundle ? { bundleComponents: components } : {}),
        // Was a hardcoded `images: []` — which is why every item in every
        // partner's catalogue was a line of text to the residents browsing it.
        // These URLs are the ones `POST /upload` returned and are stored
        // verbatim; `createProductSchema` refuses anything that is not from our
        // own bucket, so none of them is ever built by hand. See `ProductImages`.
        images,
        categoryId,
        isActive: true,
        // MP1-COMPLETE — P1: only the boxes filled in (an empty box sends nothing).
        ...(shopOn ? shopFieldsBody(shopFields) : {}),
      },
      {
        onSuccess: goBackToOrigin,
        onError: (e: unknown) => {
          if (isUpgradeRequired(e)) {
            Alert.alert(t('catalog.form.planLimitTitle'), apiErrorMessage(e));
            return;
          }
          // MP1-COMPLETE — P1: COMMERCE_FIELD_INVALID {field} marks that box with the server's sentence.
          const badField = shopFieldOfError(apiErrorCode(e), apiErrorParams(e));
          if (badField) setShopErrors({ [badField]: apiErrorMessage(e) });
          Alert.alert(t('catalog.form.createFailed'), apiErrorMessage(e));
        },
      },
    );
  };

  if (!canManage) {
    return (
      <View style={[styles.deniedBox, { backgroundColor: c.background }]}>
        <Text style={{ color: c.textSecondary, textAlign: 'center' }}>
          {t('catalog.form.deniedBody')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.body}>
      <UsageMeterBar cap={cap} c={c} />

      <AppInput label={t('catalog.form.name')} value={name} onChangeText={setName} error={errors.name} />

      <View style={styles.row2}>
        <AppInput label={t('catalog.form.sellPrice')} value={sellPrice} onChangeText={setSellPrice} keyboardType="numeric" error={errors.sellPrice} style={styles.half} />
        <AppInput label={t('catalog.form.mrp')} value={mrp} onChangeText={setMrp} keyboardType="numeric" error={errors.mrp} style={styles.half} />
      </View>

      <View style={styles.row2}>
        <AppInput label={t('catalog.form.taxRate')} value={taxRate} onChangeText={setTaxRate} keyboardType="numeric" error={errors.taxRate} style={styles.half} />
        <View style={[styles.half, styles.switchBox]}>
          <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>{t('catalog.form.priceIncludesTax')}</Text>
          <Switch value={taxInclusive} onValueChange={setTaxInclusive} />
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('catalog.form.unit')}</Text>
      {/*
        The unit codes themselves are NOT translated, and this is the same
        distinction `features/billing/types.ts` draws between a wire value and a
        label. `PRODUCT_UNITS` comes from `api-contract.generated.ts`, is sent as
        `unit` on the product, and is stored on every invoice line — which
        `billing/[id].tsx` prints back verbatim as server data. A Hindi chip here
        would mean the picker and the printed bill disagreed about the same
        product, which is worse than an abbreviation both languages already read.
      */}
      <View style={styles.unitRow}>
        {PRODUCT_UNITS.map((u) => {
          const active = u === unit;
          return (
            <Pressable
              key={u}
              onPress={() => setUnit(u)}
              style={[styles.unitChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
            >
              <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12.5, fontWeight: '600' }}>{u}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Above Category and above SKU: a shop adding stock has the item in its
          hand, and photographing it first is the natural order. Each photo
          uploads as it is picked rather than at save, so a bad connection costs
          one picture instead of the whole form. */}
      <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('catalog.form.photos')}</Text>
      <ProductImages value={images} onChange={setImages} c={c} canManage={canManage} />

      <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('catalog.form.category')}</Text>
      <CategoryPicker categories={categoriesQuery.data ?? []} value={categoryId} onChange={setCategoryId} canManage={canManage} />

      <AppInput label={t('catalog.form.sku')} value={sku} onChangeText={setSku} autoCapitalize="characters" />
      <View style={styles.barcodeRow}>
        <AppInput label={t('catalog.form.barcode')} value={barcode} onChangeText={setBarcode} autoCapitalize="characters" style={styles.barcodeInput} />
        <IconButton
          icon="barcode-scan"
          mode="outlined"
          size={22}
          onPress={() => setScannerOpen(true)}
          accessibilityLabel={t('catalog.form.scanBarcode')}
          style={styles.scanBtn}
        />
      </View>
      <AppInput label={t('catalog.form.hsn')} value={hsnCode} onChangeText={setHsnCode} />

      {bundlesOn ? (
        <View style={[styles.bundleBox, { borderColor: c.divider }]}>
          <SwitchRow
            c={c}
            label={t('commerce.bundles.isBundle')}
            hint={t('commerce.bundles.isBundleHint')}
            value={isBundle}
            onValueChange={setIsBundle}
            testID="create-is-bundle"
          />
          {isBundle ? (
            <BundleEditor
              c={c}
              value={components}
              onChange={setComponents}
              names={componentNames}
              onNames={(add) => setComponentNames((n) => ({ ...n, ...add }))}
            />
          ) : null}
          {errors.bundle ? <HelperText type="error" visible>{errors.bundle}</HelperText> : null}
        </View>
      ) : null}

      {!(bundlesOn && isBundle) && (
        <View style={[styles.switchBox, { marginTop: 4 }]}>
          <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>{t('catalog.form.trackStock')}</Text>
          <Switch value={trackStock} onValueChange={setTrackStock} />
        </View>
      )}

      {trackStock && !(bundlesOn && isBundle) && (
        <View style={styles.row2}>
          <AppInput label={t('catalog.form.openingStock')} value={stockQty} onChangeText={setStockQty} keyboardType="numeric" error={errors.stockQty} style={styles.half} />
          <AppInput label={t('catalog.form.lowStockAt')} value={lowStockAt} onChangeText={setLowStockAt} keyboardType="numeric" error={errors.lowStockAt} style={styles.half} />
        </View>
      )}

      {/* >>> MP1-COMPLETE — P1 */}
      {shopOn ? (
        <ProductCommerceFields
          c={c}
          unit={unit}
          value={shopFields}
          onChange={(patch) => setShopFields((f) => ({ ...f, ...patch }))}
          errors={shopErrors}
        />
      ) : null}
      {/* <<< MP1-COMPLETE */}

      {cap.atLimit && (
        <HelperText type="error" visible>
          {t('catalog.form.atLimit')}
        </HelperText>
      )}

      <AppButton label={t('catalog.form.saveProduct')} onPress={submit} loading={createProduct.isPending} disabled={cap.atLimit} />

      <Portal>
        <Modal
          visible={scannerOpen}
          onDismiss={() => setScannerOpen(false)}
          contentContainerStyle={[styles.scannerModal, { backgroundColor: c.background }]}
        >
          <View style={styles.scannerHeader}>
            <Text style={{ color: c.textPrimary, fontSize: 16, fontWeight: '600' }}>{t('catalog.form.scannerTitle')}</Text>
            <IconButton icon="close" onPress={() => setScannerOpen(false)} accessibilityLabel={t('catalog.form.scannerDone')} />
          </View>
          {/* >>> SCANNER — a receiving screen: a carton's full ITF-14 is accepted too. */}
          <BarcodeScannerView active={scannerOpen} onResult={handleBarcodeScan} hint={t('catalog.form.scannerHint')} cartonCodes />
        </Modal>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 4, paddingBottom: 40 },
  row2: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  switchBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2, marginTop: 12, marginBottom: 6 },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  unitChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  deniedBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  barcodeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bundleBox: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6, marginVertical: 6, gap: 6 },
  barcodeInput: { flex: 1 },
  scanBtn: { marginTop: 2 },
  scannerModal: { flex: 1, margin: 0 },
  scannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 8 },
});
