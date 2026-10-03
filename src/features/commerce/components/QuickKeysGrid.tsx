import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import type { QuickKey } from '../types';

/**
 * The counter's quick-keys grid (D, C6): up to 24 big tiles, one tap = one unit
 * on the bill. Tiles WRAP — three across at 320dp, more on a tablet — with a
 * fixed minimum so a long name breaks onto two lines instead of shrinking the
 * target below a thumb.
 */
export function QuickKeysGrid({
  c, keys, onTap, busyId, testID,
}: { c: ColorScheme; keys: QuickKey[]; onTap: (k: QuickKey) => void; busyId?: string | null; testID?: string }) {
  const { t } = useTranslation();
  if (!keys.length) return null;
  return (
    <View style={styles.grid} testID={testID ?? 'quick-keys'}>
      {keys.map((k) => {
        const out = k.stockQty !== undefined && k.stockQty <= 0;
        // GAP-C-SHOP: the MRP, struck through, when the key sells below it (the key now carries it).
        const mrp = k.mrpPaise && k.mrpPaise > k.sellPaise ? k.mrpPaise : 0;
        return (
          <Pressable
            key={k.productId}
            onPress={() => onTap(k)}
            disabled={busyId === k.productId}
            accessibilityRole="button"
            accessibilityLabel={t('commerce.counter.quickKeyA11y', { name: k.name, price: formatPaise(k.sellPaise) })}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: pressed ? c.surfaceVariant : c.surface, borderColor: out ? c.warning : c.divider },
            ]}
            testID={`quick-key-${k.productId}`}
          >
            <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>{k.name}</Text>
            <View style={styles.foot}>
              <Text style={[styles.price, { color: c.primary }]} numberOfLines={1}>
                {formatPaise(k.sellPaise)}
                {mrp ? <Text style={[styles.mrp, { color: c.textSecondary }]} testID={`quick-key-mrp-${k.productId}`}>{` ${formatPaise(mrp)}`}</Text> : null}
              </Text>
              {busyId === k.productId ? <ActivityIndicator size="small" color={c.primary} /> : null}
            </View>
            {out ? <Text style={[styles.out, { color: c.warning }]} numberOfLines={1}>{t('commerce.counter.outOfStock')}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexGrow: 1, flexBasis: '30%', minWidth: 92, maxWidth: 180, minHeight: 72,
    borderRadius: radii.card, borderWidth: 1, padding: 8, justifyContent: 'space-between',
  },
  name: { fontSize: 13, fontWeight: '600', lineHeight: 17 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 4 },
  price: { fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  out: { fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  mrp: { fontSize: 11, fontWeight: '400', textDecorationLine: 'line-through' },
});
