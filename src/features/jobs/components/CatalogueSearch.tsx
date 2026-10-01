import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { catalogApi } from '../../catalog/api';
import type { Product } from '../../catalog/types';
import { useDebouncedValue } from '../../billing/useDebouncedValue';

/**
 * Search the catalogue for a part and tap it onto the quote (a repeat bumps
 * the qty). Parts from the catalogue carry `itemId`, so the job bill later
 * moves their stock like any P1 invoice.
 */
export function CatalogueSearch({ c, onPick }: { c: ColorScheme; onPick: (p: Product) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 300);
  const [rows, setRows] = useState<Product[]>([]);

  useEffect(() => {
    const term = debounced.trim();
    if (!term) { setRows([]); return; }
    let alive = true;
    catalogApi.search(term)
      .then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [debounced]);

  return (
    <View>
      <TextInput
        mode="outlined"
        placeholder={t('p2.jobs.quote.searchCatalogue')}
        accessibilityLabel={t('p2.jobs.quote.searchCatalogue')}
        value={q}
        onChangeText={setQ}
        style={{ backgroundColor: 'transparent' }}
        outlineStyle={{ borderRadius: radii.field }}
        left={<TextInput.Icon icon="magnify" />}
        testID="job-catalogue-search"
      />
      {rows.map((p) => (
        <Pressable
          key={p._id}
          onPress={() => onPick(p)}
          accessibilityRole="button"
          style={[styles.row, { borderBottomColor: c.divider }]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{p.name}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
              {t('p2.jobs.quote.perUnit', { price: formatPaise(p.sellPaise), unit: p.unit })}
            </Text>
          </View>
          <IconButton icon="plus-circle-outline" size={22} onPress={() => onPick(p)} accessibilityLabel={t('p2.jobs.quote.addPart', { item: p.name })} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
});
