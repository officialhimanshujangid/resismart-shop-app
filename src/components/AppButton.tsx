import React from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { Button } from 'react-native-paper';
import { palette, themeColors } from '../constants/colors';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  mode?: 'contained' | 'outlined' | 'text';
  icon?: string;
  style?: object;
  labelStyle?: object;
  fullWidth?: boolean;
}

export function AppButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  mode = 'contained',
  icon,
  style,
  labelStyle,
  fullWidth = true,
}: AppButtonProps) {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const isOff = disabled || loading;

  /**
   * The outlined border, drawn HERE rather than left to the theme.
   *
   * Paper takes an outlined Button's border from `theme.colors.outline`, which
   * `constants/theme.ts` sets to `Colors.border` — `brand[200]`, a 1.5:1 tint
   * on white. That is right for a card hairline and far too faint for the edge
   * of something you are meant to press: "Continue with Google" and "Attach a
   * photo" were sitting on a border most people cannot see. `AppInput` already
   * makes exactly this override for exactly this reason; `palette.fieldLine` is
   * the token it uses, documented as the resting outline of a tappable control
   * and measured to clear 3:1 against its own surface in both schemes.
   *
   * Deliberately NEUTRAL rather than `primary`: an outlined button here is the
   * secondary action beside a contained one, and one of them (`staff/roles.tsx`
   * → "Delete role") carries a red label that a brand-green ring would fight.
   *
   * Scoped to this component on purpose. Raising `theme.colors.outline` itself
   * would fix the raw `<Button mode="outlined">` call sites too — see the report
   * for that phase; it reaches Paper's Chips, outlined Cards and TextInputs
   * app-wide and is a change that wants its own pass.
   */
  const outlineColor = isOff ? c.textDisabled : isDark ? palette.fieldLine.dark : palette.fieldLine.light;

  return (
    <Button
      mode={mode}
      onPress={onPress}
      disabled={isOff}
      icon={loading ? undefined : icon}
      loading={loading}
      accessibilityLabel={label}
      contentStyle={[styles.content, fullWidth && styles.fullWidth]}
      labelStyle={[styles.label, labelStyle]}
      style={[
        styles.button,
        mode === 'contained' && styles.containedButton,
        mode === 'outlined' && { borderColor: outlineColor },
        style,
      ]}
    >
      {label}
    </Button>
  );
}

// D0 (Design System v1): fully round, solid fill, soft brand shadow — no glow
// (`0 6px 14px rgba(primary,.22)` max). Min height 48. The label may wrap so a
// long Hindi label is never clipped. New screens use `components/ui/Button`.
const styles = StyleSheet.create({
  button: {
    borderRadius: 999,
    marginVertical: 4,
  },
  containedButton: {
    boxShadow: '0px 6px 14px rgba(46, 156, 104, 0.22)',
  },
  content: {
    minHeight: 48,
    paddingVertical: 4,
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
