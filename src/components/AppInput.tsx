import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextInput, HelperText } from 'react-native-paper';
import { Colors } from '../constants/colors';

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
  const [isSecureVisible, setIsSecureVisible] = useState(false);

  return (
    <View style={[styles.container, style]}>
      <TextInput
        label={label}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry && !isSecureVisible}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete as any}
        disabled={disabled}
        multiline={multiline}
        numberOfLines={numberOfLines}
        mode="outlined"
        error={!!error}
        outlineStyle={styles.outline}
        style={styles.input}
        textColor="#000000"
        left={leftIcon ? <TextInput.Icon icon={leftIcon} color={Colors.textSecondary} /> : undefined}
        right={
          secureTextEntry ? (
            <TextInput.Icon
              icon={isSecureVisible ? 'eye-off' : 'eye'}
              onPress={() => setIsSecureVisible((v) => !v)}
              color={Colors.textSecondary}
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
    backgroundColor: Colors.surface,
    fontSize: 15,
  },
  outline: {
    borderRadius: 12,
    borderWidth: 1.5,
  },
  helperText: {
    marginTop: -2,
    fontSize: 12,
  },
});
