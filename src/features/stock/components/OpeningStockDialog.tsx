import React, { useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { Button, Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { parseRupeesToPaise } from '../../../lib/money';

/**
 * Opening stock WITH its cost (screen S10) — the first setup of a product, so
 * its stock value and margins start right. Refused once the product has any
 * other stock movement (409 OPENING_STOCK_AFTER_MOVEMENTS): after that, a stock
 * adjustment with a unit cost is the way.
 */
export function OpeningStockDialog({
  visible, name, submitting, onCancel, onSubmit,
}: {
  visible: boolean;
  name: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (body: { qty: number; unitCostPaise: number }) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  useEffect(() => { if (visible) { setQty(''); setCost(''); } }, [visible]);

  const q = Number(qty);
  const paise = parseRupeesToPaise(cost);
  const valid = qty.trim() !== '' && Number.isFinite(q) && q > 0 && paise !== null;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={submitting ? undefined : onCancel} style={{ backgroundColor: c.surface }}>
        <Dialog.Title numberOfLines={2}>{t('catalog.opening.title', { name })}</Dialog.Title>
        <Dialog.Content>
          <View style={{ gap: 10 }}>
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('catalog.opening.body')}</Text>
            <TextInput mode="outlined" label={t('catalog.opening.qty')} value={qty} onChangeText={setQty} keyboardType="decimal-pad" outlineStyle={{ borderRadius: radii.field }} />
            <TextInput mode="outlined" label={t('catalog.stock.unitCost')} value={cost} onChangeText={setCost} keyboardType="decimal-pad" outlineStyle={{ borderRadius: radii.field }} />
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel} disabled={submitting}>{t('common.cancel')}</Button>
          <Button onPress={() => onSubmit({ qty: q, unitCostPaise: paise ?? 0 })} disabled={!valid || submitting} loading={submitting}>
            {t('common.save')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
