import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { MIN_TOUCH, radius, typeScale } from '../../theme/tokens';
import { useAppTheme, type AppTheme } from '../../theme/useAppTheme';
import { PressableScale } from '../../theme/motion';

export type ButtonVariant = 'primary' | 'soft' | 'outline' | 'dangerOutline' | 'danger' | 'ink' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** md = 48 high (default); sm = 40 high with a 44 hit area. */
  size?: 'md' | 'sm';
  /** MaterialCommunityIcons name, drawn before the label. */
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the parent's width. Off by default (no stretched buttons). */
  fullWidth?: boolean;
  /** Light haptic on press. Defaults to on for `primary`. */
  haptic?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

function colorsFor(variant: ButtonVariant, th: AppTheme) {
  const { ds, status, isDark } = th;
  switch (variant) {
    case 'primary':
      return { bg: ds.primaryFill, fg: ds.onPrimary, border: 'transparent', shadow: true };
    case 'soft':
      return { bg: ds.primarySoft, fg: isDark ? status.brand.fg : ds.primaryDeep, border: 'transparent', shadow: false };
    case 'outline':
      return { bg: ds.surface, fg: ds.ink, border: ds.line, shadow: false };
    case 'dangerOutline':
      return { bg: ds.surface, fg: status.danger.fg, border: status.danger.fg, shadow: false };
    case 'danger':
      return { bg: status.danger.fg, fg: isDark ? '#1A0B10' : '#FFFFFF', border: 'transparent', shadow: false };
    case 'ink':
      return { bg: ds.inkButton, fg: ds.onInkButton, border: 'transparent', shadow: false };
    case 'ghost':
    default:
      return { bg: 'transparent', fg: isDark ? ds.primary : ds.primaryDeep, border: 'transparent', shadow: false };
  }
}

/**
 * The one button (DS v1 §4): fully round, solid fill, soft shadow, no glow.
 * One `primary` per screen. The label WRAPS — a long Hindi label grows the
 * button to two lines instead of being clipped or ellipsized.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  haptic,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const th = useAppTheme();
  const col = colorsFor(variant, th);
  const off = disabled || loading;
  const sm = size === 'sm';

  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      haptic={haptic ?? variant === 'primary'}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: loading }}
      hitSlop={sm ? (MIN_TOUCH - 40) / 2 : undefined}
      testID={testID}
      style={[
        styles.base,
        sm ? styles.sm : styles.md,
        {
          backgroundColor: col.bg,
          borderColor: col.border,
          borderWidth: col.border === 'transparent' ? 0 : 1.5,
        },
        col.shadow && !off ? th.shadow('button') : null,
        fullWidth ? styles.full : styles.hug,
        off ? styles.off : null,
        style,
      ]}
    >
      <View style={styles.inner}>
        {loading ? (
          <ActivityIndicator size="small" color={col.fg} />
        ) : icon ? (
          <MaterialCommunityIcons name={icon as never} size={sm ? 17 : 19} color={col.fg} />
        ) : null}
        <Text style={[typeScale.button, sm ? styles.smLabel : null, styles.label, { color: col.fg }]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, justifyContent: 'center' },
  md: { minHeight: 48, paddingHorizontal: 22, paddingVertical: 8 },
  sm: { minHeight: 40, paddingHorizontal: 16, paddingVertical: 6 },
  full: { alignSelf: 'stretch' },
  hug: { alignSelf: 'flex-start' },
  off: { opacity: 0.5 },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { textAlign: 'center', flexShrink: 1 },
  smLabel: { fontSize: 13, lineHeight: 17 },
});
