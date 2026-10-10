import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/useAppTheme';
import { successHaptic, useMotionOK } from '../../theme/motion';
import { fontFamily, type StatusTone } from '../../theme/tokens';

/**
 * State-change feedback (DS v1 §5, audit rule 14: "success/error feedback
 * animates — check-mark, shake on invalid field"). UI thread, no loops, and
 * nothing moves under reduce-motion.
 */

/** A short horizontal shake (6 px, ≈ 0.3 s). Spread `style` on an `Animated.View`; call `shake()`. */
export function useShake() {
  const ok = useMotionOK();
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const shake = React.useCallback(() => {
    if (!ok) return;
    const d = 45;
    x.value = withSequence(
      withTiming(-6, { duration: d }),
      withTiming(6, { duration: d }),
      withTiming(-5, { duration: d }),
      withTiming(5, { duration: d }),
      withTiming(-2, { duration: d }),
      withTiming(0, { duration: d + 40, easing: Easing.out(Easing.quad) }),
    );
  }, [ok, x]);
  return { style, shake };
}

/**
 * A tick in a soft green circle that springs in. Decorative — the screen's own
 * words say what happened.
 */
export function SuccessCheck({ size = 56, testID, haptic = false }: { size?: number; testID?: string; /** UX-P: buzz once when it appears. */ haptic?: boolean }) {
  const { ds, status } = useAppTheme();
  const ok = useMotionOK();
  const s = useSharedValue(ok ? 0.6 : 1);
  const o = useSharedValue(ok ? 0 : 1);
  React.useEffect(() => {
    if (haptic) successHaptic();
    if (!ok) return;
    o.value = withTiming(1, { duration: 200 });
    s.value = withSpring(1, { damping: 12, stiffness: 240 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, o, s]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }] }));
  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.outer, { width: size, height: size, borderRadius: size / 2, backgroundColor: status.success.bg }, style]}
    >
      <View style={[styles.inner, { width: size * 0.7, height: size * 0.7, borderRadius: size * 0.35, backgroundColor: ds.primaryFill }]}>
        <MaterialCommunityIcons name="check-bold" size={size * 0.4} color={ds.onPrimary} />
      </View>
    </Animated.View>
  );
}

/**
 * UX-P kit — the C2 "stamp": a tilted, bordered word that thumps down onto a
 * card when its state changes ("ACCEPTED", "READY"). Scale 1.8 → 1 with a
 * small overshoot, UI thread; reduce-motion: it simply appears. Decorative —
 * the card's own status chip says the same thing to a screen reader.
 */
export function Stamp({ label, tone = 'success', testID }: { label: string; tone?: StatusTone; testID?: string }) {
  const { status, ds } = useAppTheme();
  const ok = useMotionOK();
  const s = useSharedValue(ok ? 1.8 : 1);
  const o = useSharedValue(ok ? 0 : 1);
  React.useEffect(() => {
    if (!ok) return;
    o.value = withTiming(1, { duration: 160 });
    s.value = withSequence(withTiming(0.92, { duration: 260, easing: Easing.out(Easing.cubic) }), withSpring(1, { damping: 10, stiffness: 260 }));
  }, [ok, o, s]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ rotate: '-12deg' }, { scale: s.value }] }));
  const ink = status[tone].fg;
  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.stamp, { borderColor: ink, backgroundColor: ds.surface }, style]}
    >
      <Text style={[styles.stampText, { color: ink }]} numberOfLines={1}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stamp: { borderWidth: 3, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'center' },
  stampText: { fontFamily: fontFamily.sora700, fontSize: 16, letterSpacing: 1.5, textTransform: 'uppercase' },
  outer: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  inner: { alignItems: 'center', justifyContent: 'center' },
});
