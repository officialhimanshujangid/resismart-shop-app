import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise, paiseToInput, parseRupeesToPaise } from '../../../lib/money';
import { Stepper } from '../../p1/ui';
import type { PoReceiptLine } from '../api';
import type { ReceiveDraftLine } from '../logic';

/**
 * One PO line on the receive screen: ordered / received / pending, a big
 * stepper for what arrived today, and the rate (tap to change it when the
 * goods came at a different price). Wraps under the name on a 320dp phone.
 */
export function ReceiveLineRow({
  c, line, value, max, onChange, over,
}: {
  c: ColorScheme;
  line: PoReceiptLine;
  value: ReceiveDraftLine;
  /** Pending plus the shop's over-receipt tolerance. */
  max: number;
  onChange: (next: ReceiveDraftLine) => void;
  over: boolean;
}) {
  const { t } = useTranslation();
  const [editingRate, setEditingRate] = useState(false);
  const [rateText, setRateText] = useState(paiseToInput(value.ratePaise ?? line.ratePaise));
  const done = line.pending <= 0;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: over ? c.error : c.divider }]} testID={`receive-line-${line.poLineIndex}`}>
      <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>{line.itemName}</Text>
      <Text style={[styles.meta, { color: c.textSecondary }]}>
        {t('purchases.receive.counts', { ordered: line.ordered, received: line.received, pending: line.pending, unit: line.unit })}
      </Text>
      {done ? (
        <Text style={[styles.meta, { color: c.success, fontWeight: '600' }]}>{t('purchases.receive.lineDone')}</Text>
      ) : (
        <View style={styles.controls}>
          <Stepper
            c={c}
            value={value.qty}
            onChange={(qty) => onChange({ ...value, qty })}
            min={0}
            label={line.itemName}
          />
          <Pressable
            onPress={() => setEditingRate((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={t('purchases.receive.changeRate', { item: line.itemName })}
            style={styles.rate}
            hitSlop={8}
          >
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>{t('purchases.receive.rate')}</Text>
            <Text style={{ color: c.primary, fontWeight: '700' }}>{formatPaise(value.ratePaise ?? line.ratePaise)}</Text>
          </Pressable>
        </View>
      )}
      {editingRate && !done && (
        <TextInput
          mode="outlined"
          dense
          label={t('purchases.receive.newRate')}
          value={rateText}
          keyboardType="decimal-pad"
          onChangeText={(s) => {
            setRateText(s);
            const p = parseRupeesToPaise(s);
            if (p !== null) onChange({ ...value, ratePaise: p });
          }}
          outlineStyle={{ borderRadius: radii.field }}
          style={{ backgroundColor: 'transparent' }}
        />
      )}
      {over && (
        <Text style={[styles.meta, { color: c.error, fontWeight: '600' }]}>
          {t('purchases.receive.overPending', { max })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: 14, gap: 6 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12.5 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  rate: { alignItems: 'flex-end', minHeight: 44, justifyContent: 'center' },
});
