import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatI18nDate } from '../../../i18n';
import { formatPaise } from '../../../lib/money';
import { STOCK_TYPE_LABEL_KEYS, StockMovement, StockMovementType, signedQty } from '../stockMovements';

const pad2 = (n: number) => String(n).padStart(2, '0');

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * One ledger line: what happened, by how much, what was left.
 *
 * Two columns only — text that wraps on the left, a fixed-width number block on
 * the right — so nothing runs off a 320dp screen whatever the reason says.
 */
export function StockMovementRow({
  item, c, showProduct, onOpenSource, onOpenProduct,
}: {
  item: StockMovement;
  c: ColorScheme;
  /** Shop-wide list: name the product on each row. */
  showProduct?: boolean;
  /** Shop-wide list: open the product this line belongs to. */
  onOpenProduct?: () => void;
  /** Present only when this row's source can be opened in this app. */
  onOpenSource?: () => void;
}) {
  const { t } = useTranslation();
  const typeKey = STOCK_TYPE_LABEL_KEYS[item.type as StockMovementType];
  const typeLabel = typeKey ? t(typeKey) : String(item.type);
  const qtyColor = item.qty > 0 ? c.success : item.qty < 0 ? c.error : c.textSecondary;
  const when = `${formatI18nDate(item.createdAt, t)} · ${timeOf(item.createdAt)}`;

  return (
    <View
      style={[styles.row, { backgroundColor: c.surface, borderColor: c.divider }]}
      accessibilityLabel={t('stockHistory.rowA11y', {
        type: typeLabel, qty: signedQty(item.qty), balance: item.balanceAfter, when,
      })}
    >
      <View style={styles.left}>
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: c.surfaceVariant }]}>
            <Text style={[styles.chipText, { color: c.textPrimary }]}>{typeLabel}</Text>
          </View>
          {item.isReversal ? (
            <View style={[styles.chip, { backgroundColor: c.error + '1F' }]}>
              <Text style={[styles.chipText, { color: c.error }]}>{t('stockHistory.cancelled')}</Text>
            </View>
          ) : null}
        </View>
        {showProduct ? (
          onOpenProduct ? (
            <Pressable onPress={onOpenProduct} accessibilityRole="link" hitSlop={6} style={styles.refWrap}>
              <Text style={[styles.product, { color: c.primary }]} numberOfLines={1}>
                {item.productName || t('stockHistory.openProduct')}
              </Text>
            </Pressable>
          ) : item.productName ? (
            <Text style={[styles.product, { color: c.textPrimary }]} numberOfLines={1}>{item.productName}</Text>
          ) : null
        ) : null}
        {item.reason ? (
          <Text style={[styles.reason, { color: c.textPrimary }]} numberOfLines={3}>{item.reason}</Text>
        ) : null}
        {item.sourceRef ? (
          onOpenSource ? (
            <Pressable onPress={onOpenSource} accessibilityRole="link" hitSlop={6} style={styles.refWrap}>
              <Text style={[styles.ref, { color: c.primary }]} numberOfLines={1}>{item.sourceRef}</Text>
            </Pressable>
          ) : (
            <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>{item.sourceRef}</Text>
          )
        ) : null}
        <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={2}>
          {item.createdByName ? t('stockHistory.byWhen', { who: item.createdByName, when }) : when}
        </Text>
        {typeof item.unitCost === 'number' ? (
          <Text style={[styles.meta, { color: c.textSecondary }]}>
            {t('stockHistory.unitCost', { cost: formatPaise(item.unitCost) })}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={[styles.qty, { color: qtyColor }]}>{signedQty(item.qty)}</Text>
        <Text style={[styles.balance, { color: c.textSecondary }]}>
          {t('stockHistory.balanceAfter', { balance: item.balanceAfter })}
        </Text>
        {/* P1 (screen S26): the value columns arrive only for a COSTS holder —
            the server strips them otherwise — so their presence IS the gate. */}
        {typeof item.valueDeltaPaise === 'number' ? (
          <Text style={[styles.balance, { color: item.valueDeltaPaise < 0 ? c.error : c.textSecondary }]} testID="movement-value">
            {formatPaise(item.valueDeltaPaise)}
          </Text>
        ) : null}
        {typeof item.stockValueAfterPaise === 'number' ? (
          <Text style={[styles.balance, { color: c.textSecondary }]}>
            {t('stockHistory.valueAfter', { value: formatPaise(item.stockValueAfterPaise) })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', gap: 12, padding: 12, borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start',
  },
  left: { flex: 1, minWidth: 0, gap: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  chip: { borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 11.5, fontWeight: '600' },
  product: { fontSize: 13.5, fontWeight: '600' },
  reason: { fontSize: 13 },
  refWrap: { alignSelf: 'flex-start' },
  ref: { fontSize: 12.5, fontWeight: '600', textDecorationLine: 'underline' },
  meta: { fontSize: 11.5 },
  right: { alignItems: 'flex-end', minWidth: 72, maxWidth: 120 },
  qty: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  balance: { fontSize: 11.5, marginTop: 2, textAlign: 'right' },
});
