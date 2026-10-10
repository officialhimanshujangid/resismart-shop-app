import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { radius, typeScale } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { easeOut, PressableScale, useMotionOK } from '../../theme/motion';

/**
 * The bottom action bar (DS v1 §4 "BottomActionBar", ShopBilling cart): the
 * amount on the left, ONE primary button on the right. Floats 20 px above the
 * bottom inset and slides up when `visible` turns true.
 *
 * The button label wraps (never clipped). Render it as a sibling of the
 * screen's scroll view and give the scroll content ~110 px bottom padding.
 */
export function BottomCartBar({
  caption,
  amountText,
  actionLabel,
  onAction,
  actionIcon,
  loading = false,
  disabled = false,
  visible = true,
  floating = true,
  testID,
  style,
}: {
  /** e.g. "3 items · Walk-in". */
  caption?: string;
  /** e.g. "₹341". */
  amountText: string;
  actionLabel: string;
  onAction: () => void;
  actionIcon?: string;
  loading?: boolean;
  disabled?: boolean;
  visible?: boolean;
  /** false → render in flow (no absolute positioning). */
  floating?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { ds, shadow, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const ok = useMotionOK();
  const y = useSharedValue(visible ? 0 : 1);

  useEffect(() => {
    const to = visible ? 0 : 1;
    y.value = ok ? withTiming(to, { duration: 700, easing: easeOut }) : to;
  }, [visible, ok, y]);

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value * 140 }],
    opacity: 1 - y.value,
  }));

  // Light: the template's deep-green bar. Dark: a raised navy bar so the green
  // button still stands out against it.
  const barBg = isDark ? ds.surfaceAlt : '#1E4636';
  const capColor = isDark ? ds.muted : '#9CC4AF';
  const amountColor = isDark ? ds.ink : '#FFFFFF';
  const off = disabled || loading;

  return (
    <Animated.View
      testID={testID}
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        floating ? [styles.floating, { bottom: 20 + insets.bottom }] : null,
        styles.bar,
        { backgroundColor: barBg, borderColor: isDark ? ds.line : 'transparent' },
        shadow('cart'),
        slide,
        style,
      ]}
    >
      <View style={styles.left}>
        {caption ? <Text style={[typeScale.caption, { color: capColor }]} numberOfLines={1}>{caption}</Text> : null}
        <Text style={[typeScale.amount, { color: amountColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {amountText}
        </Text>
      </View>
      <PressableScale
        onPress={onAction}
        disabled={off}
        haptic
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        accessibilityState={{ disabled: off, busy: loading }}
        style={[styles.action, { backgroundColor: ds.primaryFill }, off ? styles.off : null]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={ds.onPrimary} />
        ) : actionIcon ? (
          <MaterialCommunityIcons name={actionIcon as never} size={18} color={ds.onPrimary} />
        ) : null}
        <Text style={[styles.actionText, { color: ds.onPrimary }]}>{actionLabel}</Text>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  floating: { position: 'absolute', left: 16, right: 16 },
  bar: {
    minHeight: 70,
    borderRadius: 35,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 22,
    paddingRight: 10,
    paddingVertical: 10,
  },
  left: { flex: 1, minWidth: 0 },
  action: {
    minHeight: 50,
    maxWidth: '60%',
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexShrink: 1,
  },
  actionText: { fontSize: 15, fontWeight: '700', lineHeight: 20, textAlign: 'center', flexShrink: 1 },
  off: { opacity: 0.5 },
});
