import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { DateField } from '../../../components/DateField';
import { STOCK_MOVEMENT_TYPES, STOCK_TYPE_LABEL_KEYS, StockMovementFilters as Filters, StockMovementType } from '../stockMovements';

/** Type chips (one horizontal strip — never wraps into a wall of pills) and a from/to date pair. */
export function StockMovementFilters({
  c, value, onChange,
}: {
  c: ColorScheme;
  value: Filters;
  onChange: (next: Filters) => void;
}) {
  const { t } = useTranslation();
  const chips: { key: StockMovementType | ''; label: string }[] = [
    { key: '', label: t('stockHistory.filterAll') },
    ...STOCK_MOVEMENT_TYPES.map((k) => ({ key: k, label: t(STOCK_TYPE_LABEL_KEYS[k]) })),
  ];
  const hasDates = Boolean(value.from || value.to);
  const today = new Date();

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {chips.map((chip) => {
          const active = (value.type ?? '') === chip.key;
          return (
            <Pressable
              key={chip.key || 'ALL'}
              onPress={() => onChange({ ...value, type: chip.key || undefined })}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                { backgroundColor: active ? c.primary : c.surface, borderColor: active ? c.primary : c.border },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? c.textInverse : c.textPrimary }]}>{chip.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.dates}>
        <DateField
          label={t('stockHistory.from')}
          value={value.from ?? ''}
          onChangeText={(v) => onChange({ ...value, from: v || undefined })}
          maximumDate={today}
          style={styles.date}
        />
        <DateField
          label={t('stockHistory.to')}
          value={value.to ?? ''}
          onChangeText={(v) => onChange({ ...value, to: v || undefined })}
          maximumDate={today}
          style={styles.date}
        />
      </View>
      {hasDates ? (
        <Pressable
          onPress={() => onChange({ ...value, from: undefined, to: undefined })}
          style={styles.clear}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={{ color: c.primary, fontWeight: '600', fontSize: 12.5 }}>{t('stockHistory.clearDates')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  chips: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: '600' },
  dates: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  date: { flexGrow: 1, flexBasis: 130 },
  clear: { alignSelf: 'flex-end', paddingVertical: 2 },
});
