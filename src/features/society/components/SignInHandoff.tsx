import React, { useState } from 'react';
import { Alert, StyleSheet, View, useColorScheme } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { LoadingOverlay } from '../../../components/LoadingOverlay';
import { useAuth } from '../../../context/AuthContext';
import { Card } from '../../more/ui';
import { loginPhone, phoneMatchesMask } from '../logic';
import type { SocietyInviteAcceptResult } from '../types';

/**
 * After a society invitation is accepted — contract §0.2: "returns
 * `{ partnerId, slug, partnerName, loginPhoneMasked }`; the app then runs the
 * NORMAL phone-OTP sign-in pre-filled". There is no second session-minting door.
 *
 * The server only ever shows the phone MASKED, so "pre-filled" is the mask as a
 * hint plus a check that the number typed ends in the same digits — then the
 * ordinary `/auth/login/otp/request` → `verify-otp` screen, with the same params
 * the login screen hands it.
 *
 * Somebody already signed in on this phone (the operator was a partner before)
 * is switched straight into the new business instead.
 */
export function SignInHandoff({ result }: { result: SocietyInviteAcceptResult }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { isAuthenticated, switchToContext, requestLoginOtp } = useAuth();
  const [phone, setPhone] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = phoneMatchesMask(phone, result.loginPhoneMasked);

  const openBusiness = async () => {
    setOpening(true);
    try {
      await switchToContext(`partner:${result.partnerId}`);
      router.replace('/(app)/(tabs)');
    } catch (e) {
      Alert.alert(t('owners.accept.openFailedTitle'), e instanceof Error ? e.message : t('owners.accept.openFailedBody'));
    } finally {
      setOpening(false);
    }
  };

  const sendSignInCode = async () => {
    setTried(true);
    if (!matches || sending) return;
    setSending(true);
    setError(null);
    try {
      const to = loginPhone(phone);
      const r = await requestLoginOtp(to);
      if (!r.success || !r.delivery) {
        setError(r.error ?? t('auth.login.codeFailed'));
        return;
      }
      const { message, deliveredVia, alternatives, whatsappAvailable } = r.delivery;
      router.push({
        pathname: '/(auth)/verify-otp',
        params: {
          identifier: to,
          message,
          deliveredVia,
          alternatives: alternatives.join(','),
          whatsappAvailable: whatsappAvailable ? '1' : '0',
        },
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card c={c} style={styles.card}>
      <View style={styles.center}>
        <MaterialCommunityIcons name="check-decagram" size={40} color={c.success} />
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('society.invite.doneTitle', { business: result.partnerName })}</Text>
      </View>

      {isAuthenticated ? (
        <>
          <Text style={[styles.body, { color: c.textSecondary }]}>{t('society.invite.doneSignedIn')}</Text>
          <Button mode="contained" onPress={() => void openBusiness()} style={styles.btn}>
            {t('owners.accept.openBusiness')}
          </Button>
        </>
      ) : (
        <>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            {t('society.invite.doneBody', { phone: result.loginPhoneMasked })}
          </Text>
          <AppInput
            label={t('society.invite.phoneLabel')}
            value={phone}
            onChangeText={(v) => setPhone(v.replace(/[^\d+\s]/g, '').slice(0, 16))}
            keyboardType="phone-pad"
            autoCapitalize="none"
            placeholder={result.loginPhoneMasked}
            error={tried && !matches ? t('society.invite.phoneMismatch', { phone: result.loginPhoneMasked }) : undefined}
          />
          {error ? <Text style={[styles.error, { color: c.error }]} accessibilityLiveRegion="polite">{error}</Text> : null}
          <View style={styles.buttons}>
            <Button mode="contained" icon="message-lock-outline" onPress={() => void sendSignInCode()} loading={sending} disabled={sending} style={styles.btn}>
              {t('society.invite.sendSignInCode')}
            </Button>
            <Button mode="text" onPress={() => router.replace('/(auth)/login')}>
              {t('society.invite.otherWay')}
            </Button>
          </View>
        </>
      )}
      <LoadingOverlay visible={opening} message={t('owners.accept.opening')} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  center: { alignItems: 'center', gap: 10, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 13, lineHeight: 19 },
  error: { fontSize: 12.5, lineHeight: 18 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  btn: { borderRadius: 12, alignSelf: 'flex-start' },
});
