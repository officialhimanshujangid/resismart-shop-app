import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Checkbox, IconButton, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { Stepper } from '../../p1/ui';
import type { ReorderRow } from '../api';
import type { ReorderPick } from '../reorderLogic';
// M20 — DS v1: stock bar (fills on open), soft shadow, supplier press scale.
import { StockBar } from '../../catalog/components/StockBar';
import { PressableScale } from '../../../theme/motion';
import { useAppTheme } from '../../../theme/useAppTheme';

/**
 * One product on the reorder list: tick it, set how many, see / change the
 * supplier. The gear opens its reorder settings (manager only).
 */
export function ReorderRowCard({
  c, row, pick, onChange, onPickSupplier, onSettings,
}: {
  c: ColorScheme;
  row: ReorderRow;
  pick: ReorderPick;
  onChange: (next: ReorderPick) => void;
  onPickSupplier: () => void;
  onSettings?: () => void;
}) {
  const { t } = useTranslation();
  const { shadow } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: pick.selected ? c.primary : c.border }, shadow('card')]} testID={`reorder-${row.productId}`}>
      <View style={styles.top}>
        <Checkbox status={pick.selected ? 'checked' : 'unchecked'} onPress={() => onChange({ ...pick, selected: !pick.selected })} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>{row.name}</Text>
          <Text style={[styles.meta, { color: row.stockQty <= 0 ? c.error : c.textSecondary }]}>
            {t('stock.reorder.inStock', { qty: row.stockQty, unit: row.unit })}
            {row.lowStockAt !== undefined ? t('stock.reorder.lowAt', { qty: row.lowStockAt }) : ''}
            {row.pendingOnOpenPOsQty > 0 ? t('stock.reorder.onOrder', { qty: row.pendingOnOpenPOsQty }) : ''}
          </Text>
          <StockBar qty={row.stockQty} lowAt={row.lowStockAt} max={row.maxStockQty} width={120} style={styles.bar} />
        </View>
        {onSettings ? (
          <IconButton icon="cog-outline" onPress={onSettings} accessibilityLabel={t('stock.reorder.settingsFor', { name: row.name })} />
        ) : null}
      </View>
      <View style={styles.controls}>
        <Stepper c={c} value={pick.qty} min={1} onChange={(qty) => onChange({ ...pick, qty })} label={row.name} />
        <PressableScale onPress={onPickSupplier} style={[styles.supplier, { borderColor: pick.supplier ? c.border : c.warning }]} accessibilityRole="button">
          <Text style={{ color: c.textSecondary, fontSize: 11 }}>{t('stock.reorder.supplier')}</Text>
          <Text style={{ color: pick.supplier ? c.textPrimary : c.warning, fontWeight: '600' }} numberOfLines={1}>
            {pick.supplier?.name ?? t('stock.reorder.pickSupplier')}
          </Text>
        </PressableScale>
      </View>
      {row.lastPurchaseRatePaise !== undefined && (
        <Text style={[styles.meta, { color: c.textSecondary }]}>{t('stock.reorder.lastRate', { rate: formatPaise(row.lastPurchaseRatePaise) })}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1.5, padding: 12, gap: 8 },
  bar: { marginTop: 6 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  name: { fontSize: 15, fontWeight: '600', marginTop: 6 },
  meta: { fontSize: 12, marginTop: 2 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingLeft: 6 },
  supplier: { flexGrow: 1, flexBasis: 140, minHeight: 48, borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: 10, justifyContent: 'center' },
});
