import React, { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { palette } from '../../constants/colors';
import { radius } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';

/**
 * DS v1 text field: label ABOVE the box (wraps, never floats over the value),
 * 52 px box with 16 px corners, a 1.5 px resting line that turns brand green
 * when focused and red with a message below on error.
 *
 * `AppInput` (the Paper field) stays for existing forms; new screens use this.
 */
export const TextField = forwardRef<TextInput, TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  leftIcon?: string;
  containerStyle?: StyleProp<ViewStyle>;
}>(function TextField({ label, error, hint, leftIcon, containerStyle, onFocus, onBlur, style, multiline, ...rest }, ref) {
  const { ds, status, isDark } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const line = error ? status.danger.fg : focused ? ds.primary : isDark ? palette.fieldLine.dark : palette.fieldLine.light;

  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={[styles.label, { color: error ? status.danger.fg : ds.ink }]}>{label}</Text>
      <View
        style={[
          styles.box,
          multiline ? styles.multi : null,
          { backgroundColor: ds.surface, borderColor: line, borderWidth: focused || error ? 2 : 1.5 },
        ]}
      >
        {leftIcon ? <MaterialCommunityIcons name={leftIcon as never} size={20} color={ds.muted} /> : null}
        <TextInput
          ref={ref}
          {...rest}
          multiline={multiline}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          placeholderTextColor={ds.faint}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: ds.ink }, style]}
        />
      </View>
      {error ? (
        <Text style={[styles.help, { color: status.danger.fg }]} accessibilityLiveRegion="polite">{error}</Text>
      ) : hint ? (
        <Text style={[styles.help, { color: ds.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
});

/**
 * Search pill (ShopBilling template): 52 high, fully round, search icon, and a
 * clear (×) button once there is text.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  autoFocus,
  testID,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  autoFocus?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const { ds, shadow } = useAppTheme();
  return (
    <View style={[styles.search, { backgroundColor: ds.surface }, shadow('raised'), style]}>
      <MaterialCommunityIcons name="magnify" size={21} color={ds.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? t('kit.search')}
        placeholderTextColor={ds.faint}
        accessibilityLabel={accessibilityLabel ?? placeholder ?? t('kit.search')}
        autoFocus={autoFocus}
        returnKeyType="search"
        testID={testID}
        style={[styles.searchInput, { color: ds.ink }]}
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={t('kit.clearSearch')}
          style={styles.clear}
        >
          <MaterialCommunityIcons name="close-circle" size={20} color={ds.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  box: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  multi: { alignItems: 'flex-start', paddingVertical: 10 },
  input: { flex: 1, fontSize: 15, paddingVertical: 12, minHeight: 44 },
  help: { fontSize: 12, lineHeight: 16 },
  search: {
    minHeight: 52,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 18,
    paddingRight: 6,
  },
  searchInput: { flex: 1, fontSize: 14, minHeight: 44, paddingVertical: 10 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
