import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, TouchableOpacity, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { WEB_DELETE_ACCOUNT_URL } from '../../../src/constants/app';
import { useAuth } from '../../../src/context/AuthContext';
import { AccountDeletionRequest } from '../../../src/api/account.api';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { AppButton } from '../../../src/components/AppButton';
import { AppInput } from '../../../src/components/AppInput';
import { Card, Screen, SectionLabel } from '../../../src/features/more/ui';
import { useConfirmAccountDeletion, useRequestAccountDeletion } from '../../../src/features/account/hooks';

/**
 * Delete my account — the in-app path Google Play requires, reached from More →
 * Account.
 *
 * Deliberately NOT under `settings/`: that layout gates on `SETTINGS` READ, and
 * this is the PERSON's account, not the business's settings. A member of staff
 * with no settings grant must still be able to leave, so the route sits beside
 * `notifications.tsx`, under the signed-in shell only.
 *
 * Two steps, both the server's (`api/account.api.ts`): send a code, then confirm
 * with it behind a final native Alert. The lists of what goes and what stays are
 * a summary; `WEB_DELETE_ACCOUNT_URL` carries the full wording.
 */

const CODE_LENGTH = 6;
/** Same resend countdown as sign-in (`(auth)/verify-otp.tsx`). */
const RESEND_SECONDS = 30;

/** Catalogue keys, in the order they are shown. */
const DELETED_KEYS = ['login', 'photo', 'details', 'devices', 'workspaces'] as const;
const KEPT_KEYS = ['invoices', 'business'] as const;

