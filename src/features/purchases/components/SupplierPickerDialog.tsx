import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { Button, Dialog, Portal, Searchbar, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { partiesApi, PartnerParty } from '../../../api/parties.api';
import { useDebouncedValue } from '../../billing/useDebouncedValue';

/** Pick one of this shop's suppliers (active SUPPLIER/BOTH parties), by name or phone. */
export function SupplierPickerDialog({
  visible, onDismiss, onPick, title,
}: {
  visible: boolean;
  onDismiss: () => void;
  onPick: (party: { id: string; name: string } | null) => void;
  title?: string;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 300);
  const [rows, setRows] = useState<PartnerParty[]>([]);

  useEffect(() => { if (visible) setQ(''); }, [visible]);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    partiesApi.search(debounced.trim(), 'SUPPLIER', 20)
      .then((r) => { if (alive) setRows(r ?? []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [debounced, visible]);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ backgroundColor: c.surface, maxHeight: '85%' }}>
        <Dialog.Title>{title ?? t('purchases.pickSupplier')}</Dialog.Title>
        <Dialog.Content style={{ gap: 8 }}>
          <Searchbar value={q} onChangeText={setQ} placeholder={t('purchases.searchSupplier')} style={{ backgroundColor: c.surfaceVariant, borderRadius: radii.field, elevation: 0 }} />
        </Dialog.Content>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0, maxHeight: 360 }}>
          <ScrollView>
            {rows.length === 0 ? (
              <Text style={{ color: c.textSecondary, padding: 20 }}>{t('purchases.noSuppliers')}</Text>
            ) : rows.map((p) => (
              <Pressable key={p._id} onPress={() => onPick({ id: p._id, name: p.name })} style={[styles.row, { borderBottomColor: c.divider }]} accessibilityRole="button">
                <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>{p.name}</Text>
                {p.phone ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>{p.phone}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t('common.cancel')}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 24, paddingVertical: 12, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
});
