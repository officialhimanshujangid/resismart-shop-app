import React from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { useCountUp } from '../../theme/motion';

/**
 * UX-P kit — a number that counts up to `value` (DS §5 "numbers count up").
 * Its own tiny component so only THIS text re-renders per frame, never the
 * screen around it. `format` turns the in-between value into text (₹, counts,
 * Hindi digits…); the screen-reader label is always the FINAL value, so a
 * reader never hears a half-way number. Reduce-motion: the final value at once.
 */
export function CountUp({
  value,
  format,
  style,
  duration,
  testID,
  ...rest
}: Omit<TextProps, 'children'> & {
  value: number;
  format: (n: number) => string;
  style?: StyleProp<TextStyle>;
  duration?: number;
  testID?: string;
}) {
  const shown = useCountUp(value, duration);
  return (
    <Text {...rest} style={style} testID={testID} accessibilityLabel={rest.accessibilityLabel ?? format(value)}>
      {format(shown === value ? value : Math.round(shown))}
    </Text>
  );
}
