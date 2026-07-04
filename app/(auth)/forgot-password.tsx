import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Text, Snackbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { authApi } from '../../src/api/auth.api';
import { AppButton } from '../../src/components/AppButton';
import { AppInput } from '../../src/components/AppInput';
import { Colors } from '../../src/constants/colors';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; error: boolean }>({
    visible: false, message: '', error: false,
  });

  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const showSnack = (message: string, error = false) =>
    setSnackbar({ visible: true, message, error });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      await authApi.forgotPassword({ email: data.email });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.primary} />
            <Text style={styles.backText}>Back to Sign In</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="lock-reset" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>
              Enter your email and we'll send you a password reset link.
            </Text>
          </View>

          {submitted ? (
            <View style={styles.successCard}>
              <MaterialCommunityIcons name="email-check-outline" size={52} color={Colors.success} />
              <Text style={styles.successTitle}>Check Your Inbox</Text>
              <Text style={styles.successMessage}>
                We've sent a password reset link to{' '}
                <Text style={{ fontWeight: '700' }}>{getValues('email')}</Text>.{'\n\n'}
                The link will expire in 1 hour.
              </Text>
              <AppButton
                label="Return to Sign In"
                onPress={() => router.replace('/(auth)/login')}
                mode="outlined"
                style={styles.returnBtn}
              />
            </View>
          ) : (
            <View style={styles.formCard}>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <AppInput
                    label="Email Address"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.email?.message}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    leftIcon="email-outline"
                  />
                )}
              />
              <AppButton
                label="Send Reset Link"
                onPress={handleSubmit(onSubmit)}
                loading={isLoading}
                icon="send"
                style={styles.submitBtn}
              />
              <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.signInLink} activeOpacity={0.7}>
                <Text style={styles.signInText}>Remember your password? Sign In</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={5000}
        style={snackbar.error ? styles.snackError : styles.snackSuccess}
        action={{ label: 'OK', onPress: () => setSnackbar((s) => ({ ...s, visible: false })) }}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 16 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginBottom: 12 },
  backText: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  header: { alignItems: 'center', marginBottom: 32, gap: 16 },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.surfaceVariant, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 16 },
  formCard: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 24, gap: 8,
    elevation: 2, shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12,
  },
  submitBtn: { marginTop: 8 },
  signInLink: { alignItems: 'center', paddingVertical: 12 },
  signInText: { color: Colors.primaryLight, fontWeight: '600', fontSize: 14 },
  successCard: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 28, alignItems: 'center', gap: 16,
    elevation: 2, shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12,
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  successMessage: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  returnBtn: { marginTop: 8, width: '100%' },
  snackError: { backgroundColor: Colors.error },
  snackSuccess: { backgroundColor: Colors.success },
});
