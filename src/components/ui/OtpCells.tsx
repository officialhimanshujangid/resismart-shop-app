import React, { forwardRef, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';

import { radius, typeScale } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { useMotionOK } from '../../theme/motion';
import { useShake } from './Feedback';

export type OtpCellsState = 'idle' | 'error' | 'success';

/**
 * Code boxes for a one-time code (DS v1 §4 Input; 1R: animated focus, shake on
 * error, success tint).
 *
 * ONE real input lies invisibly over the boxes, not six inputs: six inputs
 * have to hand focus along on every key and backspace, and they fight the OS
 * autofill that reads the code out of the SMS. A tap anywhere on the boxes is
 * a tap on that input. Value, handler and input props are the caller's.
 *
 *  - focus: the next box lifts (scale 1.05) and turns green;
 *  - a typed digit pops in;
 *  - `state="error"` → red edges, and a new `shakeKey` shakes the row once;
 *  - `state="success"` → green boxes.
 */
export const OtpCells = forwardRef<TextInput, {
  value: string;
  onChangeText: (v: string) => void;
  length?: number;
  state?: OtpCellsState;
  shakeKey?: number;
  autoFocus?: boolean;
  editable?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText'>;
}>(function OtpCells(
  { value, onChangeText, length = 6, state = 'idle', shakeKey = 0, autoFocus, editable = true, accessibilityLabel, testID, inputProps },
  ref,
) {
  const [focused, setFocused] = useState(!!autoFocus);
  const shake = useShake();
  const { shake: runShake } = shake;
  useEffect(() => {
    if (shakeKey > 0) runShake();
  }, [shakeKey, runShake]);

  const active = Math.min(value.length, length - 1);
  return (
    <Animated.View style={[styles.wrap, shake.style]} testID={testID}>
      <View style={styles.row} pointerEvents="none">
        {Array.from({ length }, (_, i) => (
          <Cell
            key={i}
            index={i}
            digit={value[i] ?? ''}
            active={focused && editable && i === active && value.length < length}
            state={state}
          />
        ))}
      </View>
      <TextInput
        ref={ref}
        {...inputProps}
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        editable={editable}
        caretHidden
        contextMenuHidden
        accessibilityLabel={accessibilityLabel}
        onFocus={(e) => { setFocused(true); inputProps?.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); inputProps?.onBlur?.(e); }}
        style={[StyleSheet.absoluteFill, styles.input]}
      />
    </Animated.View>
  );
});

function Cell({ index, digit, active, state }: { index: number; digit: string; active: boolean; state: OtpCellsState }) {
  const { ds, status } = useAppTheme();
  const ok = useMotionOK();
  const lift = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    lift.value = ok ? withTiming(active ? 1 : 0, { duration: 140 }) : active ? 1 : 0;
  }, [active, ok, lift]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + lift.value * 0.05 }] }));

  const edge = state === 'error' ? status.danger.fg
    : state === 'success' ? status.success.fg
      : active ? ds.primary : digit ? ds.primaryDeep : ds.line;
  const ground = state === 'error' ? status.danger.bg
    : state === 'success' ? status.success.bg
      : active ? ds.primarySoft : ds.surface;

  return (
    <Animated.View
      style={[styles.cell, { borderColor: edge, backgroundColor: ground, borderWidth: active || state !== 'idle' ? 2 : 1.5 }, style]}
    >
      {digit ? (
        <Animated.Text key={`${index}-${digit}`} entering={ok ? ZoomIn.duration(150) : undefined} style={[styles.digit, { color: ds.ink }]}>
          {digit}
        </Animated.Text>
      ) : (
        <Text style={[styles.dot, { color: ds.faint }]}>{active ? '' : '·'}</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', marginVertical: 6 },
  row: { flexDirection: 'row', gap: 8 },
  // `minHeight`, so a digit at a large system font scale grows the box instead of clipping.
  cell: { flex: 1, minHeight: 58, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  digit: { ...typeScale.amount, fontSize: 24 },
  dot: { fontSize: 24, lineHeight: 28, fontWeight: '700' },
  input: { color: 'transparent', backgroundColor: 'transparent', fontSize: 1, opacity: 0.02 },
});
