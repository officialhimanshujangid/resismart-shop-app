import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../constants/colors';
import { Stepper } from '../../p1/ui';
import type { StockCountLine } from '../api';

/** Type the whole shelf's count for one product (SET mode) instead of scanning each unit. */
export function SetCountDialog({
  line, submitting, onCancel, onSubmit,
}: {
  line: StockCountLine | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (qty: number) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [qty, setQty] = useState(0);
  useEffect(() => { if (line) setQty(line.countedQty ?? 0); }, [line]);

  return (
    <Portal>
      <Dialog visible={!!line} onDismiss={submitting ? undefined : onCancel} style={{ backgroundColor: c.surface }}>
        <Dialog.Title numberOfLines={2}>{line?.productName}</Dialog.Title>
        <Dialog.Content style={{ gap: 12 }}>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('stock.count.setBody')}</Text>
          <Stepper c={c} value={qty} onChange={setQty} min={0} label={line?.productName ?? ''} />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel} disabled={submitting}>{t('common.cancel')}</Button>
          <Button onPress={() => onSubmit(qty)} loading={submitting} disabled={submitting}>{t('stock.count.setSave')}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
