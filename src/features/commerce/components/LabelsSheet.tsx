import React, { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { PillButton, Stepper } from '../../p1/ui';
import { ChoiceChips, Sheet } from '../../p2/ui';
import { shareLabelSheet } from '../pdf';
import { LABEL_LAYOUTS, type LabelCounts, type LabelLayout } from '../types';
import { SwitchRow } from './ui';

/**
 * Print barcode labels (C6, D-7): how many of each, which sheet, price / MRP on
 * or off → a PDF through the share sheet (print it, save it). Only products
 * with a barcode print; the server says so if none do (LABELS_NOTHING_TO_PRINT).
 */
export function LabelsSheet({
  visible, onDismiss, items,
}: { visible: boolean; onDismiss: () => void; items: Array<{ productId: string; name: string }> }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [layout, setLayout] = useState<LabelLayout>('A4_65');
  const [showPrice, setShowPrice] = useState(true);
  const [showMrp, setShowMrp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // >>> GAP-C-SHOP — what the server counted on the sheet just made (X-Labels-Count / X-Labels-Skipped).
  const [done, setDone] = useState<LabelCounts | null>(null);
  // <<< GAP-C-SHOP

  useEffect(() => { if (visible) { setError(null); setDone(null); } }, [visible]);

  const print = async () => {
    setBusy(true);
    setError(null);
    try {
      const counts = await shareLabelSheet({
        items: items.slice(0, 200).map((i) => ({ productId: i.productId, copies: Math.min(200, Math.max(1, copies[i.productId] ?? 1)) })),
        layout, showPrice, showMrp,
      });
      // >>> GAP-C-SHOP — say how many were made and how many left out; an older server (no counts) closes as before.
      if (counts) setDone(counts);
      else onDismiss();
      // <<< GAP-C-SHOP
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t('commerce.labels.title')}
      testID="labels-sheet"
      footer={done ? (
        <>
          <PillButton c={c} icon="check" label={t('commerce.common.done')} onPress={onDismiss} testID="labels-done-close" />
          <PillButton c={c} tone="outline" icon="printer-outline" label={t('commerce.labels.printAgain')} onPress={() => void print()} disabled={busy} testID="labels-print-again" />
        </>
      ) : <PillButton c={c} icon="printer-outline" label={t('commerce.labels.print')} onPress={() => void print()} disabled={busy || !items.length} testID="labels-print" />}
    >
      {/* >>> GAP-C-SHOP */}
      {done ? (
        <View style={[styles.done, { borderColor: done.skipped ? c.warning : c.success }]} testID="labels-done">
          <Text style={{ color: c.success, fontWeight: '700', fontSize: 15 }}>{t('commerce.labels.doneCount', { count: done.labels })}</Text>
          {done.skipped ? (
            <Text style={{ color: c.warning, fontSize: 13 }} testID="labels-skipped">{t('commerce.labels.doneSkipped', { count: done.skipped })}</Text>
          ) : null}
        </View>
      ) : null}
      {/* <<< GAP-C-SHOP */}
      {items.map((i) => (
        <View key={i.productId} style={[styles.row, { borderColor: c.divider }]}>
          <Text style={{ color: c.textPrimary, flexGrow: 1, flexBasis: 120, minWidth: 0, fontWeight: '600' }} numberOfLines={2}>{i.name}</Text>
          <Stepper
            c={c}
            value={copies[i.productId] ?? 1}
            min={1}
            max={200}
            onChange={(n) => setCopies((x) => ({ ...x, [i.productId]: Math.round(n) }))}
            label={t('commerce.labels.copiesOf', { name: i.name })}
            testID={`labels-copies-${i.productId}`}
          />
        </View>
      ))}
      <Text style={[styles.label, { color: c.textPrimary }]}>{t('commerce.labels.layout')}</Text>
      <ChoiceChips
        c={c}
        options={LABEL_LAYOUTS.map((l) => ({ key: l, label: t(`commerce.labels.layouts.${l}`) }))}
        value={[layout]}
        onChange={(v) => setLayout(v[0] ?? 'A4_65')}
        testID="labels-layout"
      />
      {/* MP-1 wording: web's layout names ("A4 · 65 labels") say the count; the hint keeps the sticker size. */}
      <Text style={{ color: c.textSecondary, fontSize: 12 }} testID="labels-layout-hint">{t(`commerce.labels.layoutHints.${layout}`)}</Text>
      <SwitchRow c={c} label={t('commerce.labels.showPrice')} value={showPrice} onValueChange={setShowPrice} />
      <SwitchRow c={c} label={t('commerce.labels.showMrp')} value={showMrp} onValueChange={setShowMrp} />
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('commerce.labels.barcodeNote')}</Text>
      {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="labels-error">{error}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  label: { fontSize: 14, fontWeight: '700' },
  done: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
});
