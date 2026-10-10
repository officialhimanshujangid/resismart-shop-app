import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';

import { useMotionOK } from '../../theme/motion';

/**
 * UX-P kit — the scanner frame's sweeping line (C10 "scan shelf to count").
 * Fills its parent (absolute) and glides top ↔ bottom on the UI thread
 * (translateY only). `active=false` parks it; reduce-motion parks it in the
 * middle as a static guide line. Decorative — hidden from screen readers.
 *
 * Camera chrome, so the colour is passed in (always drawn over a live feed or
 * the dark hero, never over the themed page).
 */
export function ScanLine({
  color = '#7CF0B0',
  active = true,
  inset = 10,
  period = 1200,
  style,
  testID,
}: {
  color?: string;
  active?: boolean;
  /** Gap kept from the frame's edges. */
  inset?: number;
  /** One sweep, ms. */
  period?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const ok = useMotionOK();
  const [h, setH] = React.useState(0);
  const p = useSharedValue(0.5);

  React.useEffect(() => {
    if (!ok || !active || h <= 0) {
      cancelAnimation(p);
      p.value = 0.5;
      return;
    }
    p.value = 0;
    p.value = withRepeat(withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(p);
  }, [ok, active, h, period, p]);

  const travel = Math.max(0, h - inset * 2 - 2);
  const line = useAnimatedStyle(() => ({ transform: [{ translateY: inset + p.value * travel }] }));

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      style={[StyleSheet.absoluteFill, style]}
      testID={testID}
    >
      {h > 0 ? (
        <Animated.View
          style={[
            styles.line,
            { left: inset, right: inset, backgroundColor: color, boxShadow: `0px 0px 10px ${color}` },
            line,
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { position: 'absolute', top: 0, height: 2, borderRadius: 1 },
});
