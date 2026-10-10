/**
 * Motion helpers (DS v1 §5), built on react-native-reanimated so they run on the
 * UI thread. Every helper honours the phone's "reduce motion" setting:
 * Reanimated's `useReducedMotion()` (web: `prefers-reduced-motion`) → no
 * ambient loops, no rise, numbers and charts jump straight to their value.
 *
 *   <Rise index={n}>          — section rises 16 px + fades, 0.85 s, 0.10 s stagger
 *   <PressableScale>          — scale 0.97 (tiles 0.93) on press + optional light haptic
 *   useDrawProgress()         — 0→1 over 1.5 s, for chart lines / rings
 *   useCountUp(value)         — a number that counts up to `value`
 *   useAmbientLoop(ms)        — 0↔1 forever (clouds, sign sway); 0 when reduced
 *   useMotionOK()             — false when reduce-motion is on
 *
 * Lists stay virtualised; do not wrap every row in `Rise` — wrap sections.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { motion } from './tokens';

export const easeOut = Easing.bezier(...motion.bezier);

/** False when the phone asks for reduced motion. */
export function useMotionOK(): boolean {
  return !useReducedMotion();
}

/* ───────────────────────── Rise + stagger ───────────────────────── */

export function Rise({
  index = 0,
  distance = motion.rise.distance,
  duration = motion.rise.duration,
  style,
  children,
  testID,
}: {
  /** Position in the stagger; delay = index × 100 ms. */
  index?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID?: string;
}) {
  const ok = useMotionOK();
  const p = useSharedValue(ok ? 0 : 1);

  useEffect(() => {
    if (!ok) {
      p.value = 1;
      return;
    }
    p.value = withDelay(index * motion.rise.stagger, withTiming(1, { duration, easing: easeOut }));
  }, [ok, index, duration, p]);

  const animated = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * distance }],
  }));

  return (
    <Animated.View style={[style, animated]} testID={testID}>
      {children}
    </Animated.View>
  );
}

/* ───────────────────────── Press scale + haptic ───────────────────────── */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Light haptic tap. No-op on web and wherever the device has no engine. */
export function tapHaptic() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/**
 * UX-P (2026-10-10): the "it worked" buzz — a success notification pattern
 * (stronger than a tap) for a bill issued, a code scanned, a swipe action done.
 * No-op on web and on phones without an engine.
 */
export function successHaptic() {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

/** UX-P: a medium tick, for a swipe row crossing its "let go to act" point. */
export function thresholdHaptic() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** 0.97 for buttons (default), 0.93 for tiles. */
  scaleTo?: number;
  /** Light haptic on press — primary actions only (DS §5). */
  haptic?: boolean;
  children?: React.ReactNode;
};

export function PressableScale({
  scaleTo = motion.press.scale,
  haptic = false,
  style,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  children,
  ...rest
}: PressableScaleProps) {
  const ok = useMotionOK();
  const s = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (ok) s.value = withTiming(scaleTo, { duration: motion.press.duration, easing: easeOut });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (ok) s.value = withTiming(1, { duration: motion.press.duration, easing: easeOut });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) tapHaptic();
        onPress?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

/* ───────────────────────── Chart draw ───────────────────────── */

/** 0 → 1 over `duration` (1.5 s by default) after `delay`; 1 at once when reduced. */
export function useDrawProgress(
  { duration = motion.data.duration, delay = 0, key }: { duration?: number; delay?: number; key?: unknown } = {},
): SharedValue<number> {
  const ok = useMotionOK();
  const p = useSharedValue(ok ? 0 : 1);
  useEffect(() => {
    if (!ok) {
      p.value = 1;
      return;
    }
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration, easing: easeOut }));
    // `key` re-runs the draw when the data behind the chart changes.
  }, [ok, duration, delay, key, p]);
  return p;
}

/* ───────────────────────── Count-up ───────────────────────── */

/**
 * A number that counts from its previous value to `value`. Runs on the JS
 * thread with requestAnimationFrame — one number per card, ~70 frames, cheap —
 * so the caller formats it however it likes (₹, Hindi digits…).
 */
export function useCountUp(value: number, duration: number = motion.countUp.duration): number {
  const ok = useMotionOK();
  const [shown, setShown] = useState(ok ? 0 : value);
  const from = useRef(ok ? 0 : value);

  useEffect(() => {
    if (!ok || typeof requestAnimationFrame !== 'function') {
      from.current = value;
      setShown(value);
      return;
    }
    const start = Date.now();
    const begin = from.current;
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = begin + (value - begin) * eased;
      setShown(t >= 1 ? value : next);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, ok]);

  return shown;
}

/* ───────────────────────── Ambient loop ───────────────────────── */

/**
 * 0 ↔ 1 forever, `period` ms each way (clouds 9 s, sign 4 s…). Stays at 0 when
 * reduce-motion is on or `enabled` is false. Hero illustrations only.
 */
export function useAmbientLoop(period: number, { enabled = true, reverse = true } = {}): SharedValue<number> {
  const ok = useMotionOK() && enabled;
  const v = useSharedValue(0);
  useEffect(() => {
    if (!ok) {
      v.value = 0;
      return;
    }
    v.value = withRepeat(
      withTiming(1, { duration: period, easing: reverse ? Easing.inOut(Easing.sin) : Easing.linear }),
      -1,
      reverse,
    );
  }, [ok, period, reverse, v]);
  return v;
}
