import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Text, Modal, Portal, Divider, Snackbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth, LoginResult } from '../../src/context/AuthContext';
import { ProfileInfo } from '../../src/api/auth.api';
import { AppButton } from '../../src/components/AppButton';
import { AppInput } from '../../src/components/AppInput';
import { AppLogo } from '../../src/components/AppLogo';
import { ContextPicker } from '../../src/components/ContextPicker';
import { LoadingOverlay } from '../../src/components/LoadingOverlay';
import { Colors } from '../../src/constants/colors';

const { height } = Dimensions.get('window');

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required').min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const { login, selectContext } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; error: boolean }>({
    visible: false,
    message: '',
    error: false,
  });

  const [contextModal, setContextModal] = useState(false);
  const [pendingProfiles, setPendingProfiles] = useState<ProfileInfo[]>([]);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const showSnack = (message: string, error = false) =>
    setSnackbar({ visible: true, message, error });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const result: LoginResult = await login(data.email, data.password);
      if (result.success) {
        router.replace('/(app)');
        return;
      }
      if (result.requiresContextSelection && result.profiles && result.userId) {
        setPendingProfiles(result.profiles);
        setPendingUserId(result.userId);
        setContextModal(true);
        return;
      }
      showSnack(result.error ?? 'Login failed. Please try again.', true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContextSelect = async (profile: ProfileInfo) => {
    if (!pendingUserId) return;
    setContextLoading(true);
    try {
      await selectContext(pendingUserId, profile.tenantId, profile.role);
      setContextModal(false);
      router.replace('/(app)');
    } catch (err: any) {
      showSnack(err?.response?.data?.error ?? 'Context selection failed.', true);
    } finally {
      setContextLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientEnd, Colors.gradientAccent]}
            locations={[0, 0.65, 1]}
            style={styles.gradient}
          >
            <View style={styles.heroContent}>
              <AppLogo size="large" showTagline />
            </View>
          </LinearGradient>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome Back</Text>
            <Text style={styles.cardSubtitle}>Sign in to your shop account</Text>

            <View style={styles.form}>
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

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <AppInput
                    label="Password"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.password?.message}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="password"
                    leftIcon="lock-outline"
                  />
                )}
              />

              <TouchableOpacity
                onPress={() => router.push('/(auth)/forgot-password')}
                style={styles.forgotLink}
                activeOpacity={0.7}
              >
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>

              <AppButton
                label="Sign In"
                onPress={handleSubmit(onSubmit)}
                loading={isLoading}
                icon="login"
                style={styles.signInButton}
              />
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Having trouble? Contact your shop administrator.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Portal>
        <Modal
          visible={contextModal}
          onDismiss={() => setContextModal(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>Select Your Profile</Text>
          <Text style={styles.modalSubtitle}>
            You have multiple profiles. Please select one to continue.
          </Text>
          <Divider style={styles.divider} />
          {contextLoading ? (
            <LoadingOverlay visible message="Selecting profile..." />
          ) : (
            <ContextPicker profiles={pendingProfiles} onSelect={handleContextSelect} />
          )}
        </Modal>
      </Portal>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={4000}
        style={snackbar.error ? styles.snackError : styles.snackSuccess}
        action={{ label: 'Dismiss', onPress: () => setSnackbar((s) => ({ ...s, visible: false })) }}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  gradient: { paddingTop: 40, paddingBottom: 40, justifyContent: 'center' },
  heroContent: { alignItems: 'center', paddingVertical: 16 },
  scrollContent: { flexGrow: 1 },
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 48,
    marginTop: -24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  cardTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 28 },
  form: { gap: 4 },
  forgotLink: { alignSelf: 'flex-end', marginTop: 4, marginBottom: 8, paddingVertical: 4 },
  forgotText: { color: Colors.primaryLight, fontWeight: '600', fontSize: 14 },
  signInButton: { marginTop: 8 },
  footer: { marginTop: 32, alignItems: 'center' },
  footerText: { fontSize: 12, color: Colors.textDisabled, textAlign: 'center' },
  modal: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    marginHorizontal: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  modalSubtitle: { fontSize: 14, color: Colors.textSecondary },
  divider: { marginVertical: 4 },
  snackError: { backgroundColor: Colors.error },
  snackSuccess: { backgroundColor: Colors.success },
});
