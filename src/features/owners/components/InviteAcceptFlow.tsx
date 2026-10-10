import React, { useState } from 'react';
import { Alert, StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
// M19 redesign: kit buttons (haptic primary), animated success check, error shake, rise.
import { Button, SuccessCheck, useShake } from '../../../components/ui';
import { Rise } from '../../../theme/motion';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { apiErrorMessage } from '../../../api/axios';
import { formatI18nDate } from '../../../i18n';
import { qk } from '../../../lib/queryKeys';
import { Card, ErrorBlock, Loading } from '../../more/ui';
import { ownersApi } from '../api';
import { shownStatus } from '../logic';
import type { AcceptResult, InviteAddress, SendCodeResult } from '../types';
import { Pill } from './Pill';

const CODE_RE = /^\d{4,8}$/;

/**
 * Accept an owner invitation — CONTRACT-partner-P0 §2.3 / §6.2. The same flow
 * for the link (`{ token }`, no sign-in) and the in-app card (`{ id }`, signed
 * in): preview → "Send code" → enter the code → success → sign in / open.
 *
 * The code goes to the phone/email FROZEN on the invitation — whoever holds the
 * link still needs that phone or inbox.
 */
export function InviteAcceptFlow({
  address, onAccepted, onFinished, finishLabel,
}: {
  address: InviteAddress;
  /** Called once the server has accepted — the screen decides what "open it" means. */
  onAccepted?: (result: AcceptResult) => void;
  /** The success button: open the business (signed in) or go to sign-in. */
  onFinished: (result: AcceptResult) => void;
  finishLabel: string;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const key = 'token' in address ? `t:${address.token}` : `i:${address.id}`;
  const preview = useQuery({ queryKey: qk.owners.preview(key), queryFn: () => ownersApi.preview(address) });

  const [sent, setSent] = useState<SendCodeResult | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<AcceptResult | null>(null);
  const [declined, setDeclined] = useState(false);

  const sendCode = useMutation({
    mutationFn: () => ownersApi.sendCode(address),
    onMutate: () => setError(null),
    onSuccess: (r) => setSent(r),
    onError: (e) => setError(apiErrorMessage(e, t('owners.accept.sendFailed'))),
  });
  const accept = useMutation({
    mutationFn: () => ownersApi.accept(address, { code, name: name || undefined }),
    onMutate: () => setError(null),
    onSuccess: (r) => {
      setAccepted(r);
      onAccepted?.(r);
    },
    onError: (e) => setError(apiErrorMessage(e, t('owners.accept.acceptFailed'))),
  });
  const { style: shakeStyle, shake } = useShake();
  React.useEffect(() => { if (error) shake(); }, [error, shake]);

  const decline = useMutation({
    mutationFn: () => ownersApi.decline(address),
    onSuccess: () => setDeclined(true),
    onError: (e) => setError(apiErrorMessage(e, t('owners.accept.declineFailed'))),
  });

  if (preview.isPending) return <Loading c={c} skeleton={2} />;
  if (preview.isError) {
    return <ErrorBlock c={c} message={apiErrorMessage(preview.error, t('owners.accept.loadFailed'))} onRetry={() => void preview.refetch()} />;
  }
  const inv = preview.data;
  const business = inv.partner?.name ?? t('more.yourBusiness');
  const isTransfer = inv.kind === 'TRANSFER';

  if (accepted) {
    return (
      <Card c={c} style={styles.center}>
        <SuccessCheck size={64} />
        <Text style={[styles.title, { color: c.textPrimary }]}>
          {isTransfer ? t('owners.accept.doneTransfer', { business: accepted.partnerName }) : t('owners.accept.doneCoOwner', { business: accepted.partnerName })}
        </Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>{t('owners.accept.doneBody')}</Text>
        <Button label={finishLabel} onPress={() => onFinished(accepted)} style={styles.center1} />
      </Card>
    );
  }
  if (declined) {
    return (
      <Card c={c} style={styles.center}>
        <MaterialCommunityIcons name="close-circle-outline" size={40} color={c.textSecondary} />
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('owners.accept.declinedTitle')}</Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>{t('owners.accept.declinedBody', { name: inv.invitedByName })}</Text>
      </Card>
    );
  }

  const status = shownStatus(inv);
  const live = status === 'PENDING' && inv.partner?.status !== 'ARCHIVED';

  const confirmDecline = () =>
    Alert.alert(t('owners.accept.declineTitle'), t('owners.accept.declineBody', { business }), [
      { text: t('common.notNow'), style: 'cancel' },
      { text: t('owners.accept.decline'), style: 'destructive', onPress: () => decline.mutate() },
    ]);

  return (
    <View style={styles.column}>
      <Rise index={0}>
      <Card c={c}>
        <View style={styles.pills}>
          <Pill c={c} tone={isTransfer ? 'bad' : 'brand'} label={t(`owners.kind.${inv.kind}`, { defaultValue: inv.kind })} />
          {status !== 'PENDING' ? <Pill c={c} label={t(`owners.status.${status}`, { defaultValue: status })} /> : null}
        </View>
        <Text style={[styles.title, { color: c.textPrimary }]}>
          {isTransfer ? t('owners.accept.headTransfer', { business }) : t('owners.accept.headCoOwner', { business })}
        </Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>
          {t('owners.accept.from', { name: inv.invitedByName, to: inv.toName })}
        </Text>
        {inv.note ? <Text style={[styles.note, { color: c.textSecondary }]}>“{inv.note}”</Text> : null}
        {isTransfer ? (
          <Text style={[styles.body, { color: c.textPrimary }]}>{t('owners.accept.transferExplain')}</Text>
        ) : null}
        <Text style={[styles.meta, { color: c.textSecondary }]}>
          {t('owners.expires', { date: formatI18nDate(inv.expiresAt, t) })}
        </Text>
      </Card>
      </Rise>

      <Rise index={1}>
      {!live ? (
        <Card c={c}>
          <Text style={[styles.body, { color: c.textPrimary }]}>
            {inv.partner?.status === 'ARCHIVED'
              ? t('errors.PARTNER_ARCHIVED')
              : status === 'EXPIRED'
                ? t('errors.PARTNER_INVITE_EXPIRED')
                : t('owners.accept.notUsable')}
          </Text>
        </Card>
      ) : (
        <Card c={c}>
          <Text style={[styles.step, { color: c.textPrimary }]}>{t('owners.accept.codeStepTitle')}</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            {sent
              ? sent.deliveredVia
                ? t('owners.accept.codeSentVia', {
                    contact: sent.maskedContact,
                    via: t(`owners.accept.via.${sent.deliveredVia}`),
                  })
                : t('owners.accept.codeSent', { contact: sent.maskedContact })
              : t('owners.accept.codeWillGo', { contact: inv.maskedContact })}
          </Text>
          {sent ? (
            <>
              <AppInput
                label={t('owners.accept.code')}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))}
                keyboardType="numeric"
                autoCapitalize="none"
              />
              <AppInput
                label={t('owners.accept.yourName')}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                placeholder={inv.toName}
              />
            </>
          ) : null}
          {error ? (
            <Animated.Text style={[styles.error, { color: c.error }, shakeStyle]} accessibilityLiveRegion="polite">{error}</Animated.Text>
          ) : null}
          <View style={styles.buttons}>
            {sent ? (
              <>
                <Button
                  label={t('owners.accept.accept')}
                  onPress={() => accept.mutate()}
                  loading={accept.isPending}
                  disabled={!CODE_RE.test(code) || accept.isPending}
                />
                <Button
                  variant="ghost"
                  label={t('owners.accept.resendCode')}
                  onPress={() => sendCode.mutate()}
                  loading={sendCode.isPending}
                  disabled={sendCode.isPending}
                />
              </>
            ) : (
              <Button
                icon="message-lock-outline"
                label={t('owners.accept.sendCode')}
                onPress={() => sendCode.mutate()}
                loading={sendCode.isPending}
                disabled={sendCode.isPending}
              />
            )}
          </View>
          {/* Its own line: at most two labelled buttons share a row at 360 px. */}
          <View style={styles.buttons}>
            <Button
              variant="dangerOutline"
              size="sm"
              label={t('owners.accept.decline')}
              onPress={confirmDecline}
              disabled={decline.isPending || accept.isPending}
            />
          </View>
        </Card>
      )}
      </Rise>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 12 },
  center: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'left' },
  step: { fontSize: 15, fontWeight: '600' },
  body: { fontSize: 13, lineHeight: 19 },
  note: { fontSize: 12.5, fontStyle: 'italic' },
  meta: { fontSize: 12 },
  error: { fontSize: 12.5, lineHeight: 18, borderRadius: radii.xs },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  center1: { alignSelf: 'center' },
});
