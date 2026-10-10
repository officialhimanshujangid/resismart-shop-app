import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii, themeColors } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { qk } from '../../../lib/queryKeys';
import { catalogApi } from '../../catalog/api';
import { useUpdateProduct } from '../../catalog/hooks';
import type { Product } from '../../catalog/types';
import { Banner, PillButton, Stepper } from '../../p1/ui';
import { useCommerceAccess } from '../access';
import { bundleProblem } from '../logic';
import { MAX_BUNDLE_COMPONENTS, type BundleComponent } from '../types';
import { ProductPickerSheet } from './ui';

/** Names for component ids — cached product reads (one per item, ≤ 20). */
export function useComponentNames(ids: string[]): Record<string, string> {
  const results = useQueries({
    queries: ids.slice(0, MAX_BUNDLE_COMPONENTS).map((id) => ({
      queryKey: qk.catalog.product(id),
      queryFn: () => catalogApi.getOne(id),
      staleTime: 5 * 60_000,
    })),
  });
  const out: Record<string, string> = {};
  results.forEach((r, i) => { if (r.data?.name) out[ids[i]] = r.data.name; });
  return out;
}

/**
 * The items one unit of a bundle is made of (C3, C-9) — controlled. Parents and
 * other bundles cannot be inside a bundle, so the picker hides them.
 */
export function BundleEditor({
  c, value, onChange, names, onNames, selfId, disabled,
}: {
  c: ColorScheme;
  value: BundleComponent[];
  onChange: (next: BundleComponent[]) => void;
  names: Record<string, string>;
  onNames: (add: Record<string, string>) => void;
  selfId?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const problem = value.length ? bundleProblem(value, selfId) : 'NONE';
  return (
    <View style={{ gap: 8 }} testID="bundle-editor">
      {value.map((comp, i) => (
        <View key={comp.productId} style={[styles.row, { borderColor: c.divider }]}>
          {/* Grows, but wraps the stepper under it below ~320dp instead of squeezing the name. */}
          <Text style={{ color: c.textPrimary, flexGrow: 1, flexBasis: 120, minWidth: 0, fontWeight: '600' }} numberOfLines={2}>
            {names[comp.productId] ?? '…'}
          </Text>
          <Stepper
            c={c}
            value={comp.qty}
            min={1}
            max={100000}
            onChange={(q) => onChange(value.map((x, j) => (j === i ? { ...x, qty: q } : x)))}
            label={names[comp.productId] ?? comp.productId}
            testID={`bundle-qty-${i}`}
          />
          <IconButton
            icon="close-circle-outline"
            size={22}
            disabled={disabled}
            onPress={() => onChange(value.filter((_, j) => j !== i))}
            accessibilityLabel={t('commerce.common.removeItem', { name: names[comp.productId] ?? '' })}
          />
        </View>
      ))}
      {value.length < MAX_BUNDLE_COMPONENTS && !disabled ? (
        <PillButton c={c} tone="outline" icon="plus" label={t('commerce.bundles.addItem')} onPress={() => setPicking(true)} testID="bundle-add" />
      ) : null}
      {problem !== 'NONE' ? <Text style={{ color: c.error, fontSize: 12.5 }}>{t(`commerce.bundles.err.${problem}`)}</Text> : null}
      <ProductPickerSheet
        visible={picking}
        onDismiss={() => setPicking(false)}
        title={t('commerce.bundles.pickTitle')}
        multi
        hideParents
        hideBundles
        picked={value.map((v) => v.productId)}
        onPick={(p) => {
          if (p._id === selfId) return;
          onNames({ [p._id]: p.name });
          if (value.some((v) => v.productId === p._id)) onChange(value.filter((v) => v.productId !== p._id));
          else onChange([...value, { productId: p._id, qty: 1 }]);
        }}
      />
    </View>
  );
}

/**
 * "Items in this bundle" on a product (C3): what selling one takes from stock.
 * Visible on a bundle, or — when BUNDLES is on — on a plain product that could
 * become one.
 */
export function BundleCard({ product }: { product: Product }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const access = useCommerceAccess();
  const isBundle = !!product.bundleComponents?.length;
  const canEdit = access.catalog.canManage && (access.has('BUNDLES') || isBundle);
  const update = useUpdateProduct(product._id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BundleComponent[]>(product.bundleComponents ?? []);
  const fetched = useComponentNames((product.bundleComponents ?? []).map((x) => String(x.productId)));
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setDraft(product.bundleComponents ?? []); }, [product.bundleComponents]);

  if (product.isVariantParent || product.variantParentId) return null;
  if (!isBundle && !(access.has('BUNDLES') && access.catalog.canManage)) return null;

  const allNames = { ...fetched, ...names };
  const save = (body: BundleComponent[] | null) => {
    setError(null);
    update.mutate({ bundleComponents: body }, {
      onSuccess: () => setEditing(false),
      onError: (e) => setError(apiErrorMessage(e)),
    });
  };
  const askPlain = () => Alert.alert(t('commerce.bundles.plainTitle'), t('commerce.bundles.plainBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('commerce.bundles.makePlain'), style: 'destructive', onPress: () => save(null) },
  ]);

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]} testID="bundle-card">
      <View style={styles.head}>
        <MaterialCommunityIcons name="package-variant" size={20} color={c.primary} />
        <Text style={[styles.title, { color: c.textPrimary }, { flexShrink: 1 }]}>{isBundle ? t('commerce.bundles.titleBundle') : t('commerce.bundles.title')}</Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 12.5, lineHeight: 18 }}>{t('commerce.bundles.intro')}</Text>
      {!isBundle && product.trackStock && product.stockQty > 0 && editing ? (
        <Banner c={c} tone="warn" body={t('commerce.bundles.hasStockWarn', { qty: product.stockQty })} />
      ) : null}
      {editing ? (
        <>
          <BundleEditor
            c={c}
            value={draft}
            onChange={setDraft}
            names={allNames}
            onNames={(add) => setNames((n) => ({ ...n, ...add }))}
            selfId={product._id}
            disabled={update.isPending}
          />
          <View style={styles.actions}>
            <PillButton
              c={c}
              icon="check"
              label={t('common.save')}
              onPress={() => save(draft)}
              disabled={update.isPending || bundleProblem(draft, product._id) !== 'NONE'}
              testID="bundle-save"
            />
            <PillButton c={c} tone="outline" label={t('common.cancel')} onPress={() => { setDraft(product.bundleComponents ?? []); setEditing(false); }} />
          </View>
        </>
      ) : (
        <>
          {(product.bundleComponents ?? []).map((comp) => (
            <View key={String(comp.productId)} style={[styles.row, { borderColor: c.divider }]}>
              <Text style={{ color: c.textPrimary, flex: 1, minWidth: 0 }} numberOfLines={2}>{allNames[String(comp.productId)] ?? '…'}</Text>
              <Text style={{ color: c.textSecondary, fontWeight: '700' }}>{`× ${comp.qty}`}</Text>
            </View>
          ))}
          {canEdit ? (
            <View style={styles.actions}>
              <PillButton
                c={c}
                tone="outline"
                icon={isBundle ? 'pencil-outline' : 'package-variant-plus'}
                label={isBundle ? t('commerce.bundles.edit') : t('commerce.bundles.make')}
                onPress={() => setEditing(true)}
                testID="bundle-edit"
              />
              {isBundle ? <PillButton c={c} tone="danger" label={t('commerce.bundles.makePlain')} onPress={askPlain} /> : null}
            </View>
          ) : null}
        </>
      )}
      {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="bundle-error">{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 8, marginVertical: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6, minHeight: 48, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
