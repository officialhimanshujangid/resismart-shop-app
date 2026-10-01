import React, { useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { authApi, DeviceSession, SessionsResponse } from '../../../src/api/auth.api';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { useAuth } from '../../../src/context/AuthContext';
import { AppButton } from '../../../src/components/AppButton';
import { Card, ErrorBlock, Loading, Row, Screen, SectionLabel } from '../../../src/features/more/ui';
import { formatDateTime } from '../../../src/features/bookings/format';

/**
 * Signed-in devices — every session of this ACCOUNT (GET /auth/sessions), with
 * a way to sign one other device out (DELETE /auth/sessions/:id) and a way to
 * sign out of all of them (POST /auth/logout { everywhere: true }).
 *
 * Under `account/`, not `settings/`, for the same reason as Delete account:
 * `settings/` is gated on the business's SETTINGS permission, and this is the
 * PERSON's own login — a member of staff with no settings grant must still be
 * able to throw a lost phone out of their account.
 */

const SESSIONS_KEY = ['auth', 'sessions'] as const;

const METHODS = new Set(['PASSWORD', 'OTP', 'GOOGLE', 'REFRESH_UPGRADE', 'PASSWORD_CHANGE']);

export default function DevicesScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { logoutEverywhere } = useAuth();
  const queryClient = useQueryClient();
  /** The last outcome, said in place (success or refusal). */
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [everywhereBusy, setEverywhereBusy] = useState(false);

  const sessions = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: async (): Promise<SessionsResponse> => {
      const { data } = await authApi.sessions();
      const body = (data?.data ?? data) as Partial<SessionsResponse> | undefined;
      return {
        sessions: Array.isArray(body?.sessions) ? body!.sessions : [],
        hasPassword: body?.hasPassword === true,
      };
    },
  });

  const endOne = useMutation({
    mutationFn: (id: string) => authApi.endSession(id),
    onSuccess: () => {
      setNotice({ text: t('account.devices.signedOut'), error: false });
    },
    onError: (e: unknown) => {
      // Already gone is not a failure worth red — but it is still said, in
      // our words (SESSION_NOT_FOUND), and the list is refreshed below.
      const gone = apiErrorCode(e) === 'SESSION_NOT_FOUND';
      setNotice({ text: apiErrorMessage(e, t('account.devices.signOutFailed')), error: !gone });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });

  const labelOf = (s: DeviceSession) => s.deviceLabel?.trim() || t('account.devices.unnamed');

  const confirmEndOne = (s: DeviceSession) => {
    Alert.alert(t('account.devices.signOutTitle'), t('account.devices.signOutBody', { device: labelOf(s) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.devices.signOut'),
        style: 'destructive',
        onPress: () => {
          setNotice(null);
          endOne.mutate(s.id);
        },
      },
    ]);
  };

  const runEverywhere = async () => {
    setEverywhereBusy(true);
    setNotice(null);
    try {
      // Signs this device out too on success — the shell unmounts on its own.
      await logoutEverywhere();
    } catch (e) {
      setNotice({ text: (e as Error)?.message || t('account.devices.everywhereFailed'), error: true });
      setEverywhereBusy(false);
    }
  };

  const confirmEverywhere = () => {
    Alert.alert(t('account.devices.everywhereTitle'), t('account.devices.everywhereBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('account.devices.everywhere'), style: 'destructive', onPress: () => { void runEverywhere(); } },
    ]);
  };

  const list = sessions.data?.sessions ?? [];
  // This device first, then the most recently used.
  const ordered = [...list].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return (Date.parse(b.lastUsedAt ?? b.createdAt) || 0) - (Date.parse(a.lastUsedAt ?? a.createdAt) || 0);
  });

  return (
    <Screen c={c} title={t('account.devices.title')}>
      <Text style={[styles.body, { color: c.textSecondary }]}>{t('account.devices.intro')}</Text>

      {notice ? (
        <View
          style={[styles.notice, { backgroundColor: c.surface, borderColor: notice.error ? c.error : c.primary }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.body, { color: c.textPrimary }]}>{notice.text}</Text>
        </View>
      ) : null}

      {sessions.isPending ? (
        <Loading c={c} label={t('account.devices.loading')} />
      ) : sessions.isError ? (
        <ErrorBlock
          c={c}
          message={apiErrorMessage(sessions.error, t('account.devices.loadFailed'))}
          onRetry={() => { void sessions.refetch(); }}
        />
      ) : (
        <>
          {ordered.map((s) => (
            <Card c={c} key={s.id} style={styles.session}>
              <View style={styles.sessionHead}>
                <Text style={[styles.device, { color: c.textPrimary }]} numberOfLines={2}>
                  {labelOf(s)}
                </Text>
                {s.current ? (
                  <View style={[styles.chip, { backgroundColor: c.surfaceVariant }]}>
                    <Text style={[styles.chipText, { color: c.primary }]}>{t('account.devices.thisDevice')}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.meta, { color: c.textSecondary }]}>
                {METHODS.has(s.method) ? t(`account.devices.method.${s.method}`) : s.method}
                {' · '}
                {t('account.devices.signedIn', { when: formatDateTime(s.createdAt, t) })}
              </Text>
              {s.lastUsedAt ? (
                <Text style={[styles.meta, { color: c.textSecondary }]}>
                  {t('account.devices.lastUsed', { when: formatDateTime(s.lastUsedAt, t) })}
                </Text>
              ) : null}
              {!s.current ? (
                <AppButton
                  label={t('account.devices.signOut')}
                  icon="logout"
                  mode="outlined"
                  fullWidth={false}
                  style={styles.inlineButton}
                  loading={endOne.isPending && endOne.variables === s.id}
                  disabled={endOne.isPending}
                  onPress={() => confirmEndOne(s)}
                />
              ) : null}
            </Card>
          ))}
          {ordered.filter((s) => !s.current).length === 0 ? (
            <Text style={[styles.body, { color: c.textSecondary }]}>{t('account.devices.empty')}</Text>
          ) : null}

          {sessions.data?.hasPassword ? (
            <Card c={c} style={styles.listCard}>
              <Row
                c={c}
                icon="lock-reset"
                title={t('account.devices.changePassword')}
                onPress={() => router.push('/account/change-password')}
              />
            </Card>
          ) : null}
        </>
      )}

      <SectionLabel c={c}>{t('account.devices.everywhere')}</SectionLabel>
      <Text style={[styles.body, { color: c.textSecondary }]}>{t('account.devices.everywhereHint')}</Text>
      <AppButton
        label={t('account.devices.everywhere')}
        icon="logout-variant"
        mode="outlined"
        fullWidth={false}
        style={styles.inlineButton}
        labelStyle={{ color: c.error }}
        loading={everywhereBusy}
        onPress={confirmEverywhere}
      />
    </Screen>
  );
}

/**
 * Buttons size to their label (`fullWidth={false}` + `alignSelf`) rather than
 * stretching across a tablet; the label wraps inside the card at 320 px because
 * nothing here sets a width or a single-line limit on it.
 */
const styles = StyleSheet.create({
  body: { fontSize: 13, lineHeight: 19 },
  notice: { borderWidth: 1, borderRadius: radii.sm, padding: 12 },
  session: { gap: 4 },
  sessionHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  device: { flexShrink: 1, fontSize: 15, fontWeight: '600' },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  chipText: { fontSize: 12, fontWeight: '600' },
  meta: { fontSize: 12.5, lineHeight: 18 },
  inlineButton: { alignSelf: 'flex-start', maxWidth: '100%' },
  listCard: { padding: 0, overflow: 'hidden' },
});
