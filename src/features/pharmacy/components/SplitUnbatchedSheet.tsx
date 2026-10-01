import React, { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { IconButton, Text, TextInput } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { newIdempotencyKey } from '../../../lib/idempotency';
import { Sheet } from '../../p2/ui';
import { ActionRow, Banner, PillButton } from '../../p1/ui';
import { pharmacyApi, pharmacyKeys } from '../api';
import { EMPTY_SPLIT_ROW, SplitDraftRow, fmtQty, splitBody, splitProblem, splitSum } from '../logic';

/**
 * "Split into batches": stock that came in before batch tracking (no batch
 * number) is labelled as 1–50 batches — batch no, expiry month, MRP
 * (optional), qty. The total may not exceed the unbatched quantity; the phone
 * checks first, the server again (409 BATCH_SPLIT_EXCEEDS_UNBATCHED). No stock
 * moves — the same units just get their labels.
 */
export function SplitUnbatchedSheet({
  visible, productId, productName, unit, unbatchedQty, onDismiss,
}: {
  visible: boolean; productId: string; productName: string; unit?: string; unbatchedQty: number; onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<SplitDraftRow[]>([{ ...EMPTY_SPLIT_ROW }]);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setRows([{ ...EMPTY_SPLIT_ROW, qty: fmtQty(unbatchedQty) }]);
    setError(null);
    setKey(newIdempotencyKey('pharmacy-split'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const save = useMutation({
    mutationFn: () => pharmacyApi.splitUnbatched(productId, splitBody(rows), key),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pharmacyKeys.all() });
      onDismiss();
    },
    onError: (e) => setError(apiErrorMessage(e, t('p2.pharmacy.split.failed'))),
  });

  const edit = (i: number, patch: Partial<SplitDraftRow>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    // The rows changed: this is a new decision, so a new key.
    setKey(newIdempotencyKey('pharmacy-split'));
  };
  const submit = () => {
    const p = splitProblem(rows, unbatchedQty);
    if (p) { setError(t(p.key, p.params)); return; }
    setError(null);
    save.mutate();
  };
  const sum = splitSum(rows);

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t('p2.pharmacy.split.title')}
      testID="split-sheet"
      footer={(
        <PillButton
          c={c}
          icon="call-split"
          label={save.isPending ? t('common.saving') : t('p2.pharmacy.split.save')}
          onPress={submit}
          disabled={save.isPending}
          testID="split-save"
        />
      )}
    >
      <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={2}>{productName}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>
        {t('p2.pharmacy.split.intro', { qty: fmtQty(unbatchedQty), unit: unit ?? '' })}
      </Text>
      {rows.map((r, i) => (
        <View key={i} style={[styles.card, { borderColor: c.divider }]} testID={`split-row-${i}`}>
          <View style={styles.cardHead}>
            <Text style={{ flex: 1, minWidth: 0, color: c.textSecondary, fontWeight: '600' }} numberOfLines={1}>
              {t('p2.pharmacy.split.rowTitle', { row: i + 1 })}
            </Text>
            {rows.length > 1 ? (
              <IconButton
                icon="close"
                size={20}
                onPress={() => { setRows((rs) => rs.filter((_, j) => j !== i)); setKey(newIdempotencyKey('pharmacy-split')); }}
                accessibilityLabel={t('p2.pharmacy.split.removeRow', { row: i + 1 })}
              />
            ) : null}
          </View>
          <View style={styles.pair}>
            <TextInput
              mode="outlined"
              label={t('p2.pharmacy.split.batchNo')}
              value={r.batchNo}
              onChangeText={(s) => edit(i, { batchNo: s.slice(0, 30) })}
              autoCapitalize="characters"
              outlineStyle={{ borderRadius: radii.field }}
              style={styles.half}
              testID={`split-batchNo-${i}`}
            />
            <TextInput
              mode="outlined"
              label={t('p2.pharmacy.split.expiry')}
              placeholder="2027-03"
              value={r.expiry}
              onChangeText={(s) => edit(i, { expiry: s })}
              outlineStyle={{ borderRadius: radii.field }}
              style={styles.half}
              testID={`split-expiry-${i}`}
            />
          </View>
          <View style={styles.pair}>
            <TextInput
              mode="outlined"
              label={t('p2.pharmacy.split.mrp')}
              value={r.mrp}
              onChangeText={(s) => edit(i, { mrp: s })}
              keyboardType="decimal-pad"
              outlineStyle={{ borderRadius: radii.field }}
              style={styles.half}
              testID={`split-mrp-${i}`}
            />
            <TextInput
              mode="outlined"
              label={t('p2.pharmacy.split.qty')}
              value={r.qty}
              onChangeText={(s) => edit(i, { qty: s })}
              keyboardType="decimal-pad"
              outlineStyle={{ borderRadius: radii.field }}
              style={styles.half}
              testID={`split-qty-${i}`}
            />
          </View>
        </View>
      ))}
      <Text
        style={{ color: sum > unbatchedQty + 1e-9 ? c.error : c.textSecondary, fontSize: 13, fontWeight: '600' }}
        testID="split-total"
      >
        {t('p2.pharmacy.split.total', { sum: fmtQty(sum), max: fmtQty(unbatchedQty) })}
      </Text>
      {rows.length < 50 ? (
        <ActionRow>
          <PillButton
            c={c}
            tone="outline"
            icon="plus"
            label={t('p2.pharmacy.split.addRow')}
            onPress={() => { setRows((rs) => [...rs, { ...EMPTY_SPLIT_ROW }]); setKey(newIdempotencyKey('pharmacy-split')); }}
            testID="split-add"
          />
        </ActionRow>
      ) : null}
      {error ? <View testID="split-error"><Banner c={c} tone="error" body={error} /></View> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.card, padding: 10, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  half: { flexGrow: 1, flexBasis: 120, minWidth: 120, backgroundColor: 'transparent' },
});
