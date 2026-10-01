import React from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { ChipRow } from '../../more/ui';

/** Freight, packing and the like on a supplier bill — lines with no catalogue item (§4.3). */
export interface ExtraCharge {
  key: string;
  name: string;
  amount: string;
  taxRate: '0' | '5' | '12' | '18' | '28';
}

const RATES = ['0', '5', '12', '18', '28'] as const;

export function ExtraChargesEditor({
  c, value, onChange,
}: { c: ColorScheme; value: ExtraCharge[]; onChange: (next: ExtraCharge[]) => void }) {
  const { t } = useTranslation();
  const patch = (key: string, p: Partial<ExtraCharge>) => onChange(value.map((x) => (x.key === key ? { ...x, ...p } : x)));
  return (
    <View style={{ gap: 10 }}>
      {value.map((x) => (
        <View key={x.key} style={[styles.card, { borderColor: c.divider }]}>
          <View style={styles.topRow}>
            <TextInput
              mode="outlined"
              dense
              label={t('purchases.bill.chargeName')}
              value={x.name}
              onChangeText={(name) => patch(x.key, { name })}
              style={styles.flexInput}
              outlineStyle={{ borderRadius: radii.field }}
            />
            <IconButton icon="trash-can-outline" onPress={() => onChange(value.filter((y) => y.key !== x.key))} accessibilityLabel={t('purchases.bill.removeCharge')} />
          </View>
          <TextInput
            mode="outlined"
            dense
            label={t('purchases.bill.chargeAmount')}
            value={x.amount}
            keyboardType="decimal-pad"
            onChangeText={(amount) => patch(x.key, { amount })}
            style={{ backgroundColor: 'transparent' }}
            outlineStyle={{ borderRadius: radii.field }}
          />
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('purchases.bill.chargeGst')}</Text>
          <ChipRow c={c} value={x.taxRate} options={RATES.map((r) => ({ key: r, label: `${r}%` }))} onChange={(taxRate) => patch(x.key, { taxRate })} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.card, padding: 10, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  flexInput: { flex: 1, backgroundColor: 'transparent' },
});
