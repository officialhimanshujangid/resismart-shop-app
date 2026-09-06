import React, { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { TextInput, HelperText } from 'react-native-paper';
import { palette, themeColors, radii } from '../constants/colors';

/**
 * The one text field in the app, and the reason the signup form's focused state
 * looked broken.
 *
 * ── What was wrong ────────────────────────────────────────────────────────
 *
 * 1. FOCUS DID NOT SHOW. react-native-paper's `Outline` sets
 *    `borderWidth: hasActiveOutline ? 2 : 1` and then spreads the caller's
 *    `outlineStyle` OVER it. This component passed `borderWidth: 1.5`, so both
 *    states were pinned to 1.5 and a focused field was the same weight as a
 *    resting one. `outlineStyle` now carries the radius only, and Paper's own
 *    1 → 2 transition is what draws the focus.
 * 2. IT WAS HARDCODED LIGHT. `textColor="#000000"` and a module-level
 *    `backgroundColor: Colors.surface` meant black text in a white box on a
 *    device in dark mode. `constants/colors.ts` is explicit that anything which
 *    has to follow the system theme reads `themeColors(isDark)` at render — this
 *    now does.
 * 3. THE FLOATING LABEL SAT ON A WHITE TAB. Paper's `LabelBackground` paints the
 *    notch in the outline with the field's OWN background, taken from
 *    `style.backgroundColor`. A hardcoded white therefore followed the label up
 *    onto a dark outline. Field and notch now share one scheme-aware colour.
 * 4. THE RESTING OUTLINE WAS ALL BUT INVISIBLE. Paper falls back to
 *    `theme.colors.outline`, which is `Colors.border` — `brand[200]`, a 1.5:1
 *    tint meant for card edges, not for the boundary of something you type in.
 *    A field states an affordance, so it gets a deliberately stronger resting
 *    line than a card does.
 *
 * The three states are now genuinely distinct in both schemes: resting is a 1px
 * muted line, focused is a 2px `primary` line with a `primary` label, and error
 * is a 2px `error` line with an `error` label and a message beneath.
 */

interface AppInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: string;
  leftIcon?: string;
  disabled?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  style?: object;
}

export function AppInput({
  label,
  value,
  onChangeText,
  onBlur,
  error,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoComplete,
  leftIcon,
  disabled = false,
  multiline = false,
  numberOfLines,
  style,
}: AppInputProps) {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const [isSecureVisible, setIsSecureVisible] = useState(false);

  const restingOutline = isDark ? palette.fieldLine.dark : palette.fieldLine.light;
  const adornmentColor = error ? c.error : c.textSecondary;

  return (
    <View style={[styles.container, style]}>
      <TextInput
        label={label}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={c.textDisabled}
        secureTextEntry={secureTextEntry && !isSecureVisible}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete as never}
        disabled={disabled}
        multiline={multiline}
        numberOfLines={numberOfLines}
        mode="outlined"
        error={!!error}
        // Radius ONLY. A borderWidth here would override Paper's focus weight —
        // see note 1 in the header.
        outlineStyle={styles.outline}
        outlineColor={restingOutline}
        activeOutlineColor={c.primary}
        textColor={c.textPrimary}
        // Also the colour Paper paints the floating label's notch with.
        style={[styles.input, { backgroundColor: c.surface }]}
        left={leftIcon ? <TextInput.Icon icon={leftIcon} color={adornmentColor} /> : undefined}
        right={
          secureTextEntry ? (
            <TextInput.Icon
              icon={isSecureVisible ? 'eye-off' : 'eye'}
              onPress={() => setIsSecureVisible((v) => !v)}
              color={adornmentColor}
              accessibilityLabel={isSecureVisible ? 'Hide password' : 'Show password'}
            />
          ) : undefined
        }
      />
      {!!error && (
        <HelperText type="error" visible={!!error} style={styles.helperText}>
          {error}
        </HelperText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  input: {
    fontSize: 15,
  },
  outline: {
    borderRadius: radii.field,
  },
  helperText: {
    marginTop: -2,
    fontSize: 12,
  },
});
