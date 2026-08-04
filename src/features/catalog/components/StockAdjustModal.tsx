import React, { useState } from 'react';
import { View, StyleSheet, useColorScheme, ScrollView } from 'react-native';
import { Portal, Dialog, Text, TextInput, Button, HelperText, SegmentedButtons } from 'react-native-paper';

import { themeColors, radii } from '../../../constants/colors';
import { StockAdjustMode, StockAdjustReasonCode, STOCK_ADJUST_REASON_CODES, STOCK_ADJUST_REASON_LABELS } from '../types';

/**
 * "Stock adjust with a reason" (the assignment's own words). Mirrors
 * `adjustStockSchema` exactly: `qty` cannot be negative, `SET` may legally
 * carry `qty: 0`, `INCREASE`/`DECREASE` may not (the server's own `.refine`
 * — "adding or removing nothing is not a change"), and `reason` needs at
 * least a few real words. An unexplained stock change is the one record an
 * auditor cannot tell apart from theft — the same sentence the backend uses.
 */
export interface StockAdjustTarget {
  productId: string;
  productName: string;
  currentQty: number;
}

interface StockAdjustModalProps {
  target: StockAdjustTarget | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (input: { mode: StockAdjustMode; qty: number; reason: string; reasonCode: StockAdjustReasonCode }) => void;
}

export function StockAdjustModal({ target, submitting, onCancel, onSubmit }: StockAdjustModalProps) {
  const c = themeColors(useColorScheme() === 'dark');
  const [mode, setMode] = useState<StockAdjustMode>('INCREASE');
  const [qtyText, setQtyText] = useState('');
  const [reason, setReason] = useState('');
  const [reasonCode, setReasonCode] = useState<StockAdjustReasonCode>('PURCHASE');

  React.useEffect(() => {
    if (target) {
      setMode('INCREASE');
      setQtyText('');
      setReason('');
      setReasonCode('PURCHASE');
    }
  }, [target]);

  const qty = Number(qtyText);
  const qtyValid = qtyText.trim() !== '' && Number.isFinite(qty) && qty >= 0 && (mode === 'SET' || qty > 0);
  const reasonValid = reason.trim().length >= 3;
  const canSubmit = qtyValid && reasonValid && !submitting;

  const preview = qtyValid
    ? mode === 'SET' ? qty : mode === 'INCREASE' ? (target?.currentQty ?? 0) + qty : (target?.currentQty ?? 0) - qty
    : null;

  return (
    <Portal>
      <Dialog visible={Boolean(target)} onDismiss={submitting ? undefined : onCancel} style={{ backgroundColor: c.surface }}>
        <Dialog.Title>{target?.productName}</Dialog.Title>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={[styles.currentLine, { color: c.textSecondary }]}>
              Currently {target?.currentQty ?? 0} on hand
            </Text>

            <SegmentedButtons
              value={mode}
              onValueChange={(v) => setMode(v as StockAdjustMode)}
              buttons={[
                { value: 'INCREASE', label: 'Add' },
                { value: 'DECREASE', label: 'Remove' },
                { value: 'SET', label: 'Set to' },
              ]}
              style={styles.segmented}
            />

            <TextInput
              mode="outlined"
              label={mode === 'SET' ? 'New count' : 'Quantity'}
              value={qtyText}
              onChangeText={setQtyText}
              keyboardType="numeric"
              outlineStyle={styles.outline}
            />
            {preview !== null && (
              <Text style={[styles.previewLine, { color: preview < 0 ? c.error : c.textSecondary }]}>
                {preview < 0 ? 'That would take stock below zero.' : `New count: ${preview}`}
              </Text>
            )}

            <View style={styles.reasonChips}>
              {STOCK_ADJUST_REASON_CODES.map((code) => {
                const active = code === reasonCode;
                return (
                  <Text
                    key={code}
                    onPress={() => setReasonCode(code)}
                    style={[
                      styles.reasonChip,
                      {
                        backgroundColor: active ? c.primary : c.surfaceVariant,
                        color: active ? '#fff' : c.textSecondary,
                      },
                    ]}
                  >
                    {STOCK_ADJUST_REASON_LABELS[code]}
                  </Text>
                );
              })}
            </View>

            <TextInput
              mode="outlined"
              label="Note"
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Delivery from supplier, 2 cases"
              multiline
              numberOfLines={2}
              outlineStyle={styles.outline}
            />
            <HelperText type="error" visible={reason.trim().length > 0 && !reasonValid}>
              Say a little more — this becomes part of the audit record.
            </HelperText>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onCancel} disabled={submitting}>Cancel</Button>
          <Button
            onPress={() => onSubmit({ mode, qty, reason: reason.trim(), reasonCode })}
            disabled={!canSubmit || (preview !== null && preview < 0)}
            loading={submitting}
          >
            Save
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  scrollArea: { paddingHorizontal: 0, maxHeight: 420 },
  body: { paddingHorizontal: 24, gap: 10, paddingBottom: 8 },
  currentLine: { fontSize: 12.5 },
  segmented: { marginVertical: 4 },
  outline: { borderRadius: radii.field },
  previewLine: { fontSize: 12, fontWeight: '600' },
  reasonChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  reasonChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 11.5, fontWeight: '700', overflow: 'hidden' },
});
