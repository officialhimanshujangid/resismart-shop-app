import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Product } from '../types';
import { radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
// M20 — DS v1: theme hook, press feedback, token badges, stock bar.
import { useAppTheme } from '../../../theme/useAppTheme';
import { PressableScale } from '../../../theme/motion';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { StockBar } from './StockBar';
import { fontFamily } from '../../../theme/tokens';

/** Below `lowStockAt` (if set) OR at/under zero when tracked at all — mirrors
 *  `lowStock=true`'s own `$or` in `partner-product.controller.ts#list`. */
function isLowStock(p: Product): boolean {
  if (!p.trackStock) return false;
  if (p.stockQty <= 0) return true;
  return typeof p.lowStockAt === 'number' && p.stockQty <= p.lowStockAt;
}

export function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  const { t } = useTranslation();
  const { c, shadow } = useAppTheme();
  const low = isLowStock(product);
  const outOfStock = product.trackStock && product.stockQty <= 0;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      testID={`product-card-${product._id}`}
      // M20: an off-sale product keeps full contrast (its "Off sale" badge says so) —
      // a faded row read as "disabled", which it is not.
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow('card')]}
    >
      {product.images[0] ? (
        <Image source={{ uri: product.images[0] }} style={[styles.thumb, { backgroundColor: c.surfaceVariant }]} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: c.surfaceVariant }]}>
          <MaterialCommunityIcons name="package-variant" size={20} color={c.textSecondary} />
        </View>
      )}

      <View style={styles.infoCol}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>{product.name}</Text>
        <Text style={[styles.subline, { color: c.textSecondary }]} numberOfLines={1}>
          {/* `sku` and the category name are the partner's own text. */}
          {[product.sku, product.categoryId?.name].filter(Boolean).join(' · ') || t('catalog.card.uncategorised')}
        </Text>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: c.textPrimary }]}>{formatPaise(product.sellPaise)}</Text>
          {product.mrpPaise > 0 && product.mrpPaise !== product.sellPaise && (
            <Text style={[styles.mrp, { color: c.textSecondary }]}>{formatPaise(product.mrpPaise)}</Text>
          )}
          {/* The unit CODE is not translated — it is the wire value and is
              printed on every invoice line. See `catalog/create.tsx`'s note. */}
          <Text style={[styles.unit, { color: c.textSecondary }]}>{t('catalog.card.perUnit', { unit: product.unit.toLowerCase() })}</Text>
        </View>
        {/* M20 — beyond the plan's catalogue items: view-only, hidden from customers. */}
        {product.viewOnly ? (
          <StatusBadge tone="warn" label={t('catalog.viewOnly.badge')} style={styles.viewOnly} testID={`view-only-${product._id}`} />
        ) : null}
      </View>

      <View style={styles.rightCol}>
        {!product.isActive && <StatusBadge tone="neutral" label={t('catalog.card.offSale')} />}
        {product.trackStock ? (
          <>
            <StatusBadge
              tone={outOfStock ? 'danger' : low ? 'warn' : 'success'}
              label={outOfStock
                ? t('catalog.card.outOfStock')
                : low
                  ? t('catalog.card.low', { qty: product.stockQty })
                  : t('catalog.card.inStock', { qty: product.stockQty })}
            />
            <StockBar qty={product.stockQty} lowAt={product.lowStockAt} max={product.maxStockQty} width={64} />
          </>
        ) : (
          <Text style={[styles.notTracked, { color: c.textSecondary }]}>{t('catalog.card.notTracked')}</Text>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: radii.card, borderWidth: 1,
    padding: 12, marginHorizontal: 16, marginVertical: 5, minHeight: 72,
  },
  thumb: { width: 52, height: 52, borderRadius: 14 },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  infoCol: { flex: 1, gap: 2, minWidth: 0 },
  name: { fontSize: 14.5, fontWeight: '600' },
  subline: { fontSize: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 6, marginTop: 2 },
  price: { fontSize: 14, fontWeight: '700' },
  mrp: { fontSize: 11.5, textDecorationLine: 'line-through' },
  unit: { fontSize: 11 },
  viewOnly: { alignSelf: 'flex-start', marginTop: 4 },
  rightCol: { alignItems: 'flex-end', gap: 6, maxWidth: '42%' },
  notTracked: { fontSize: 11, fontWeight: '600', textAlign: 'right' },
});

/**
 * UX-P (A ShopKhata catalogue / idea P5): the GRID tile of the same product —
 * image first (or a soft pastel block with the package mark when there is no
 * photo), name on up to two lines, price in Sora and the SAME stock pill and
 * rules as the list card (`isLowStock`), so the two views never disagree.
 */
const TILE_TINTS = ['green', 'amber', 'blue', 'violet', 'rose', 'sky'] as const;

export function ProductTile({ product, onPress, index = 0 }: { product: Product; onPress: () => void; index?: number }) {
  const { t } = useTranslation();
  const { c, ds, tints, shadow } = useAppTheme();
  const low = isLowStock(product);
  const outOfStock = product.trackStock && product.stockQty <= 0;
  const tint = tints[TILE_TINTS[index % TILE_TINTS.length]];
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.96}
      accessibilityRole="button"
      testID={`product-tile-${product._id}`}
      style={[tileStyles.tile, { backgroundColor: ds.surface, borderColor: ds.line }, shadow('card')]}
    >
      {product.images[0] ? (
        <Image source={{ uri: product.images[0] }} style={[tileStyles.photo, { backgroundColor: c.surfaceVariant }]} />
      ) : (
        <View style={[tileStyles.photo, tileStyles.placeholder, { backgroundColor: tint.from }]}>
          <MaterialCommunityIcons name="package-variant" size={26} color={tint.icon} />
        </View>
      )}
      <View style={tileStyles.body}>
        <Text style={[tileStyles.name, { color: ds.ink }]} numberOfLines={2}>{product.name}</Text>
        <Text style={[tileStyles.price, { color: ds.ink }]} numberOfLines={1}>{formatPaise(product.sellPaise)}</Text>
        <View style={tileStyles.pills}>
          {!product.isActive ? <StatusBadge tone="neutral" label={t('catalog.card.offSale')} /> : null}
          {product.trackStock ? (
            <StatusBadge
              tone={outOfStock ? 'danger' : low ? 'warn' : 'success'}
              label={outOfStock
                ? t('catalog.card.outOfStock')
                : low
                  ? t('catalog.card.low', { qty: product.stockQty })
                  : t('catalog.card.inStock', { qty: product.stockQty })}
            />
          ) : (
            <Text style={[tileStyles.notTracked, { color: ds.muted }]} numberOfLines={1}>{t('catalog.card.notTracked')}</Text>
          )}
          {product.viewOnly ? <StatusBadge tone="warn" label={t('catalog.viewOnly.badge')} /> : null}
        </View>
      </View>
    </PressableScale>
  );
}

const tileStyles = StyleSheet.create({
  tile: { flex: 1, borderRadius: radii.card, borderWidth: 1, overflow: 'hidden' },
  photo: { width: '100%', height: 84 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 10, gap: 4 },
  name: { fontSize: 13.5, fontWeight: '600', lineHeight: 18, minHeight: 36 },
  price: { fontFamily: fontFamily.sora700, fontSize: 15 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  notTracked: { fontSize: 11, fontWeight: '600' },
});
