import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, useColorScheme, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { useAuth } from '../../../src/context/AuthContext';
import { formatI18nDate } from '../../../src/i18n';
import { isOwnerSession } from '../../../src/features/owners/access';
import { Pill } from '../../../src/features/owners/components/Pill';
import { Card, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { reachApi } from '../../../src/features/society/api';
import { useMyReach } from '../../../src/features/society/hooks';
import { reachOptionState } from '../../../src/features/society/logic';
import { PARTNER_REACHES, type MyReach, type PartnerReach } from '../../../src/features/society/types';

/**
 * "Who can find you" — CONTRACT-partner-P3 §7.3 / §11, the app twin of the web
 * `/dashboard/partner/reach`.
 *
 * Society approval alone gives SOCIETY_ONLY. SOCIETY_AND_NEARBY and PUBLIC need
 * ResiSmart KYC (`verification.status === 'VERIFIED'`): those two are drawn
 * LOCKED with a way to Verification, never as a button that 409s. Narrowing is
 * always allowed. The server still decides (`REACH_NEEDS_KYC` is shown in place,
 * with the same way out, if the two ever disagree).
 *
 * Reading is open to any partner login; changing is for an owner (the server's
 * `assertOwnerLogin`), so staff see the state and a one-line reason.
 */
export default function ReachScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { profile } = useAuth();
  const owner = isOwnerSession(profile);
  const queryClient = useQueryClient();
  const reach = useMyReach();

  const [choice, setChoice] = useState<PartnerReach | null>(null);
  const [error, setError] = useState<{ text: string; kyc: boolean } | null>(null);
  const [badgeError, setBadgeError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (reach.data && choice === null) setChoice(reach.data.reach);
  }, [reach.data, choice]);

  const store = (next: MyReach) => queryClient.setQueryData(qk.partner.reach(), next);

  const save = useMutation({
    mutationFn: (to: PartnerReach) => reachApi.set(to),
    onMutate: () => { setError(null); setSaved(false); },
    onSuccess: (next) => {
      if (next && typeof next === 'object' && 'reach' in next) {
        store(next);
        setChoice(next.reach);
      } else {
        void queryClient.invalidateQueries({ queryKey: qk.partner.reach() });
      }
      setSaved(true);
      // The PUT answers the GET shape, stored above. The visibility report (Today, Verification) reads reach too.
      void queryClient.invalidateQueries({ queryKey: qk.entitlements() });
    },
    onError: (e) => setError({ text: apiErrorMessage(e, t('society.reach.saveFailed')), kyc: apiErrorCode(e) === 'REACH_NEEDS_KYC' }),
  });

  const badge = useMutation({
    mutationFn: (show: boolean) => reachApi.setLivesHereBadge(show),
    onMutate: () => setBadgeError(null),
    onSuccess: (next) => {
      if (next && typeof next === 'object' && 'reach' in next) store(next);
      else void queryClient.invalidateQueries({ queryKey: qk.partner.reach() });
    },
    onError: (e) => setBadgeError(apiErrorMessage(e, t('society.reach.badgeSaveFailed'))),
  });

  if (reach.isPending) {
    return <Screen c={c} title={t('society.reach.title')}><Loading c={c} /></Screen>;
  }
  if (reach.isError || !reach.data) {
    return (
      <Screen c={c} title={t('society.reach.title')}>
        <ErrorBlock c={c} message={apiErrorMessage(reach.error, t('society.reach.loadFailed'))} onRetry={() => void reach.refetch()} />
      </Screen>
    );
  }

  const r = reach.data;
  if (r.origin !== 'SOCIETY') {
    return (
      <Screen c={c} title={t('society.reach.title')}>
        <Card c={c}>
          <Text style={[styles.body, { color: c.textPrimary }]} testID="reach-independent">{t('society.reach.independent')}</Text>
        </Card>
      </Screen>
    );
  }

  const society = r.homeSociety?.name ?? t('society.reach.yourSociety');
  const km = r.nearbyKm ?? 3;
  const verified = r.verificationStatus === 'VERIFIED';
  const revoked = r.societyApproval?.status === 'REVOKED';
  const selected = choice ?? r.reach;
  const dirty = selected !== r.reach;
  const goVerify = () => router.push('/settings/verification');

  return (
    <Screen c={c} title={t('society.reach.title')} subtitle={society}>
      <View style={styles.column}>
        {revoked ? (
          <Card c={c} style={{ borderLeftWidth: 3, borderLeftColor: c.warning }}>
            <Text style={[styles.body, { color: c.textPrimary }]}>
              {r.societyApproval?.revokedReason
                ? t('society.banner.removedBody', {
                    date: r.societyApproval?.revokedAt ? formatI18nDate(r.societyApproval.revokedAt, t) : '—',
                    reason: r.societyApproval.revokedReason,
                  })
                : t('society.banner.removedBodyNoReason', {
                    date: r.societyApproval?.revokedAt ? formatI18nDate(r.societyApproval.revokedAt, t) : '—',
                  })}
            </Text>
          </Card>
        ) : null}

        <SectionLabel c={c}>{t('society.reach.chooseSection')}</SectionLabel>
        {PARTNER_REACHES.map((opt) => {
          const state = reachOptionState(r, opt);
          const locked = state === 'LOCKED';
          const active = selected === opt;
          return (
            <Pressable
              key={opt}
              testID={`reach-option-${opt}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: locked || !owner }}
              accessibilityLabel={t(`society.reach.option.${opt}.title`)}
              disabled={locked || !owner || save.isPending}
              onPress={() => { setChoice(opt); setSaved(false); setError(null); }}
              style={[
                styles.option,
                { backgroundColor: c.surface, borderColor: active ? c.primary : c.border },
                active && styles.optionActive,
              ]}
            >
              <MaterialCommunityIcons
                name={locked ? 'lock-outline' : active ? 'radiobox-marked' : 'radiobox-blank'}
                size={22}
                color={locked ? c.textDisabled : active ? c.primary : c.textSecondary}
              />
              <View style={styles.optionText}>
                <View style={styles.optionHead}>
                  <Text style={[styles.optionTitle, { color: locked ? c.textSecondary : c.textPrimary }]}>
                    {t(`society.reach.option.${opt}.title`)}
                  </Text>
                  {state === 'CURRENT' ? <Pill c={c} tone="good" label={t('society.reach.current')} /> : null}
                  {locked ? <Pill c={c} tone="warn" label={t('society.reach.needsKyc')} /> : null}
                </View>
                <Text style={[styles.meta, { color: c.textSecondary }]}>
                  {t(`society.reach.option.${opt}.body`, { society, km })}
                </Text>
              </View>
            </Pressable>
          );
        })}

        {!verified ? (
          <Card c={c} style={{ backgroundColor: c.surfaceVariant }}>
            <Text style={[styles.body, { color: c.textPrimary }]}>
              {r.verificationStatus === 'PENDING' ? t('society.reach.kycPending') : t('errors.REACH_NEEDS_KYC')}
            </Text>
            {r.verificationStatus !== 'PENDING' ? (
              <Button mode="outlined" icon="shield-check-outline" onPress={goVerify} style={styles.btn}>
                {t('society.reach.goVerify')}
              </Button>
            ) : null}
          </Card>
        ) : null}

        {error ? (
          <View style={styles.errorBlock}>
            <Text style={[styles.error, { color: c.error }]} accessibilityLiveRegion="polite">{error.text}</Text>
            {error.kyc ? (
              <Button mode="text" compact onPress={goVerify} style={styles.btn}>{t('society.reach.goVerify')}</Button>
            ) : null}
          </View>
        ) : null}
        {saved && !dirty ? <Text style={[styles.meta, { color: c.success }]}>{t('society.reach.saved')}</Text> : null}

        {owner ? (
          <Button
            mode="contained"
            onPress={() => save.mutate(selected)}
            disabled={!dirty || save.isPending}
            loading={save.isPending}
            style={styles.btn}
          >
            {t('common.save')}
          </Button>
        ) : (
          <Text style={[styles.meta, { color: c.textSecondary }]}>{t('society.reach.ownerOnly')}</Text>
        )}

        <SectionLabel c={c}>{t('society.reach.badgeSection')}</SectionLabel>
        <Card c={c}>
          <View style={styles.switchRow}>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: c.textPrimary }]}>
                {r.homeFlatLabel ? t('society.reach.badgeTitle', { flat: r.homeFlatLabel }) : t('society.reach.badgeTitleNoFlat')}
              </Text>
              <Text style={[styles.meta, { color: c.textSecondary }]}>{t('society.reach.badgeBody', { society })}</Text>
            </View>
            <Switch
              testID="lives-here-switch"
              value={!!r.showLivesHereBadge}
              disabled={!owner || !r.homeFlatLabel || badge.isPending}
              onValueChange={(v) => badge.mutate(v)}
              accessibilityLabel={t('society.reach.badgeTitleNoFlat')}
              trackColor={{ true: c.primary, false: c.border }}
            />
          </View>
          {!r.homeFlatLabel ? <Text style={[styles.meta, { color: c.textSecondary }]}>{t('errors.LIVES_HERE_NEEDS_FLAT')}</Text> : null}
          {badgeError ? <Text style={[styles.error, { color: c.error }]}>{badgeError}</Text> : null}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 10 },
  body: { fontSize: 13.5, lineHeight: 19 },
  meta: { fontSize: 12.5, lineHeight: 18 },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: radii.card, padding: 14 },
  optionActive: { borderWidth: 2, padding: 13 },
  optionText: { flex: 1, minWidth: 0, gap: 3 },
  optionHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  optionTitle: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorBlock: { gap: 2 },
  error: { fontSize: 12.5, lineHeight: 18 },
  btn: { alignSelf: 'flex-start', borderRadius: 12 },
});
