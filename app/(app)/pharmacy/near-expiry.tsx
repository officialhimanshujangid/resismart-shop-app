import React, { useMemo, useState } from 'react';
import { SectionList, StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { formatPaise } from '../../../src/lib/money';
import { EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { PillButton } from '../../../src/features/p1/ui';
import { pharmacyApi, pharmacyKeys } from '../../../src/features/pharmacy/api';
import { batchPath, bucketLabel, fmtQty, groupByBucket } from '../../../src/features/pharmacy/logic';
import { BatchRowItem } from '../../../src/features/pharmacy/components/BatchRowItem';
import { BucketTiles } from '../../../src/features/pharmacy/components/BucketTiles';
import { WriteOffSheet } from '../../../src/features/pharmacy/components/WriteOffSheet';
import type { BatchRow } from '../../../src/features/pharmacy/types';

/**
 * Near expiry — where the PARTNER_NEAR_EXPIRY push lands. The buckets
 * (Expired, Within 7 / 30 / 90 days, from the business's settings), then the
 * batches grouped under them, each with a big "Write off" for PHARMACY_MANAGE.
 * Three taps from the notification: open → Write off → Confirm.
 */
export default function NearExpiryScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { can } = usePartnerEntitlements();
  const canManage = can('PHARMACY_MANAGE', 'FULL');
  const [target, setTarget] = useState<BatchRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const query = useQuery({ queryKey: pharmacyKeys.nearExpiry(), queryFn: () => pharmacyApi.nearExpiry() });
  const buckets = query.data?.buckets ?? [];
  const sections = useMemo(() => {
    const labels = buckets.map((b) => b.label);
    return groupByBucket(query.data?.rows ?? [], labels).map((g) => ({
      label: g.label,
      bucket: buckets.find((b) => b.label === g.label),
      data: g.rows,
    }));
  }, [query.data, buckets]);

  return (
    <Screen
      c={c}
      title={t('p2.pharmacy.nearExpiry.title')}
      subtitle={t('p2.pharmacy.nearExpiry.subtitle')}
      scroll={false}
      floating={(
        <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={2500}>{toast ?? ''}</Snackbar>
      )}
    >
      {query.isPending ? (
        <Loading c={c} />
      ) : query.isError ? (
        <ErrorBlock c={c} message={apiErrorMessage(query.error, t('p2.pharmacy.nearExpiry.loadFailed'))} onRetry={() => query.refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(b) => b.id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={<View style={{ paddingBottom: 8 }}><BucketTiles c={c} buckets={buckets} testID="near-buckets" /></View>}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: section.label === 'EXPIRED' ? c.error : c.textPrimary }]} numberOfLines={1}>
                {bucketLabel(section.label, t)}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
                {t('p2.pharmacy.bucket.summary', { count: section.data.length, qty: fmtQty(section.bucket?.qty ?? 0) })}
                {typeof section.bucket?.valuePaise === 'number' ? ` · ${formatPaise(section.bucket.valuePaise)}` : ''}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <BatchRowItem
              c={c}
              row={item}
              onPress={() => router.push(batchPath(item) as Href)}
              testID={`near-${item.id}`}
              action={canManage ? (
                <PillButton
                  c={c}
                  tone="danger"
                  icon="delete-outline"
                  label={t('p2.pharmacy.writeOff.action')}
                  onPress={() => setTarget(item)}
                  testID={`writeoff-${item.id}`}
                />
              ) : undefined}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          contentContainerStyle={styles.list}
          onRefresh={() => void query.refetch()}
          refreshing={query.isRefetching}
          ListEmptyComponent={<EmptyBlock c={c} icon="check-circle-outline" title={t('p2.pharmacy.nearExpiry.empty')} body={t('p2.pharmacy.nearExpiry.emptyBody')} />}
        />
      )}
      <WriteOffSheet batch={target} onDismiss={() => setTarget(null)} onDone={() => setToast(t('p2.pharmacy.writeOff.done'))} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  sectionHead: { paddingTop: 12, paddingBottom: 8, gap: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
});
