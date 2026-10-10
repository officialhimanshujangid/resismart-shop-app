import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useAppTheme } from '../../../theme/useAppTheme';
import { useDrawProgress } from '../../../theme/motion';

/**
 * M20 — a small stock-level bar (DS v1 "stock bars fill"). It fills from the left
 * on the UI thread (scaleX, transform only) and appears full at once under
 * reduce-motion.
 *
 * Decorative: the number and "Running low / Out of stock" words beside it carry
 * the meaning, so it is hidden from screen readers.
 *
 * Scale: the max stock level when set, otherwise twice the low-stock level (so
 * "at the warning line" reads as half full). With neither there is nothing honest
 * to draw, and nothing is drawn.
 */
export function stockBarFraction(qty: number, lowAt?: number | null, max?: number | null): number | null {
  const scale = typeof max === 'number' && max > 0 ? max : typeof lowAt === 'number' && lowAt > 0 ? lowAt * 2 : null;
  if (scale === null || !Number.isFinite(qty)) return null;
  return Math.max(0, Math.min(1, qty / scale));
}

export function StockBar({
  qty, lowAt, max, width = 72, style,
}: { qty: number; lowAt?: number | null; max?: number | null; width?: number; style?: StyleProp<ViewStyle> }) {
  const { ds, status } = useAppTheme();
  const f = stockBarFraction(qty, lowAt, max);
  const p = useDrawProgress({ key: f });
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value * (f ?? 0) }] }));
  if (f === null) return null;
  const tone = qty <= 0 ? status.danger.fg : typeof lowAt === 'number' && qty <= lowAt ? status.warn.fg : status.success.fg;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.track, { width, backgroundColor: ds.track }, style]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: tone }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  // Full width, scaled from its left edge.
  fill: { height: '100%', width: '100%', borderRadius: 3, transformOrigin: 'left' },
});
