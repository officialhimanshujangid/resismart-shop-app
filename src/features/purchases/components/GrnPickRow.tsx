import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Checkbox, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { formatI18nDate } from '../../../i18n';
import type { UnbilledGrn } from '../api';

/** A goods-received note waiting for its supplier bill — the whole row is the checkbox. */
export function GrnPickRow({
  c, grn, selected, onToggle,
}: { c: ColorScheme; grn: UnbilledGrn; selected: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={grn.number}
      style={[styles.row, { backgroundColor: c.surface, borderColor: selected ? c.primary : c.divider }]}
      testID={`grn-${grn.id}`}
    >
      <Checkbox status={selected ? 'checked' : 'unchecked'} onPress={onToggle} />
      <View style={styles.main}>
        <Text style={[styles.number, { color: c.textPrimary }]} numberOfLines={1}>{grn.number}</Text>
        <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
          {grn.partyName} · {formatI18nDate(grn.documentDate, t)}
        </Text>
        <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
          {grn.poNumber ? t('purchases.grns.fromPo', { number: grn.poNumber, count: grn.lineCount }) : t('purchases.grns.lines', { count: grn.lineCount })}
        </Text>
      </View>
      <Text style={[styles.amount, { color: c.textPrimary }]}>{formatPaise(grn.totals?.grandPaise)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.card, borderWidth: 1.5, paddingVertical: 10, paddingRight: 14, paddingLeft: 4, minHeight: 64 },
  main: { flex: 1, minWidth: 0 },
  number: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '700', flexShrink: 0 },
});
