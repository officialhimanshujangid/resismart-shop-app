import React from 'react';
import { StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';
import { Colors } from '../constants/colors';

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
  return (
    <Button
      mode={mode}
      onPress={onPress}
      disabled={disabled || loading}
      icon={loading ? undefined : icon}
      loading={loading}
      contentStyle={[styles.content, fullWidth && styles.fullWidth]}
      labelStyle={[styles.label, labelStyle]}
      style={[styles.button, mode === 'contained' && styles.containedButton, style]}
    >
      {label}
    </Button>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    marginVertical: 4,
  },
  containedButton: {
    elevation: 3,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  content: {
    paddingVertical: 6,
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
