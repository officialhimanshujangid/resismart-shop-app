import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { formatI18nDate } from '../../../i18n';
import { DocumentStatusChip } from '../../billing/components/StatusChip';
import { DOCUMENT_TYPE_LABEL_KEY, PartnerDocumentRecord } from '../../billing/types';

/** One purchase document in a list: number, supplier, date, amount, status (and PO fulfilment). */
export function PurchaseDocRow({
  c, doc, onPress,
}: { c: ColorScheme; doc: PartnerDocumentRecord; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.row, { backgroundColor: c.surface }]}
      testID={`purchase-row-${doc._id}`}
    >
      <View style={styles.main}>
        <Text style={[styles.number, { color: c.textPrimary }]} numberOfLines={1}>
          {doc.number ?? t('billing.list.draftNumber', { type: t(DOCUMENT_TYPE_LABEL_KEY[doc.type]) })}
        </Text>
        <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
          {doc.partySnapshot?.name} · {formatI18nDate(doc.documentDate, t)}
        </Text>
        {doc.supplierInvoiceNo ? (
          <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
            {t('purchases.list.supplierBill', { number: doc.supplierInvoiceNo })}
          </Text>
        ) : null}
        {doc.type === 'PURCHASE_ORDER' && doc.fulfilment ? (
          <Text style={[styles.fulfil, { color: doc.fulfilment === 'OPEN' || doc.fulfilment === 'PARTIAL' ? c.warning : c.success }]}>
            {t(`purchases.fulfilment.${doc.fulfilment}`)}
          </Text>
        ) : null}
        {doc.type === 'GOODS_RECEIPT' ? (
          <Text style={[styles.fulfil, { color: doc.billedById ? c.success : c.warning }]}>
            {doc.billedById ? t('purchases.list.grnBilled') : t('purchases.list.grnUnbilled')}
          </Text>
        ) : null}
      </View>
      <View style={styles.side}>
        <Text style={[styles.amount, { color: c.textPrimary }]}>{formatPaise(doc.totals.grandPaise)}</Text>
        <DocumentStatusChip status={doc.status} c={c} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radii.card, padding: 14, minHeight: 64 },
  main: { flex: 1, minWidth: 0 },
  side: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  number: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  fulfil: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  amount: { fontSize: 14, fontWeight: '700' },
});
