import React, { useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { Button, Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import type { ReorderRow, ReorderSettingsBody } from '../api';

/**
 * A product's reorder settings (§6 `PUT /reorder/products/:id`): the low-stock
 * level, how many to reorder, the most to hold. An emptied field CLEARS it
 * (`null`); the preferred supplier is set from the row's supplier button.
 */
export function ReorderSettingsDialog({
  row, supplier, submitting, onCancel, onSubmit,
}: {
  row: ReorderRow | null;
  /** The supplier currently shown on the row — saved as preferred. */
  supplier?: { id: string; name: string };
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (body: ReorderSettingsBody) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [low, setLow] = useState('');
  const [reorderQty, setReorderQty] = useState('');
  const [max, setMax] = useState('');

  useEffect(() => {
    if (!row) return;
    setLow(row.lowStockAt !== undefined ? String(row.lowStockAt) : '');
    setReorderQty(row.reorderQty !== undefined ? String(row.reorderQty) : '');
    setMax(row.maxStockQty !== undefined ? String(row.maxStockQty) : '');
  }, [row]);

  const num = (s: string): number | null | 'bad' => {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : 'bad';
  };
  const vals = [num(low), num(reorderQty), num(max)];
  const bad = vals.includes('bad');

  const field = (label: string, value: string, set: (v: string) => void) => (
    <TextInput mode="outlined" dense label={label} value={value} onChangeText={set} keyboardType="numeric" outlineStyle={{ borderRadius: radii.field }} />
  );

  return (
    <Portal>
      <Dialog visible={!!row} onDismiss={submitting ? undefined : onCancel} style={{ backgroundColor: c.surface }}>
        <Dialog.Title numberOfLines={2}>{row?.name}</Dialog.Title>
        <Dialog.Content>
          <View style={{ gap: 8 }}>
            {field(t('stock.reorder.lowStockAt'), low, setLow)}
            {field(t('stock.reorder.reorderQty'), reorderQty, setReorderQty)}
            {field(t('stock.reorder.maxStockQty'), max, setMax)}
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>
              {supplier ? t('stock.reorder.preferredWillBe', { name: supplier.name }) : t('stock.reorder.noPreferred')}
            </Text>
            {bad ? <Text style={{ color: c.error, fontSize: 12 }}>{t('stock.reorder.numbersOnly')}</Text> : null}
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel} disabled={submitting}>{t('common.cancel')}</Button>
          <Button
            disabled={bad || submitting}
            loading={submitting}
            onPress={() => onSubmit({
              lowStockAt: vals[0] as number | null,
              reorderQty: vals[1] as number | null,
              maxStockQty: vals[2] as number | null,
              ...(supplier ? { preferredSupplierId: supplier.id } : {}),
            })}
          >
            {t('common.save')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
