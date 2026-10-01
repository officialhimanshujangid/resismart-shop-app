import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { partnerApi } from '../../../src/api/partner.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { useAuth } from '../../../src/context/AuthContext';
import { isOwnStaffRow } from '../../../src/lib/staffAccess';
import { Card, EmptyBlock, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { useCancelInvite, useReissueInvite, useRemoveOwner, useTeam } from '../../../src/features/owners/hooks';
import { canRemoveOwner, hasPendingTransfer, splitInvites } from '../../../src/features/owners/logic';
import type { AdminView, CreatedInvite, InviteKind, InviteView } from '../../../src/features/owners/types';
import { OwnerRow } from '../../../src/features/owners/components/OwnerRow';
import { InviteRow } from '../../../src/features/owners/components/InviteRow';
import { HandoverCard } from '../../../src/features/owners/components/HandoverCard';
import { InviteFormDialog } from '../../../src/features/owners/components/InviteFormDialog';
import { ShareInviteDialog } from '../../../src/features/owners/components/ShareInviteDialog';
import { OwnerActionsCard } from '../../../src/features/owners/components/OwnerActionsCard';
import { AdminContactCard } from '../../../src/features/owners/components/AdminContactCard';

const CLOSED_PREVIEW = 5;

/**
 * Team → Owners (CONTRACT-partner-P0 §6.1) — the mobile twin of the web
 * dashboard's Owners tab: the owner logins, invitations waiting and closed,
 * invite a co-owner, hand the business over, and the handover history.
 */
export default function OwnersScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { user, profile, leaveBusiness } = useAuth();
  const team = useTeam();
  const me = useQuery({ queryKey: qk.partner.me(), queryFn: partnerApi.me, staleTime: 60_000 });
  const cancel = useCancelInvite();
  const reissue = useReissueInvite();
  const remove = useRemoveOwner();

  const [formKind, setFormKind] = useState<InviteKind | null>(null);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [showAllClosed, setShowAllClosed] = useState(false);

  const businessName = me.data?.partner?.name || profile?.tenantName || t('more.yourBusiness');
  const admins = useMemo(() => team.data?.admins ?? [], [team.data]);
  const invites = useMemo(() => team.data?.invites ?? [], [team.data]);
  const split = useMemo(() => splitInvites(invites), [invites]);
  const removable = canRemoveOwner(admins);
  const busy = cancel.isPending || reissue.isPending || remove.isPending;

  const confirmCancel = (inv: InviteView) =>
    Alert.alert(t('owners.cancelTitle'), t('owners.cancelBody', { name: inv.toName }), [
      { text: t('common.notNow'), style: 'cancel' },
      {
        text: t('owners.cancelInvite'),
        style: 'destructive',
        onPress: () => cancel.mutate(inv.id, { onError: (e) => Alert.alert(t('owners.actionFailed'), apiErrorMessage(e)) }),
      },
    ]);

  const confirmResend = (inv: InviteView) =>
    Alert.alert(t('owners.resendTitle'), t('owners.resendBody', { name: inv.toName }), [
      { text: t('common.notNow'), style: 'cancel' },
      {
        text: t('owners.resend'),
        onPress: () =>
          reissue.mutate(inv, {
            onSuccess: (next) => setCreated(next),
            onError: (e) => Alert.alert(t('owners.actionFailed'), apiErrorMessage(e)),
          }),
      },
    ]);

  const confirmRemove = (admin: AdminView, isSelf: boolean) =>
    Alert.alert(
      isSelf ? t('owners.leaveTitle') : t('owners.removeTitle'),
      isSelf ? t('owners.leaveBody', { business: businessName }) : t('owners.removeBody', { name: admin.name, business: businessName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: isSelf ? t('owners.leave') : t('owners.remove'),
          style: 'destructive',
          onPress: () =>
            remove.mutate(admin.userId, {
              // Leaving takes this login out of the business: step out of it
              // now rather than wait for the next request to answer ROLE_ENDED.
              onSuccess: () => {
                if (isSelf) void leaveBusiness('ACCESS_ENDED').catch((e: unknown) => Alert.alert(t('owners.actionFailed'), apiErrorMessage(e)));
              },
              onError: (e) => Alert.alert(t('owners.actionFailed'), apiErrorMessage(e)),
            }),
        },
      ],
    );

  const closedShown = showAllClosed ? split.closed : split.closed.slice(0, CLOSED_PREVIEW);

  return (
    <Screen c={c} title={t('owners.title')} subtitle={businessName}>
      <View style={styles.column}>
        {team.isPending ? (
          <Loading c={c} />
        ) : team.isError ? (
          <ErrorBlock c={c} message={apiErrorMessage(team.error, t('owners.loadFailed'))} onRetry={() => void team.refetch()} />
        ) : (
          <>
            <Text style={[styles.intro, { color: c.textSecondary }]}>{t('owners.intro')}</Text>

            <SectionLabel c={c}>{t('owners.ownersSection', { count: admins.length })}</SectionLabel>
            <Card c={c}>
              {admins.map((a, i) => {
                const isSelf = isOwnStaffRow({ userId: { phone: a.phone, email: a.email } }, user);
                return (
                  <View key={a.userId}>
                    {i > 0 ? <View style={[styles.divider, { backgroundColor: c.divider }]} /> : null}
                    <OwnerRow
                      c={c}
                      admin={a}
                      isSelf={isSelf}
                      canRemove={removable}
                      busy={busy}
                      onRemove={() => confirmRemove(a, isSelf)}
                    />
                  </View>
                );
              })}
              {!removable ? (
                <Text style={[styles.hint, { color: c.textSecondary }]}>{t('owners.lastOwnerHint')}</Text>
              ) : null}
            </Card>

            <OwnerActionsCard
              c={c}
              transferPending={hasPendingTransfer(invites)}
              onInvite={() => setFormKind('CO_ADMIN')}
              onTransfer={() => setFormKind('TRANSFER')}
            />

            <SectionLabel c={c}>{t('owners.pendingSection')}</SectionLabel>
            {split.pending.length === 0 ? (
              <Text style={[styles.hint, { color: c.textSecondary }]}>{t('owners.noPending')}</Text>
            ) : (
              split.pending.map((inv) => (
                <InviteRow
                  key={inv.id}
                  c={c}
                  invite={inv}
                  busy={busy}
                  onCancel={() => confirmCancel(inv)}
                  onResend={() => confirmResend(inv)}
                />
              ))
            )}

            {split.handovers.length > 0 ? (
              <>
                <SectionLabel c={c}>{t('owners.historySection')}</SectionLabel>
                {split.handovers.map((inv) => <HandoverCard key={inv.id} c={c} invite={inv} />)}
              </>
            ) : null}

            {split.closed.length > 0 ? (
              <>
                <SectionLabel c={c}>{t('owners.closedSection')}</SectionLabel>
                {closedShown.map((inv) => <InviteRow key={inv.id} c={c} invite={inv} />)}
                {split.closed.length > CLOSED_PREVIEW ? (
                  <Pressable onPress={() => setShowAllClosed((v) => !v)} style={styles.more} accessibilityRole="button">
                    <Text style={{ color: c.primary, fontWeight: '600', fontSize: 13 }}>
                      {showAllClosed ? t('owners.showFewer') : t('owners.showAll', { count: split.closed.length })}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {admins.length === 0 && invites.length === 0 ? (
              <EmptyBlock c={c} icon="account-key-outline" title={t('owners.emptyTitle')} />
            ) : null}

            <AdminContactCard c={c} email={me.data?.partner?.adminEmail} />
          </>
        )}
      </View>

      <InviteFormDialog
        kind={formKind}
        onDismiss={() => setFormKind(null)}
        onCreated={(next) => {
          setFormKind(null);
          setCreated(next);
        }}
      />
      <ShareInviteDialog created={created} businessName={businessName} onDone={() => setCreated(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 12 },
  intro: { fontSize: 13, lineHeight: 19 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  hint: { fontSize: 12, lineHeight: 17 },
  more: { alignSelf: 'center', paddingVertical: 8 },
});
