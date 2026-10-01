import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { qk } from '../../../lib/queryKeys';
import { formatPaise } from '../../../lib/money';
import { formatI18nDate } from '../../../i18n';
import { apiErrorMessage } from '../../../api/axios';
import { Card, SectionLabel } from '../../more/ui';
import { ActionRow, PillButton, StatGrid, StatTile } from '../../p1/ui';
import { purchasesApi } from '../api';

/**
 * The supplier side of a party (screen S2): what we still owe them, open
 * purchase orders, goods received but not yet billed, and the last rate paid
 * per item. Read-only; each row opens its document.
 */
export function SupplierPanel({ c, partyId, canManage }: { c: ColorScheme; partyId: string; canManage: boolean }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: qk.purchases.supplier(partyId), queryFn: () => purchasesApi.supplierSummary(partyId) });

  if (q.isPending) return null;
  if (q.isError || !q.data) {
    return <Text style={{ color: c.textSecondary, fontSize: 12 }}>{apiErrorMessage(q.error, t('purchases.supplier.loadFailed'))}</Text>;
  }
  const s = q.data;
  const open = (id: string) => router.push({ pathname: '/billing/[id]', params: { id } });

  return (
    <View style={{ gap: 10 }} testID="supplier-panel">
      <SectionLabel c={c}>{t('purchases.supplier.section')}</SectionLabel>
      <StatGrid>
        <StatTile c={c} label={t('purchases.supplier.payable')} value={formatPaise(s.payablePaise)} tone={s.payablePaise > 0 ? c.error : undefined} />
        <StatTile c={c} label={t('purchases.supplier.openPos')} value={String(s.openPOs.length)} />
        <StatTile c={c} label={t('purchases.supplier.unbilled')} value={String(s.unbilledGrns.length)} />
      </StatGrid>
      {canManage && s.unbilledGrns.length > 0 && (
        <ActionRow>
          <PillButton c={c} icon="file-document-multiple-outline" label={t('purchases.billFromGrns')} onPress={() => router.push({ pathname: '/purchases/bill-from-grns', params: { partyId } })} />
        </ActionRow>
      )}
      {s.openPOs.length > 0 && (
        <Card c={c}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('purchases.supplier.openPos')}</Text>
          {s.openPOs.map((po) => (
            <Pressable key={po.id} onPress={() => open(po.id)} style={styles.row} accessibilityRole="button">
              <Text style={{ color: c.textPrimary, flex: 1 }} numberOfLines={1}>{po.number ?? '—'}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t(`purchases.fulfilment.${po.fulfilment}`)}</Text>
            </Pressable>
          ))}
        </Card>
      )}
      {s.lastRates.length > 0 && (
        <Card c={c}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('purchases.supplier.lastRates')}</Text>
          {s.lastRates.slice(0, 10).map((r) => (
            <View key={r.itemId} style={styles.row}>
              <Text style={{ color: c.textPrimary, flex: 1 }} numberOfLines={1}>{r.itemName}</Text>
              <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{formatPaise(r.ratePaise)}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginLeft: 8 }}>{formatI18nDate(r.documentDate, t)}</Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
});
