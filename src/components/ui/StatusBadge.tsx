import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { radius, type StatusTone } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAmbientLoop } from '../../theme/motion';

/**
 * Status pill (DS v1 §1 status pairs): text on its soft ground. `live` adds a
 * pulsing dot ("New order"); the pulse stops under reduce-motion.
 */
export function StatusBadge({
  label,
  tone = 'neutral',
  live = false,
  testID,
  style,
}: {
  label: string;
  tone?: StatusTone;
  live?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { status } = useAppTheme();
  const pair = status[tone];
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: pair.bg }, style]}>
      {live ? <LiveDot color={pair.fg} /> : null}
      <Text style={[styles.text, { color: pair.fg }]}>{label}</Text>
    </View>
  );
}

export function LiveDot({ color, size = 6 }: { color: string; size?: number }) {
  const v = useAmbientLoop(900);
  const halo = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - v.value), transform: [{ scale: 1 + v.value * 1.6 }] }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: color }, halo]}
        pointerEvents="none"
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  text: { fontSize: 11, fontWeight: '700', lineHeight: 14 },
});
