import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Divider, IconButton, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import type { ColorScheme } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { canStepDown } from '../../../lib/qtyStep';
import type { LineList } from '../useLines';

/**
 * The line rows + totals of a quote or a job bill's extra lines — the row is
 * `billing/new.tsx`'s own (proven at 320dp): name + meta take `flex:1,
 * minWidth:0`, then a compact qty stepper (hitSlop takes the buttons past 44dp
 * without widening the row), the taxable amount, pencil and bin.
 */
export function LineRows({ c, list, testIDPrefix = 'job-line' }: { c: ColorScheme; list: LineList; testIDPrefix?: string }) {
  const { t } = useTranslation();
  const { lines, preview, tax, violation } = list;
  const limitMessage = violation ? t(`errors.${violation.code}`, violation.params) : null;
  return (
    <View>
      {lines.map((line, idx) => {
        const priced = preview.lines[idx];
        const lineTax = priced ? priced.cgstPaise + priced.sgstPaise + priced.igstPaise + priced.cessPaise : 0;
        return (
          <View key={line.key} style={styles.row} testID={`${testIDPrefix}-${idx}`}>
            <Pressable style={styles.text} onPress={() => list.setEditing(line.key)} accessibilityRole="button">
              <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{line.itemName}</Text>
              <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={2}>
                {`${formatPaise(line.ratePaise)} × ${line.qty} ${line.unit ?? ''}`}
                {tax.gstApplicable ? t('p2.jobs.lines.taxSuffix', { rate: line.taxRatePercent ?? 0 }) : ''}
              </Text>
              {lineTax > 0 ? (
                <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
                  {t('p2.jobs.lines.withTax', { total: formatPaise(priced.totalPaise) })}
                </Text>
              ) : null}
              {violation?.lineIndex === idx && limitMessage ? (
                <Text style={[styles.meta, { color: c.error, fontWeight: '600' }]}>{limitMessage}</Text>
              ) : null}
            </Pressable>
            <View style={styles.qty}>
              <IconButton icon="minus" size={18} hitSlop={7} disabled={!canStepDown(line.qty)} onPress={() => list.step(line.key, -1)} accessibilityLabel={t('p2.jobs.lines.less', { item: line.itemName })} />
              <Text style={{ color: c.textPrimary, minWidth: 24, textAlign: 'center' }}>{line.qty}</Text>
              <IconButton icon="plus" size={18} hitSlop={7} onPress={() => list.step(line.key, 1)} accessibilityLabel={t('p2.jobs.lines.more', { item: line.itemName })} />
            </View>
            <Text style={[styles.amount, { color: c.textPrimary }]} numberOfLines={1}>{formatPaise(priced?.taxablePaise ?? 0)}</Text>
            <IconButton icon="pencil-outline" size={16} onPress={() => list.setEditing(line.key)} accessibilityLabel={t('p2.jobs.lines.edit', { item: line.itemName })} />
            <IconButton icon="trash-can-outline" size={16} onPress={() => list.remove(line.key)} accessibilityLabel={t('p2.jobs.lines.remove', { item: line.itemName })} />
          </View>
        );
      })}
      {limitMessage && violation?.lineIndex === undefined ? (
        <Text style={[styles.meta, { color: c.error }]}>{limitMessage}</Text>
      ) : null}
    </View>
  );
}

/** Taxable value, the tax split, round-off and the total, as the server will price it. */
export function LineTotals({ c, list }: { c: ColorScheme; list: LineList }) {
  const { t } = useTranslation();
  const { preview, tax } = list;
  const tt = preview.totals;
  return (
    <View style={{ gap: 4 }} testID="job-line-totals">
      <TotalRow c={c} label={t('p2.jobs.lines.taxable')} value={tt.subPaise} />
      {tax.gstApplicable && tt.igstPaise > 0 ? <TotalRow c={c} label={t('p2.jobs.lines.igst')} value={tt.igstPaise} /> : null}
      {tax.gstApplicable && tt.cgstPaise + tt.sgstPaise > 0 ? (
        <>
          <TotalRow c={c} label={t('p2.jobs.lines.cgst')} value={tt.cgstPaise} />
          <TotalRow c={c} label={t('p2.jobs.lines.sgst')} value={tt.sgstPaise} />
        </>
      ) : null}
      {tt.cessPaise > 0 ? <TotalRow c={c} label={t('p2.jobs.lines.cess')} value={tt.cessPaise} /> : null}
      {tt.roundOffPaise !== 0 ? <TotalRow c={c} label={t('p2.jobs.lines.roundOff')} value={tt.roundOffPaise} /> : null}
      <Divider style={{ marginVertical: 4 }} />
      <View style={styles.totalRow}>
        <Text style={{ color: c.textSecondary, fontWeight: '600', flex: 1, minWidth: 0 }} numberOfLines={1}>{t('p2.jobs.lines.total')}</Text>
        <Text style={{ color: c.textPrimary, fontSize: 20, fontWeight: '700' }} testID="job-line-grand">{formatPaise(tt.grandPaise)}</Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 11 }}>
        {tax.gstApplicable ? t('p2.jobs.lines.taxHint') : t('p2.jobs.lines.noGstHint')}
      </Text>
    </View>
  );
}

function TotalRow({ c, label, value }: { c: ColorScheme; label: string; value: number }) {
  return (
    <View style={styles.totalRow}>
      <Text style={{ color: c.textSecondary, fontSize: 12.5, flex: 1, minWidth: 0 }} numberOfLines={1}>{label}</Text>
      <Text style={{ color: c.textPrimary, fontSize: 12.5, fontWeight: '500' }}>{formatPaise(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, fontWeight: '600' },
  meta: { fontSize: 11, marginTop: 2 },
  qty: { flexDirection: 'row', alignItems: 'center' },
  amount: { fontSize: 13, fontWeight: '600', minWidth: 56, textAlign: 'right' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
