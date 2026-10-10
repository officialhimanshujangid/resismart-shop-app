import React from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { typeScale as T } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { useHindiTitleFace } from '../../theme/hindiFace';

type Props = TextProps & { style?: StyleProp<TextStyle>; color?: string; children: React.ReactNode };

/** Screen title — Sora 700, 20 (Noto Sans Devanagari Bold in Hindi). Wraps (Hindi never clipped). */
export function Title({ style, color, ...rest }: Props) {
  const { ds } = useAppTheme();
  const hi = useHindiTitleFace(T.title.fontSize);
  return <Text accessibilityRole="header" {...rest} style={[T.title, hi, { color: color ?? ds.ink }, style]} />;
}

/** Section heading — Sora 600, 16 (Noto Sans Devanagari Bold in Hindi). */
export function SectionTitle({ style, color, ...rest }: Props) {
  const { ds } = useAppTheme();
  const hi = useHindiTitleFace(T.section.fontSize);
  return <Text accessibilityRole="header" {...rest} style={[T.section, hi, { color: color ?? ds.ink }, style]} />;
}

/**
 * Money / big number in Sora. `size`: hero 30, amount 20, number 15.
 * Never truncated: a long rupee figure shrinks to fit on one line instead.
 */
export function Money({
  size = 'amount',
  style,
  color,
  ...rest
}: Props & { size?: 'hero' | 'amount' | 'number' }) {
  const { ds } = useAppTheme();
  const base = size === 'hero' ? T.money : size === 'number' ? T.number : T.amount;
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      {...rest}
      style={[base, { color: color ?? ds.ink }, style]}
    />
  );
}

/** Secondary detail text, 13/500 muted. */
export function Detail({ style, color, ...rest }: Props) {
  const { ds } = useAppTheme();
  return <Text {...rest} style={[T.detail, { color: color ?? ds.muted }, style]} />;
}