export default function DeleteAccountScreen() {
  const { t, i18n } = useTranslation(); // HELP34R: i18n for the date's language
  const c = themeColors(useColorScheme() === 'dark');
  const { user } = useAuth();
  const request = useRequestAccountDeletion();
  const confirm = useConfirmAccountDeletion();

  /** The last successful send, or `null` before the first one. */
  const [sent, setSent] = useState<AccountDeletionRequest | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const handle = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(handle);
  }, [cooldown]);

  /**
   * Send, and resend. A refusal stays on `request.error` and is drawn above the
   * button; a resend that fails leaves the previous `sent` in place, because the
   * code it describes is still the one to type.
   */
  const sendCode = useCallback(() => {
    request.mutate(undefined, {
      onSuccess: (data) => {
        setSent(data);
        setCode('');
        setCodeError(undefined);
        setCooldown(RESEND_SECONDS);
      },
    });
  }, [request]);

  const deleteNow = useCallback(() => {
    confirm
      .mutateAsync(code)
      .then((res) => {
        // Shown over the login screen: by the time this resolves the hook has
        // already signed out and `(app)` has unmounted — see `useConfirmAccountDeletion`.
        // >>> HELP34R — our own (translated) text with the date, never the server's English sentence.
        const deleteAt = (res as { data?: { deleteAt?: string } } | undefined)?.data?.deleteAt;
        const when = deleteAt && !Number.isNaN(Date.parse(deleteAt))
          ? new Date(deleteAt).toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
          : '';
        Alert.alert(t('account.delete.doneTitle'), when ? t('account.delete.doneOn', { date: when }) : t('account.delete.doneBody'));
        // <<< HELP34R
      })
      .catch((e: unknown) => setCodeError(apiErrorMessage(e, t('account.delete.confirmFailed'))));
  }, [code, confirm, t, i18n]); // HELP34R: i18n

  const onDeletePress = () => {
    if (code.length !== CODE_LENGTH) {
      setCodeError(t('account.delete.codeIncomplete'));
      return;
    }
    Alert.alert(t('account.delete.finalTitle'), t('account.delete.finalBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('account.delete.finalConfirm'), style: 'destructive', onPress: deleteNow },
    ]);
  };

  const openPolicy = () => {
    Linking.openURL(WEB_DELETE_ACCOUNT_URL).catch(() =>
      Alert.alert(t('account.delete.browserFailedTitle'), t('account.delete.browserFailedBody', { url: WEB_DELETE_ACCOUNT_URL })),
    );
  };

  /**
   * Where the code went, as one sentence. The address is this device's own copy
   * of the identity (`user.phone` / `user.email`); when it is missing the
   * sentence still names the channel, which is the part that says where to look.
   */
  const sentLine = (() => {
    if (!sent) return null;
    const to = sent.channel === 'EMAIL'
      ? user?.email || t('account.delete.yourEmail')
      : user?.phone || t('account.delete.yourPhone');
    switch (sent.deliveredVia) {
      case 'whatsapp':
        return t('account.delete.sentWhatsapp', { to });
      case 'sms':
        return t('account.delete.sentSms', { to });
      default:
        return t('account.delete.sentEmail', { to });
    }
  })();

  // 409 DELETION_BLOCKED is not a failure to retry but a thing to do first, so
  // it gets its own heading; the server's sentence underneath says what.
  const requestError = request.error
    ? {
        title: apiErrorCode(request.error) === 'DELETION_BLOCKED'
          ? t('account.delete.blockedTitle')
          : t('account.delete.sendFailedTitle'),
        body: apiErrorMessage(request.error, t('account.delete.sendFailed')),
      }
    : null;

  const busy = request.isPending || confirm.isPending;
  const canDelete = code.length === CODE_LENGTH && !busy;

  return (
    <Screen c={c} title={t('account.delete.title')}>
      <Card c={c} style={[styles.warning, { borderColor: c.error }]}>
        <View style={styles.warningHead}>
          <MaterialCommunityIcons name="alert-outline" size={22} color={c.error} />
          <Text style={[styles.warningTitle, { color: c.textPrimary }]}>{t('account.delete.warningTitle')}</Text>
        </View>
        <Text style={[styles.body, { color: c.textSecondary }]}>{t('account.delete.warningBody')}</Text>
      </Card>

      <SectionLabel c={c}>{t('account.delete.deletedSection')}</SectionLabel>
      <Card c={c}>
        {DELETED_KEYS.map((key) => (
          <View key={key} style={styles.item}>
            <MaterialCommunityIcons name="close-circle-outline" size={18} color={c.error} />
            <Text style={[styles.itemText, { color: c.textPrimary }]}>{t(`account.delete.deleted.${key}`)}</Text>
          </View>
        ))}
      </Card>

      <SectionLabel c={c}>{t('account.delete.keptSection')}</SectionLabel>
      <Card c={c}>
        {KEPT_KEYS.map((key) => (
          <View key={key} style={styles.item}>
            <MaterialCommunityIcons name="archive-outline" size={18} color={c.textSecondary} />
            <Text style={[styles.itemText, { color: c.textPrimary }]}>{t(`account.delete.kept.${key}`)}</Text>
          </View>
        ))}
        <TouchableOpacity onPress={openPolicy} accessibilityRole="link" style={styles.link}>
          <MaterialCommunityIcons name="open-in-new" size={16} color={c.primary} />
          <Text style={{ color: c.primary, fontWeight: '600' }}>{t('account.delete.readPolicy')}</Text>
        </TouchableOpacity>
      </Card>

      {requestError ? (
        // Same treatment as `OtpDeliveryNotice`'s failure box: red carries the
        // border, the words stay in `textPrimary` — `danger` is under AA as text.
        <View style={[styles.alert, { backgroundColor: c.surface, borderColor: c.error }]}>
          <Text style={[styles.alertTitle, { color: c.textPrimary }]}>{requestError.title}</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>{requestError.body}</Text>
        </View>
      ) : null}

      {!sent ? (
        <>
          <Text style={[styles.body, { color: c.textSecondary }]}>{t('account.delete.sendHint')}</Text>
          <AppButton
            label={t('account.delete.sendCode')}
            icon="message-lock-outline"
            loading={request.isPending}
            onPress={sendCode}
          />
        </>
      ) : (
        <>
          <Text style={[styles.body, { color: c.textSecondary }]}>{sentLine}</Text>
          <AppInput
            label={t('account.delete.codeLabel')}
            value={code}
            onChangeText={(v) => {
              setCode(v.replace(/\D/g, '').slice(0, CODE_LENGTH));
              setCodeError(undefined);
            }}
            keyboardType="numeric"
            autoComplete="sms-otp"
            leftIcon="lock-outline"
            disabled={confirm.isPending}
            error={codeError}
          />
          <AppButton
            label={t('account.delete.confirmButton')}
            icon="delete-forever-outline"
            loading={confirm.isPending}
            disabled={!canDelete}
            onPress={onDeletePress}
            // The one red fill in the app, and only while it can actually be
            // pressed — disabled keeps Paper's own greyed look.
            style={canDelete ? { backgroundColor: c.error } : undefined}
          />
          <TouchableOpacity onPress={sendCode} disabled={cooldown > 0 || busy} style={styles.resend}>
            <Text style={{ color: cooldown > 0 || busy ? c.textDisabled : c.primary, fontWeight: '600' }}>
              {cooldown > 0 ? t('account.delete.resendIn', { seconds: cooldown }) : t('account.delete.resend')}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  warning: { borderWidth: 1 },
  warningHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warningTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 19 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  alert: { borderWidth: 1, borderRadius: radii.sm, padding: 12, gap: 4 },
  alertTitle: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  resend: { alignSelf: 'center', paddingVertical: 10 },
});
