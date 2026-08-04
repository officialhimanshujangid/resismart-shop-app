import React from 'react';
import { View, StyleSheet, Pressable, Image, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Product } from '../types';
import { themeColors, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';

/** Below `lowStockAt` (if set) OR at/under zero when tracked at all — mirrors
 *  `lowStock=true`'s own `$or` in `partner-product.controller.ts#list`. */
function isLowStock(p: Product): boolean {
  if (!p.trackStock) return false;
  if (p.stockQty <= 0) return true;
  return typeof p.lowStockAt === 'number' && p.stockQty <= p.lowStockAt;
}

export function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  const c = themeColors(useColorScheme() === 'dark');
  const low = isLowStock(product);
  const outOfStock = product.trackStock && product.stockQty <= 0;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider, opacity: product.isActive ? 1 : 0.55 }]}
    >
      {product.images[0] ? (
        <Image source={{ uri: product.images[0] }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: c.surfaceVariant }]}>
          <MaterialCommunityIcons name="package-variant" size={20} color={c.textDisabled} />
        </View>
      )}

      <View style={styles.infoCol}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{product.name}</Text>
        <Text style={[styles.subline, { color: c.textSecondary }]} numberOfLines={1}>
          {[product.sku, product.categoryId?.name].filter(Boolean).join(' · ') || 'Uncategorised'}
        </Text>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: c.textPrimary }]}>{formatPaise(product.sellPaise)}</Text>
          {product.mrpPaise > 0 && product.mrpPaise !== product.sellPaise && (
            <Text style={[styles.mrp, { color: c.textDisabled }]}>{formatPaise(product.mrpPaise)}</Text>
          )}
          <Text style={[styles.unit, { color: c.textSecondary }]}>/{product.unit.toLowerCase()}</Text>
        </View>
      </View>

      <View style={styles.rightCol}>
        {!product.isActive && (
          <View style={[styles.badge, { backgroundColor: c.textDisabled + '22' }]}>
            <Text style={[styles.badgeText, { color: c.textSecondary }]}>Off sale</Text>
          </View>
        )}
        {product.trackStock ? (
          <View style={[styles.badge, { backgroundColor: outOfStock ? c.error + '22' : low ? c.warning + '22' : c.success + '18' }]}>
            <Text style={[styles.badgeText, { color: outOfStock ? c.error : low ? c.warning : c.success }]}>
              {outOfStock ? 'Out of stock' : low ? `Low · ${product.stockQty}` : `${product.stockQty} in stock`}
            </Text>
          </View>
        ) : (
          <Text style={[styles.notTracked, { color: c.textDisabled }]}>Not tracked</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth,
    padding: 10, marginHorizontal: 14, marginVertical: 5,
  },
  thumb: { width: 48, height: 48, borderRadius: radii.sm },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  infoCol: { flex: 1, gap: 2 },
  name: { fontSize: 14.5, fontWeight: '700' },
  subline: { fontSize: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  price: { fontSize: 14, fontWeight: '800' },
  mrp: { fontSize: 11.5, textDecorationLine: 'line-through' },
  unit: { fontSize: 11 },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
  notTracked: { fontSize: 10.5, fontWeight: '600' },
});
