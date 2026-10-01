import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { fmtQty } from '../logic';
import type { LoadingItem } from '../types';

/** What to load on the cycle for the round: item · qty unit (due + delivered rows). Folded by default. */
export function LoadingList({ c, items }: { c: ColorScheme; items: readonly LoadingItem[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.divider }]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        testID="loading-list-toggle"
        style={styles.head}
      >
        <MaterialCommunityIcons name="package-variant" size={20} color={c.primary} />
        <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>
          {t('p2.subscriptions.deliveries.loadingList', { count: items.length })}
        </Text>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={c.textSecondary} />
      </Pressable>
      {open ? (
        <View style={styles.body} testID="loading-list">
          {items.length === 0 ? (
            <Text style={{ color: c.textSecondary }}>{t('p2.subscriptions.deliveries.loadingEmpty')}</Text>
          ) : items.map((i) => (
            <View key={`${i.itemName}|${i.unit}`} style={[styles.row, { borderBottomColor: c.divider }]}>
              <Text style={{ flex: 1, minWidth: 0, color: c.textPrimary, fontSize: 15 }} numberOfLines={2}>{i.itemName}</Text>
              <Text style={{ color: c.textPrimary, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                {`${fmtQty(i.qty)} ${i.unit}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12 },
  title: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '700' },
  body: { paddingHorizontal: 12, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
});
