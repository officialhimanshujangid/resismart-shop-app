import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { MIN_TOUCH, radius, typeScale } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { PressableScale } from '../../theme/motion';
import { ArtBackdrop, ProductArt, type ProductArtKind } from '../illustrations/ProductArt';

/**
 * Product card (ShopBilling template): picture (photo, or placeholder art in a
 * soft radial backdrop), name, category, Sora price, and either a round "+"
 * (qty 0) or a − n + stepper. A card with qty > 0 gets a 2 px brand outline.
 *
 * Two per row at 360 px (`ProductGrid`). Name wraps to two lines.
 */
export function ProductCard({
  name,
  subtitle,
  priceText,
  imageUri,
  art = 'box',
  stockBadge,
  qty = 0,
  onAdd,
  onRemove,
  onPress,
  bob = false,
  testID,
  style,
}: {
  name: string;
  subtitle?: string;
  /** Formatted price, e.g. "₹28". */
  priceText: string;
  /** A real product photo; falls back to `art`. */
  imageUri?: string;
  art?: ProductArtKind;
  /** e.g. "4 left" — shown as a warm pill over the picture. */
  stockBadge?: string;
  qty?: number;
  onAdd?: () => void;
  onRemove?: () => void;
  onPress?: () => void;
  bob?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const { ds, shadow, status } = useAppTheme();
  const selected = qty > 0;

  const body = (
    <>
      <View style={styles.pic}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : (
          <>
            <ArtBackdrop kind={art} />
            <ProductArt kind={art} size={84} bob={bob} />
          </>
        )}
        {stockBadge ? (
          <View style={[styles.stock, { backgroundColor: status.warn.bg }]}>
            <Text style={[styles.stockText, { color: status.warn.fg }]}>{stockBadge}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.text}>
        <Text style={[styles.name, { color: ds.ink }]} numberOfLines={2}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={[typeScale.caption, { color: ds.muted, fontWeight: '500' }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.foot}>
        <Text style={[typeScale.number, styles.price, { color: ds.ink }]}>{priceText}</Text>
        {selected ? (
          <QtyStepper qty={qty} onAdd={onAdd} onRemove={onRemove} />
        ) : onAdd ? (
          <PressableScale
            onPress={onAdd}
            haptic
            accessibilityRole="button"
            accessibilityLabel={t('kit.addItem', { name })}
            hitSlop={(MIN_TOUCH - 38) / 2}
            style={[styles.plus, { backgroundColor: ds.inkButton }]}
          >
            <Text style={[styles.plusText, { color: ds.onInkButton }]}>+</Text>
          </PressableScale>
        ) : null}
      </View>
    </>
  );

  const cardStyle = [
    styles.card,
    { backgroundColor: ds.surface },
    shadow('raised'),
    selected ? { borderColor: ds.primary } : { borderColor: 'transparent' },
    style,
  ];

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name}, ${priceText}`} testID={testID} style={cardStyle}>
        {body}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={cardStyle}>
      {body}
    </View>
  );
}

/** − qty + in a soft pill. Each button is 30 px with a 44 px hit area. */
export function QtyStepper({ qty, onAdd, onRemove }: { qty: number; onAdd?: () => void; onRemove?: () => void }) {
  const { t } = useTranslation();
  const { ds, status, isDark } = useAppTheme();
  const slop = (MIN_TOUCH - 30) / 2;
  return (
    <View style={[styles.stepper, { backgroundColor: ds.primarySoft }]} accessibilityLabel={t('kit.quantity', { count: qty })}>
      <PressableScale
        onPress={onRemove}
        hitSlop={slop}
        accessibilityRole="button"
        accessibilityLabel={t('kit.removeOne')}
        style={[styles.stepBtn, { backgroundColor: ds.surface }]}
      >
        <Text style={[styles.stepText, { color: ds.primary }]}>−</Text>
      </PressableScale>
      <Text style={[typeScale.number, styles.qty, { color: isDark ? status.brand.fg : ds.primaryDeep }]}>{qty}</Text>
      <PressableScale
        onPress={onAdd}
        haptic
        hitSlop={slop}
        accessibilityRole="button"
        accessibilityLabel={t('kit.addOne')}
        style={[styles.stepBtn, { backgroundColor: ds.primaryFill }]}
      >
        <Text style={[styles.stepText, { color: ds.onPrimary }]}>+</Text>
      </PressableScale>
    </View>
  );
}

/** Two equal columns of product cards. */
export function ProductGrid({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children);
  return (
    <View style={[styles.grid, style]}>
      {items.map((child, i) => (
        <View key={i} style={styles.cell}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 26, padding: 10, gap: 8, borderWidth: 2 },
  pic: { height: 112, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  stock: { position: 'absolute', left: 8, top: 8, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  stockText: { fontSize: 10, fontWeight: '800' },
  text: { paddingHorizontal: 4, gap: 1 },
  name: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4, gap: 6 },
  price: { fontSize: 16, flexShrink: 1 },
  plus: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  plusText: { fontSize: 20, lineHeight: 22, fontWeight: '500' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, padding: 3 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 16, fontWeight: '800', lineHeight: 18 },
  qty: { fontSize: 14, minWidth: 14, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 12 },
  cell: { width: '50%', paddingHorizontal: 6 },
});
