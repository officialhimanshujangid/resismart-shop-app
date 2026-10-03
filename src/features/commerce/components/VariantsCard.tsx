import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { IconButton, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { formatPaise, paiseToInput, parseRupeesToPaise } from '../../../lib/money';
import { newIdempotencyKey } from '../../../lib/idempotency';
import { useProduct } from '../../catalog/hooks';
import type { Product } from '../../catalog/types';
import { Banner, PillButton } from '../../p1/ui';
import { ChoiceChips, Sheet } from '../../p2/ui';
import { useCommerceAccess } from '../access';
import { useSaveVariant, useVariants } from '../hooks';
import { variantAttrsProblem, variantLabelOf } from '../logic';
import {
  MAX_VARIANT_ATTRIBUTES, MAX_VARIANTS, VARIANT_ATTRIBUTE_NAMES,
  type VariantAttribute, type VariantAttributeName, type VariantInput,
} from '../types';

/**
 * "Sizes & types" on a product (C6, D-8): the parent is not sold itself; each
 * size is an ordinary product with its own price, stock and barcode, named
 * "Parent (label)". The first size turns the product into a parent — which
 * needs it to hold no stock (VARIANT_PARENT_HAS_STOCK).
 */
export function VariantsCard({ product }: { product: Product }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const access = useCommerceAccess();
  const isParent = !!product.isVariantParent;
  const canAdd = access.has('VARIANTS') && access.catalog.canManage;
  const variants = useVariants(product._id, isParent);
  const [editing, setEditing] = useState<Product | 'NEW' | null>(null);

  // A size of another product: say so and link up. Nothing else to manage here.
  if (product.variantParentId) return <PartOfParent parentId={product.variantParentId} />;
  if (!isParent && (!canAdd || product.bundleComponents?.length)) return null;

  const rows = variants.data ?? [];
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]} testID="variants-card">
      <View style={styles.head}>
        <MaterialCommunityIcons name="shape-outline" size={20} color={c.primary} />
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('commerce.variants.title')}</Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
        {isParent ? t('commerce.variants.parentNote') : t('commerce.variants.intro')}
      </Text>
      {!isParent && product.trackStock && product.stockQty > 0 ? (
        <Banner c={c} tone="warn" body={t('commerce.variants.hasStockWarn', { qty: product.stockQty })} />
      ) : null}
      {isParent && variants.isPending ? <ActivityIndicator color={c.primary} /> : null}
      {isParent && variants.isError ? <Text style={{ color: c.error }}>{apiErrorMessage(variants.error)}</Text> : null}
      {rows.map((v) => (
        <View key={v._id} style={[styles.row, { borderColor: c.divider }]}>
          <Pressable
            style={{ flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center' }}
            onPress={() => router.push(`/catalog/${v._id}` as Href)}
            accessibilityRole="link"
            accessibilityLabel={v.variantLabel || v.name}
            testID={`variant-row-${v._id}`}
          >
            <Text style={{ color: v.isActive === false ? c.textDisabled : c.textPrimary, fontWeight: '600' }} numberOfLines={1}>
              {v.variantLabel || v.name}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
              {[formatPaise(v.sellPaise), v.trackStock ? t('commerce.variants.stock', { qty: v.stockQty }) : null, v.barcode || null]
                .filter(Boolean).join(' · ')}
            </Text>
          </Pressable>
          {access.catalog.canManage ? (
            <IconButton icon="pencil-outline" size={20} onPress={() => setEditing(v)} accessibilityLabel={t('commerce.variants.editA11y', { name: v.variantLabel || v.name })} />
          ) : null}
        </View>
      ))}
      {canAdd && rows.length < MAX_VARIANTS ? (
        <PillButton c={c} tone="outline" icon="plus" label={t('commerce.variants.add')} onPress={() => setEditing('NEW')} testID="variant-add" />
      ) : null}
      {editing ? (
        <VariantSheet
          parent={product}
          variant={editing === 'NEW' ? null : editing}
          onDismiss={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
}

function PartOfParent({ parentId }: { parentId: string }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const parent = useProduct(parentId);
  return (
    <Pressable
      onPress={() => router.push(`/catalog/${parentId}` as Href)}
      accessibilityRole="link"
      style={[styles.partOf, { backgroundColor: c.surfaceVariant }]}
      testID="variant-part-of"
    >
      <MaterialCommunityIcons name="shape-outline" size={18} color={c.primary} />
      <Text style={{ color: c.textPrimary, flex: 1, fontSize: 13 }} numberOfLines={2}>
        {t('commerce.variants.partOf', { name: parent.data?.name ?? '…' })}
      </Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={c.textDisabled} />
    </Pressable>
  );
}

const NAME_KEYS: Record<VariantAttributeName, string> = {
  SIZE: 'commerce.variants.attr.SIZE', COLOUR: 'commerce.variants.attr.COLOUR', PACK: 'commerce.variants.attr.PACK',
  FLAVOUR: 'commerce.variants.attr.FLAVOUR', WEIGHT: 'commerce.variants.attr.WEIGHT', OTHER: 'commerce.variants.attr.OTHER',
};

/** Add or change one size / type. Stock is typed only when it is created (later changes go through a stock adjustment). */
function VariantSheet({ parent, variant, onDismiss }: { parent: Product; variant: Product | null; onDismiss: () => void }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const save = useSaveVariant(parent._id);
  const key = useRef(newIdempotencyKey('variant'));
  const [attrs, setAttrs] = useState<VariantAttribute[]>(() => (
    variant?.variantAttributes?.length
      ? variant.variantAttributes.map((a) => ({ name: a.name as VariantAttributeName, value: a.value }))
      : [{ name: 'SIZE', value: '' }]
  ));
  const [sell, setSell] = useState(variant ? paiseToInput(variant.sellPaise) : paiseToInput(parent.sellPaise));
  const [mrp, setMrp] = useState(variant?.mrpPaise ? paiseToInput(variant.mrpPaise) : '');
  const [sku, setSku] = useState(variant?.sku ?? '');
  const [barcode, setBarcode] = useState(variant?.barcode ?? '');
  const [stock, setStock] = useState('0');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { key.current = newIdempotencyKey('variant'); }, []);

  const label = variantLabelOf(attrs);
  const submit = () => {
    setError(null);
    const problem = variantAttrsProblem(attrs);
    if (problem !== 'NONE') { setError(t(`commerce.variants.err.${problem}`)); return; }
    const sellPaise = parseRupeesToPaise(sell);
    if (sellPaise === null) { setError(t('commerce.variants.err.PRICE')); return; }
    const mrpPaise = mrp.trim() ? parseRupeesToPaise(mrp) : undefined;
    if (mrp.trim() && (mrpPaise === null || mrpPaise === undefined)) { setError(t('commerce.variants.err.PRICE')); return; }
    const stockQty = Number(stock || '0');
    if (!variant && (!Number.isFinite(stockQty) || stockQty < 0)) { setError(t('commerce.variants.err.STOCK')); return; }
    const body: VariantInput = {
      attributes: attrs.filter((a) => a.value.trim()).map((a) => ({ name: a.name, value: a.value.trim() })),
      sellPaise,
      ...(mrpPaise ? { mrpPaise } : {}),
      ...(sku.trim() ? { sku: sku.trim() } : {}),
      ...(barcode.trim() ? { barcode: barcode.trim().toUpperCase() } : {}),
      ...(!variant ? { stockQty } : {}),
    };
    save.mutate(
      { variantId: variant?._id, body, key: key.current },
      { onSuccess: () => onDismiss(), onError: (e) => setError(apiErrorMessage(e)) },
    );
  };

  return (
    <Sheet
      visible
      onDismiss={onDismiss}
      title={variant ? t('commerce.variants.editTitle') : t('commerce.variants.addTitle', { name: parent.name })}
      testID="variant-sheet"
      footer={<PillButton c={c} icon="check" label={t('common.save')} onPress={submit} disabled={save.isPending} testID="variant-save" />}
    >
      {attrs.map((a, i) => (
        <View key={i} style={[styles.attr, { borderColor: c.divider }]}>
          <ChoiceChips
            c={c}
            options={VARIANT_ATTRIBUTE_NAMES.map((n) => ({ key: n, label: t(NAME_KEYS[n]) }))}
            value={[a.name]}
            onChange={(v) => setAttrs((x) => x.map((q, j) => (j === i ? { ...q, name: (v[0] ?? q.name) as VariantAttributeName } : q)))}
          />
          <View style={styles.attrRow}>
            <TextInput
              mode="outlined"
              dense
              label={t('commerce.variants.value')}
              value={a.value}
              maxLength={40}
              onChangeText={(s) => setAttrs((x) => x.map((q, j) => (j === i ? { ...q, value: s } : q)))}
              outlineStyle={{ borderRadius: radii.field }}
              style={{ flex: 1, backgroundColor: 'transparent' }}
              testID={`variant-value-${i}`}
            />
            {attrs.length > 1 ? (
              <IconButton icon="close-circle-outline" size={22} onPress={() => setAttrs((x) => x.filter((_, j) => j !== i))} accessibilityLabel={t('commerce.variants.removeDetail')} />
            ) : null}
          </View>
        </View>
      ))}
      {attrs.length < MAX_VARIANT_ATTRIBUTES ? (
        <PillButton
          c={c}
          tone="outline"
          icon="plus"
          label={t('commerce.variants.addDetail')}
          onPress={() => setAttrs((x) => [...x, { name: VARIANT_ATTRIBUTE_NAMES.find((n) => !x.some((q) => q.name === n)) ?? 'OTHER', value: '' }])}
        />
      ) : null}
      {label ? (
        <Text style={{ color: c.textSecondary, fontSize: 12.5 }} testID="variant-preview">
          {t('commerce.variants.preview', { name: `${parent.name} (${label})` })}
        </Text>
      ) : null}
      <View style={styles.two}>
        <TextInput mode="outlined" dense label={t('commerce.variants.sellPrice')} value={sell} onChangeText={setSell} keyboardType="numeric"
          left={<TextInput.Affix text="₹" />} outlineStyle={{ borderRadius: radii.field }} style={styles.half} testID="variant-sell" />
        <TextInput mode="outlined" dense label={t('commerce.variants.mrp')} value={mrp} onChangeText={setMrp} keyboardType="numeric"
          left={<TextInput.Affix text="₹" />} outlineStyle={{ borderRadius: radii.field }} style={styles.half} />
      </View>
      <View style={styles.two}>
        <TextInput mode="outlined" dense label={t('commerce.variants.sku')} value={sku} onChangeText={setSku} autoCapitalize="characters"
          outlineStyle={{ borderRadius: radii.field }} style={styles.half} />
        <TextInput mode="outlined" dense label={t('commerce.variants.barcode')} value={barcode} onChangeText={setBarcode} autoCapitalize="characters"
          outlineStyle={{ borderRadius: radii.field }} style={styles.half} />
      </View>
      {!variant ? (
        <TextInput mode="outlined" dense label={t('commerce.variants.openingStock')} value={stock} onChangeText={setStock} keyboardType="numeric"
          outlineStyle={{ borderRadius: radii.field }} style={{ width: 160, backgroundColor: 'transparent' }} testID="variant-stock" />
      ) : null}
      {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="variant-error">{error}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 8, marginVertical: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
  partOf: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radii.card, paddingHorizontal: 12, minHeight: 48, marginVertical: 8 },
  attr: { gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  attrRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  two: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  half: { flexGrow: 1, flexBasis: 130, backgroundColor: 'transparent' },
});
