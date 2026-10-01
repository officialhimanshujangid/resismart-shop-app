import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, View, useColorScheme } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { apiErrorCode, apiErrorMessage } from '../../../api/axios';
import { formatI18nDate } from '../../../i18n';
import { qk } from '../../../lib/queryKeys';
import { Card, Loading } from '../../more/ui';
import { Pill } from '../../owners/components/Pill';
import { societyInviteApi } from '../api';
import { DEAD_INVITE_CODES, INVITE_CODE_RE, isEmail } from '../logic';
import type { SocietyInviteAcceptResult, SocietyInviteOtpResult } from '../types';
import { SignInHandoff } from './SignInHandoff';

/**
 * Accept a society's invitation — CONTRACT-partner-P3 §7.2 / §11:
 * details → "Send code" (to the phone FROZEN on the invitation) → code + name +
 * email (only if the office gave none) + terms + "Lives here" consent → accepted
 * → the NORMAL phone-OTP sign-in (`SignInHandoff`). No session is minted here.
 *
 * Unknown, expired, withdrawn and already-accepted links all answer one
 * sentence (`SOCIETY_INVITE_NOT_FOUND`) — shown as it is, no oracle, no retry.
 */
export function SocietyInviteFlow({ token }: { token: string }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const preview = useQuery({ queryKey: qk.societyInvite(token), queryFn: () => societyInviteApi.preview(token) });

  const [sent, setSent] = useState<SocietyInviteOtpResult | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [terms, setTerms] = useState(false);
  const [badge, setBadge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A refusal after which this link is finished (used / withdrawn / society full). */
  const [dead, setDead] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<SocietyInviteAcceptResult | null>(null);
  const [tried, setTried] = useState(false);

  const onRefusal = (e: unknown, fallback: string) => {
    const msg = apiErrorMessage(e, fallback);
    if (DEAD_INVITE_CODES.has(apiErrorCode(e) ?? '')) setDead(msg);
    else setError(msg);
  };

  const sendCode = useMutation({
    mutationFn: () => societyInviteApi.sendCode(token),
    onMutate: () => setError(null),
    onSuccess: (r) => setSent(r),
    onError: (e) => onRefusal(e, t('society.invite.sendFailed')),
  });
  const accept = useMutation({
    mutationFn: () =>
      societyInviteApi.accept(token, {
        code, name, email: preview.data?.hasEmail ? undefined : email, acceptTerms: true, showLivesHereBadge: badge,
      }),
    onMutate: () => setError(null),
    onSuccess: (r) => setAccepted(r),
    onError: (e) => onRefusal(e, t('society.invite.acceptFailed')),
  });

  if (preview.isPending) return <Loading c={c} />;
  if (preview.isError) {
    const gone = DEAD_INVITE_CODES.has(apiErrorCode(preview.error) ?? '');
    return (
      <Card c={c} style={styles.center}>
        <MaterialCommunityIcons name="link-variant-off" size={40} color={c.textSecondary} />
        <Text style={[styles.title, styles.centerText, { color: c.textPrimary }]}>{t('society.invite.deadTitle')}</Text>
        <Text style={[styles.body, styles.centerText, { color: c.textSecondary }]} testID="invite-dead">
          {apiErrorMessage(preview.error, t('society.invite.loadFailed'))}
        </Text>
        {!gone ? (
          <Button mode="outlined" onPress={() => void preview.refetch()} style={styles.btn}>{t('common.tryAgain')}</Button>
        ) : null}
      </Card>
    );
  }

  const inv = preview.data;
  if (accepted) return <SignInHandoff result={accepted} />;

  const needEmail = !inv.hasEmail;
  const emailError = tried && needEmail && !isEmail(email) ? t('society.invite.emailInvalid') : undefined;
  const termsError = tried && !terms ? t('society.invite.termsNeeded') : undefined;
  const submit = () => {
    setTried(true);
    if (!INVITE_CODE_RE.test(code) || !terms || (needEmail && !isEmail(email))) return;
    accept.mutate();
  };
  const kindLabel = t(`society.invite.kind.${inv.kind}`, { defaultValue: String(inv.kind) });
  const society = inv.societyCity ? t('society.invite.societyCity', { society: inv.societyName, city: inv.societyCity }) : inv.societyName;

  return (
    <View style={styles.column}>
      <Card c={c}>
        <View style={styles.pills}>
          <Pill c={c} tone="brand" label={t('society.invite.pill')} />
          <Pill c={c} label={kindLabel} />
        </View>
        <Text style={[styles.title, { color: c.textPrimary }]}>
          {t('society.invite.head', { society: inv.societyName, business: inv.businessName })}
        </Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>{society}</Text>
        <Text style={[styles.body, { color: c.textPrimary }]}>{t('society.invite.explain')}</Text>
        <Text style={[styles.meta, { color: c.textSecondary }]}>
          {t('society.invite.forOperator', { name: inv.operatorName, phone: inv.phoneMasked })}
        </Text>
        <Text style={[styles.meta, { color: c.textSecondary }]}>
          {t('society.invite.expires', { date: formatI18nDate(inv.expiresAt, t) })}
        </Text>
      </Card>

      {dead ? (
        <Card c={c}>
          <Text style={[styles.body, { color: c.textPrimary }]} testID="invite-dead">{dead}</Text>
        </Card>
      ) : (
        <Card c={c}>
          <Text style={[styles.step, { color: c.textPrimary }]}>{t('society.invite.codeStepTitle')}</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            {sent
              ? sent.deliveredVia && ['whatsapp', 'sms', 'email'].includes(sent.deliveredVia)
                ? t('society.invite.codeSentVia', { phone: sent.phoneMasked, via: t(`owners.accept.via.${sent.deliveredVia}`) })
                : t('society.invite.codeSent', { phone: sent.phoneMasked })
              : t('society.invite.codeWillGo', { phone: inv.phoneMasked })}
          </Text>

          {sent ? (
            <>
              <AppInput
                label={t('society.invite.code')}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="numeric"
                autoCapitalize="none"
                error={tried && !INVITE_CODE_RE.test(code) ? t('society.invite.codeInvalid') : undefined}
              />
              <AppInput
                label={t('society.invite.yourName')}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                placeholder={inv.operatorName}
              />
              {needEmail ? (
                <View>
                  <AppInput
                    label={t('society.invite.email')}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    error={emailError}
                  />
                  <Text style={[styles.meta, { color: c.textSecondary }]}>{t('society.invite.emailHint')}</Text>
                </View>
              ) : null}

              {inv.hasFlat !== false ? (
                <View style={[styles.switchRow, { borderColor: c.border }]}>
                  <View style={styles.flex}>
                    <Text style={[styles.switchTitle, { color: c.textPrimary }]}>{t('society.invite.badge')}</Text>
                    <Text style={[styles.meta, { color: c.textSecondary }]}>{t('society.invite.badgeHint')}</Text>
                  </View>
                  <Switch
                    value={badge}
                    onValueChange={setBadge}
                    accessibilityLabel={t('society.invite.badge')}
                    trackColor={{ true: c.primary, false: c.border }}
                  />
                </View>
              ) : null}

              {/* A plain row rather than Checkbox.Item: the label wraps at 320dp
                  instead of being truncated, and the whole row is the target. */}
              <Pressable
                onPress={() => setTerms((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: terms }}
                style={styles.checkItem}
              >
                <MaterialCommunityIcons
                  name={terms ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={24}
                  color={terms ? c.primary : c.textSecondary}
                />
                <Text style={[styles.checkLabel, { color: c.textPrimary }]}>{t('society.invite.terms')}</Text>
              </Pressable>
              {termsError ? <Text style={[styles.error, { color: c.error }]}>{termsError}</Text> : null}
            </>
          ) : null}

          {error ? <Text style={[styles.error, { color: c.error }]} accessibilityLiveRegion="polite">{error}</Text> : null}

          <View style={styles.buttons}>
            {sent ? (
              <>
                <Button mode="contained" onPress={submit} loading={accept.isPending} disabled={accept.isPending} style={styles.btn}>
                  {t('society.invite.accept')}
                </Button>
                <Button mode="text" onPress={() => sendCode.mutate()} loading={sendCode.isPending} disabled={sendCode.isPending || accept.isPending}>
                  {t('society.invite.resendCode')}
                </Button>
              </>
            ) : (
              <Button
                mode="contained"
                icon="message-lock-outline"
                onPress={() => sendCode.mutate()}
                loading={sendCode.isPending}
                disabled={sendCode.isPending}
                style={styles.btn}
              >
                {t('society.invite.sendCode')}
              </Button>
            )}
          </View>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  center: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  centerText: { textAlign: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 17, fontWeight: '700' },
  step: { fontSize: 15, fontWeight: '600' },
  body: { fontSize: 13, lineHeight: 19 },
  meta: { fontSize: 12, lineHeight: 17 },
  error: { fontSize: 12.5, lineHeight: 18, borderRadius: radii.xs },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  switchTitle: { fontSize: 14, fontWeight: '600' },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, minHeight: 44 },
  checkLabel: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  btn: { borderRadius: 12 },
});
