import React, { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../../src/hooks';
import { apiErrorMessage } from '../../../../src/api/axios';
import { Card, ErrorBlock, Loading, Screen, SectionLabel } from '../../../../src/features/more/ui';
import { ActionRow, Banner, PillButton, TwoPane } from '../../../../src/features/p1/ui';
import { Pill } from '../../../../src/features/p2/ui';
import { pharmacyApi, pharmacyKeys } from '../../../../src/features/pharmacy/api';
import { batchPath, fmtQty } from '../../../../src/features/pharmacy/logic';
import { BatchRowItem } from '../../../../src/features/pharmacy/components/BatchRowItem';
import { DrugFieldsCard } from '../../../../src/features/pharmacy/components/DrugFieldsCard';
import { SplitUnbatchedSheet } from '../../../../src/features/pharmacy/components/SplitUnbatchedSheet';

/**
 * One medicine: its details (batch tracking, schedule, composition,
 * manufacturer — editable with PHARMACY_MANAGE), stock that has no batch yet
 * ("Split into batches"), and the batches on the shelf, earliest expiry first.
 */
export default function PharmacyProductScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { productId: raw } = useLocalSearchParams<{ productId: string }>();
  const productId = String(raw ?? '');
  const { can } = usePartnerEntitlements();
  const canManage = can('PHARMACY_MANAGE', 'FULL');
  const [splitOpen, setSplitOpen] = useState(false);

  const view = useQuery({
    queryKey: pharmacyKeys.product(productId),
    queryFn: () => pharmacyApi.productBatches(productId),
    enabled: !!productId,
  });
  // Composition / manufacturer are not in the batches answer: read the product (optional).
  const info = useQuery({
    queryKey: pharmacyKeys.productInfo(productId),
    queryFn: () => pharmacyApi.productInfo(productId),
    enabled: !!productId && can('CATALOG_VIEW', 'READ'),
  });

  if (view.isPending) {
    return <Screen c={c} title={t('p2.pharmacy.product.title')}><Loading c={c} /></Screen>;
  }
  if (view.isError || !view.data) {
    return (
      <Screen c={c} title={t('p2.pharmacy.product.title')}>
        <ErrorBlock c={c} message={apiErrorMessage(view.error, t('p2.pharmacy.product.loadFailed'))} onRetry={() => view.refetch()} />
      </Screen>
    );
  }
  const { product, unbatchedQty, batches } = view.data;
  const unit = product.unit ?? '';

  const left = (
    <>
      <Card c={c}>
        <View style={styles.headRow}>
          <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={3}>{product.name}</Text>
          {product.drugSchedule ? <Pill c={c} label={t('p2.pharmacy.rx.schedule', { schedule: product.drugSchedule })} tone="warn" /> : null}
        </View>
        <Text style={{ color: c.textSecondary }}>{t('p2.pharmacy.product.stock', { qty: fmtQty(product.stockQty), unit })}</Text>
      </Card>
      {unbatchedQty > 0 ? (
        <View style={{ gap: 8 }} testID="product-unbatched">
          <Banner
            c={c}
            tone="warn"
            title={t('p2.pharmacy.product.unbatchedTitle', { qty: fmtQty(unbatchedQty), unit })}
            body={t('p2.pharmacy.product.unbatchedBody')}
          />
          {canManage ? (
            <ActionRow>
              <PillButton c={c} icon="call-split" label={t('p2.pharmacy.split.title')} onPress={() => setSplitOpen(true)} testID="product-split" />
            </ActionRow>
          ) : null}
        </View>
      ) : null}
      <SectionLabel c={c}>{t('p2.pharmacy.product.batches')}</SectionLabel>
      {batches.length === 0 ? (
        <Text style={{ color: c.textSecondary }}>{t('p2.pharmacy.product.noBatches')}</Text>
      ) : (
        batches.map((b) => (
          <BatchRowItem key={b.id} c={c} row={b} hideProduct onPress={() => router.push(batchPath(b) as Href)} testID={`product-batch-${b.id}`} />
        ))
      )}
    </>
  );

  return (
    <Screen c={c} title={t('p2.pharmacy.product.title')} subtitle={product.name}>
      <TwoPane
        left={left}
        right={<DrugFieldsCard c={c} product={product} info={info.data ?? null} canEdit={canManage} />}
      />
      <SplitUnbatchedSheet
        visible={splitOpen}
        productId={product.id}
        productName={product.name}
        unit={product.unit}
        unbatchedQty={unbatchedQty}
        onDismiss={() => setSplitOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: '700' },
});
