import React, { useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { authApi, DeviceSession, SessionsResponse } from '../../../src/api/auth.api';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { useAuth } from '../../../src/context/AuthContext';
import { useIsOnline } from '../../../src/hooks/useIsOnline';
import { Button, Card, SkeletonList, StatusBadge } from '../../../src/components/ui';
import { GroupRow, ListGroup } from '../../../src/components/ui/ListGroup';
import { useAppTheme } from '../../../src/theme/useAppTheme';
import { radius, typeScale } from '../../../src/theme/tokens';
import { Rise, useMotionOK } from '../../../src/theme/motion';
import { ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
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
 *
 * 1R redesign: one card per device (icon, name, "this device" badge, when),
 * skeletons while loading, the result as a sliding status banner, and the
 * "everywhere" action in its own danger card at the foot.
 */

const SESSIONS_KEY = ['auth', 'sessions'] as const;

const METHODS = new Set(['PASSWORD', 'OTP', 'GOOGLE', 'REFRESH_UPGRADE', 'PASSWORD_CHANGE']);

export default function DevicesScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { ds, status, tints } = useAppTheme();
  const online = useIsOnline();
  const motionOK = useMotionOK();
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

  const pair = notice?.error ? status.danger : status.success;

  return (
    <Screen c={c} title={t('account.devices.title')}>
      <Rise index={0}>
        <Text style={[typeScale.detail, { color: ds.muted }]}>{t('account.devices.intro')}</Text>
      </Rise>

      {notice ? (
        <Animated.View
          key={notice.text}
          entering={motionOK ? FadeInDown.duration(280) : undefined}
          style={[styles.notice, { backgroundColor: pair.bg }]}
          accessibilityLiveRegion="polite"
        >
          <MaterialCommunityIcons name={notice.error ? 'alert-circle-outline' : 'check-circle-outline'} size={20} color={pair.fg} />
          <Text style={[typeScale.row, styles.flex, { color: pair.fg }]}>{notice.text}</Text>
        </Animated.View>
      ) : null}

      {sessions.isPending ? (
        // Skeleton cards while it loads; offline keeps the shared "waiting for signal" words.
        online ? <SkeletonList rows={3} /> : <Loading c={c} label={t('account.devices.loading')} />
      ) : sessions.isError ? (
        <ErrorBlock
          c={c}
          message={apiErrorMessage(sessions.error, t('account.devices.loadFailed'))}
          onRetry={() => { void sessions.refetch(); }}
        />
      ) : (
        <>
          {ordered.map((s, i) => {
            const tn = tints[s.current ? 'green' : 'blue'];
            return (
              <Rise key={s.id} index={Math.min(i + 1, 6)}>
                <Card padding={16} style={styles.session}>
                  <View style={styles.sessionHead}>
                    <View style={styles.devIcon}>
                      <LinearGradient colors={[tn.from, tn.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.devIconFill]} />
                      <MaterialCommunityIcons name={s.current ? 'cellphone-check' : 'cellphone-link'} size={21} color={tn.icon} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[typeScale.row, { color: ds.ink }]} numberOfLines={2}>
                        {labelOf(s)}
                      </Text>
                      <Text style={[typeScale.detail, { color: ds.muted }]}>
                        {METHODS.has(s.method) ? t(`account.devices.method.${s.method}`) : s.method}
                        {' · '}
                        {t('account.devices.signedIn', { when: formatDateTime(s.createdAt, t) })}
                      </Text>
                      {s.lastUsedAt ? (
                        <Text style={[typeScale.detail, { color: ds.muted }]}>
                          {t('account.devices.lastUsed', { when: formatDateTime(s.lastUsedAt, t) })}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {s.current ? (
                    <StatusBadge label={t('account.devices.thisDevice')} tone="brand" live style={styles.badge} />
                  ) : (
                    <Button
                      label={t('account.devices.signOut')}
                      icon="logout"
                      variant="dangerOutline"
                      size="sm"
                      loading={endOne.isPending && endOne.variables === s.id}
                      disabled={endOne.isPending}
                      onPress={() => confirmEndOne(s)}
                    />
                  )}
                </Card>
              </Rise>
            );
          })}
          {ordered.filter((s) => !s.current).length === 0 ? (
            <Text style={[typeScale.detail, { color: ds.muted }]}>{t('account.devices.empty')}</Text>
          ) : null}

          {sessions.data?.hasPassword ? (
            <Rise index={5}>
              <ListGroup>
                <GroupRow
                  icon="lock-reset"
                  title={t('account.devices.changePassword')}
                  onPress={() => router.push('/account/change-password')}
                />
              </ListGroup>
            </Rise>
          ) : null}
        </>
      )}

      <Rise index={6}>
        <View style={[styles.danger, { backgroundColor: status.danger.bg }]}>
          <Text style={[typeScale.section, { color: ds.ink }]}>{t('account.devices.everywhere')}</Text>
          <Text style={[typeScale.detail, { color: ds.muted }]}>{t('account.devices.everywhereHint')}</Text>
          <Button
            label={t('account.devices.everywhere')}
            icon="logout-variant"
            variant="dangerOutline"
            loading={everywhereBusy}
            onPress={confirmEverywhere}
          />
        </View>
      </Rise>
    </Screen>
  );
}

/**
 * Buttons size to their label (the kit button hugs by default) rather than
 * stretching across a tablet; labels wrap inside the card at 320 px.
 */
const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.row, padding: 14 },
  session: { gap: 12 },
  sessionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  devIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  devIconFill: { borderRadius: 14 },
  badge: { alignSelf: 'flex-start' },
  danger: { borderRadius: radius.card, padding: 16, gap: 10, marginTop: 8 },
});
