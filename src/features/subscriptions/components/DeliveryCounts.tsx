import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { PillButton } from '../../p1/ui';
import type { SheetCounts } from '../logic';

/**
 * The bar pinned under the round: how many are still due, delivered, not
 * delivered — and "All delivered" for a route (it fills only the DUE rows that
 * have no mark; a row somebody marked is never overwritten).
 */
export function DeliveryCounts({
  c, counts, onAllDelivered, allDisabled,
}: { c: ColorScheme; counts: SheetCounts; onAllDelivered?: () => void; allDisabled?: boolean }) {
  const { t } = useTranslation();
  const cell = (n: number, label: string, color: string, testID: string) => (
    <View style={styles.cell} testID={testID} accessible accessibilityLabel={`${n} ${label}`}>
      <Text style={[styles.num, { color }]} numberOfLines={1}>{n}</Text>
      <Text style={[styles.label, { color: c.textSecondary }]} numberOfLines={1}>{label}</Text>
    </View>
  );
  return (
    <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
      <View style={styles.cells}>
        {cell(counts.due, t('p2.subscriptions.deliveries.countDue'), c.info, 'count-due')}
        {cell(counts.delivered, t('p2.subscriptions.deliveries.countDelivered'), c.success, 'count-delivered')}
        {cell(counts.notDelivered, t('p2.subscriptions.deliveries.countNotDelivered'), c.error, 'count-not-delivered')}
      </View>
      {onAllDelivered ? (
        <PillButton c={c} icon="check-all" label={t('p2.subscriptions.deliveries.allDelivered')} onPress={onAllDelivered}
          disabled={allDisabled || counts.due === 0} testID="all-delivered" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth,
  },
  cells: { flexDirection: 'row', gap: 14, flexShrink: 1, minWidth: 0 },
  cell: { alignItems: 'center', minWidth: 52 },
  num: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '600' },
});
