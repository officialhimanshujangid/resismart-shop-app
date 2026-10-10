import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useAppTheme } from '../../../theme/useAppTheme';
import { useDrawProgress } from '../../../theme/motion';

/**
 * M22 — a session package at a glance: used (solid green) then held for a
 * booked visit (soft), on the DS track. Both draw in from the left on the UI
 * thread (scaleX only); reduce-motion shows the final bar at once. Light + dark
 * through the theme. Decorative — the row's own words say the numbers.
 */
export function SessionsBar({
  used, reserved = 0, total, style,
}: { used: number; reserved?: number; total: number; style?: StyleProp<ViewStyle> }) {
  const { ds } = useAppTheme();
  const safe = Math.max(1, total);
  const u = Math.min(1, Math.max(0, used / safe));
  const r = Math.min(1 - u, Math.max(0, reserved / safe));
  const p = useDrawProgress({ key: `${used}/${reserved}/${total}` });
  const usedStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value * u }] }));
  const heldStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value * (u + r) }] }));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.track, { backgroundColor: ds.track }, style]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: `${ds.primary}66` }, heldStyle]} />
      <Animated.View style={[styles.fill, { backgroundColor: ds.primary }, usedStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden', width: '100%' },
  // Full width, scaled from its left edge.
  fill: { ...StyleSheet.absoluteFillObject, borderRadius: 3, transformOrigin: 'left' },
});
