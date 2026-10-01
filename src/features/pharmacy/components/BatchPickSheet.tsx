import React from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { ErrorBlock, Loading } from '../../more/ui';
import { Pill, Sheet } from '../../p2/ui';
import { pharmacyApi, pharmacyKeys } from '../api';
import { batchStatusTone, daysLabel, expiryLabel, fmtQty, sortForPick } from '../logic';
import type { BatchPick } from '../types';

export type { BatchPick } from '../types';

/**
 * Pick the batch a bill line (or an accepted order line) takes its stock from.
 * The first row is "Automatic — earliest expiry first" (`onPick(null)`: the
 * server picks FEFO). Then the product's batches, earliest expiry first: an
 * EXPIRED batch is shown but cannot be picked (and says why); a batch with less
 * than the line needs stays pickable with an "Only N left" warning — the server
 * answers BATCH_PICK_SHORT if it really is short. Rows are ≥ 56dp.
 */
export function BatchPickSheet({
  visible, productId, productName, qty, selectedBatchId, onPick, onDismiss,
}: {
  visible: boolean;
  productId: string | null;
  productName: string;
  qty: number;
  selectedBatchId?: string;
  onPick: (pick: BatchPick | null) => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const query = useQuery({
    queryKey: pharmacyKeys.product(productId ?? ''),
    queryFn: () => pharmacyApi.productBatches(productId as string),
    enabled: visible && !!productId,
  });
  const rows = sortForPick(query.data?.batches ?? []);
  const autoOn = !selectedBatchId;

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('p2.pharmacy.pick.title')} testID="batch-pick-sheet">
      <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={2}>
        {t('p2.pharmacy.pick.subtitle', { name: productName, qty: fmtQty(qty) })}
      </Text>
      <Pressable
        onPress={() => onPick(null)}
        accessibilityRole="radio"
        accessibilityState={{ selected: autoOn }}
        accessibilityLabel={t('p2.pharmacy.pick.auto')}
        style={[styles.row, { borderColor: autoOn ? c.primary : c.divider, backgroundColor: c.surface }]}
        testID="batch-pick-auto"
      >
        <MaterialCommunityIcons name={autoOn ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={c.primary} />
        <View style={styles.text}>
          <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={2}>{t('p2.pharmacy.pick.auto')}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={2}>{t('p2.pharmacy.pick.autoBody')}</Text>
        </View>
      </Pressable>

      {query.isPending && visible && productId ? (
        <Loading c={c} />
      ) : query.isError ? (
        <ErrorBlock c={c} message={apiErrorMessage(query.error, t('p2.pharmacy.pick.loadFailed'))} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('p2.pharmacy.pick.none')}</Text>
      ) : (
        rows.map((b) => {
          const expired = b.status === 'EXPIRED';
          const on = selectedBatchId === b.id;
          const short = !expired && b.qtyOnHand < qty;
          return (
            <Pressable
              key={b.id}
              disabled={expired}
              onPress={() => onPick({ batchId: b.id, batchNo: b.batchNo, expiryDate: b.expiryDate })}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: expired }}
              accessibilityLabel={t('p2.pharmacy.row.batch', { batchNo: b.batchNo })}
              style={[
                styles.row,
                { borderColor: on ? c.primary : c.divider, backgroundColor: c.surface, opacity: expired ? 0.55 : 1 },
              ]}
              testID={`batch-pick-${b.id}`}
            >
              <MaterialCommunityIcons
                name={expired ? 'cancel' : on ? 'radiobox-marked' : 'radiobox-blank'}
                size={22}
                color={expired ? c.error : c.primary}
              />
              <View style={styles.text}>
                <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>
                  {t('p2.pharmacy.row.batch', { batchNo: b.batchNo })}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={2}>
                  {`${t('p2.pharmacy.row.expiry', { expiry: expiryLabel(b.expiryDate) })} · ${t('p2.pharmacy.pick.onHand', { qty: fmtQty(b.qtyOnHand) })} · ${daysLabel(b.daysToExpiry, t)}`}
                </Text>
                {expired ? (
                  <Text style={{ color: c.error, fontSize: 12, fontWeight: '600' }} numberOfLines={2}>{t('p2.pharmacy.pick.expiredReason')}</Text>
                ) : short ? (
                  <Text style={{ color: c.warning, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                    {t('p2.pharmacy.pick.short', { qty: fmtQty(b.qtyOnHand) })}
                  </Text>
                ) : null}
              </View>
              <Pill c={c} label={t(`p2.pharmacy.status.${b.status}`)} tone={batchStatusTone(b.status)} />
            </Pressable>
          );
        })
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radii.card, borderWidth: 1.5,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
});
