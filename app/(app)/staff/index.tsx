import React from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Chip, FAB, IconButton, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { Rise } from '../../../src/theme/motion';
import { SkeletonList } from '../../../src/components/ui';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { staffApi, PartnerStaffRow } from '../../../src/api/staff.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { useAuth } from '../../../src/context/AuthContext';
import { isOwnStaffRow } from '../../../src/lib/staffAccess';
import { Hero, GlassStat } from '../../../src/components/Hero';
import { EmptyBlock, ErrorBlock, Screen } from '../../../src/features/more/ui';

/**
 * The staff member's own name where the row is populated, and a translated
 * placeholder where it is not. `t` is handed in rather than read from a hook:
 * this is a plain function, not a component, and both callers already hold one.
 */
function nameOf(row: PartnerStaffRow, t: (k: string) => string): string {
  return typeof row.userId === 'object' ? row.userId.name : t('staff.list.unnamed');
}
function contactOf(row: PartnerStaffRow): string | undefined {
  return typeof row.userId === 'object' ? (row.userId.phone || row.userId.email) : undefined;
}
function roleNameOf(row: PartnerStaffRow): string | undefined {
  return typeof row.roleId === 'object' ? row.roleId.name : undefined;
}

export default function StaffListScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { t } = useTranslation();
  const { can, entitlements } = usePartnerEntitlements();
  const { user } = useAuth();
  const { capacity } = usePlanUsage();
  const canManage = can('STAFF', 'FULL');
  const cap = capacity('max_partner_staff');
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: qk.staffList(),
    queryFn: staffApi.list,
    staleTime: 15_000,
  });

  const reactivate = useMutation({
    mutationFn: (id: string) => staffApi.reactivate(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.staff() }),
    onError: (err) => Alert.alert(t('staff.list.reactivateFailed'), apiErrorMessage(err)),
  });

  // >>> P10S — "Remove and erase personal data": staff cannot delete their own account.
  const erase = useMutation({
    mutationFn: (id: string) => staffApi.erasePersonalData(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.staff() });
      Alert.alert(t('staff.list.eraseDone'));
    },
    onError: (err) => Alert.alert(t('staff.list.eraseFailed'), apiErrorMessage(err)),
  });
  const confirmErase = (row: PartnerStaffRow, justRemoved = false) => {
    Alert.alert(
      t('staff.list.eraseTitle', { name: nameOf(row, t) }),
      justRemoved ? t('staff.list.eraseAfterRemoveBody') : t('staff.list.eraseBody'),
      [
        { text: justRemoved ? t('staff.list.eraseKeep') : t('common.cancel'), style: 'cancel' },
        { text: t('staff.list.eraseConfirm'), style: 'destructive', onPress: () => erase.mutate(row._id) },
      ],
    );
  };
  // <<< P10S

  const remove = useMutation({
    mutationFn: (row: PartnerStaffRow) => staffApi.remove(row._id),
    onSuccess: (_d, row) => {
      void queryClient.invalidateQueries({ queryKey: qk.staff() });
      confirmErase(row, true); // P10S — offer the erase straight after
    },
    onError: (err) => Alert.alert(t('staff.list.removeFailed'), apiErrorMessage(err)),
  });

  const confirmRemove = (row: PartnerStaffRow) => {
    Alert.alert(t('staff.list.removeTitle'), t('staff.list.removeBody', { name: nameOf(row, t) }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('staff.list.removeConfirm'), style: 'destructive', onPress: () => remove.mutate(row) },
    ]);
  };

  /**
   * `_one`/`_other`, not an English `-s`: Hindi cannot pluralise by suffixing,
   * and CLDR puts BOTH 0 and 1 in its `one` category.
   */
  const rosterLabel = t('staff.list.roster', { count: (list.data ?? []).filter((r) => r.isActive).length });
  /**
   * `noun` is the SERVER's word ("staff") and arrives in English — the same
   * trade `UsageMeter.tsx` documents. The sentence around it is translated; the
   * noun follows when the backend catalogue does.
   */
  const rosterSubtitle = cap.limit !== null
    ? t('staff.list.capacity', { used: cap.used, limit: cap.limit, noun: cap.noun })
    : t('staff.list.subtitle');

  const active = (list.data ?? []).filter((r) => r.isActive);
  const inactive = (list.data ?? []).filter((r) => !r.isActive);
  const rolesInUse = new Set(active.map(roleNameOf).filter(Boolean)).size;
  const bookingReady = active.filter((r) => r.canTakeBookings).length;

  // M10: each card rises in on open (staggered, capped); reduce-motion shows them at once.
  const renderRow = (row: PartnerStaffRow, i: number) => (
    <Rise key={row._id} index={Math.min(i, 6)}>
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, opacity: row.isActive ? 1 : 0.7 }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>{nameOf(row, t)}</Text>
        {/* `designation` is what the partner typed for this person's job, and the
            contact is their own phone or email — both data on the record, shown
            back as they were entered. */}
        <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={2}>
          {row.designation}{contactOf(row) ? t('staff.list.contactSuffix', { contact: contactOf(row) }) : ''}
        </Text>
        {row.personalDataErasedAt ? (
          <Text style={[styles.meta, { color: c.textSecondary }]}>{t('staff.list.erasedNote')}</Text>
        ) : null}
        <View style={styles.badgeRow}>
          <Chip
            compact
            style={[styles.chip, { backgroundColor: c.surfaceVariant }]}
            textStyle={[styles.chipText, { color: c.textSecondary }]}
          >
            {roleNameOf(row) || t('staff.list.noRole')}
          </Chip>
          {row.canTakeBookings && (
            <Chip
              compact
              icon="calendar-check-outline"
              // M10: theme soft-green chip — the fixed light pair stayed pale-on-pale in dark.
              style={[styles.chip, { backgroundColor: c.primarySoft }]}
              textStyle={[styles.chipText, { color: c.primary }]}
            >
              {t('staff.list.takesBookings')}
            </Chip>
          )}
        </View>
      </View>
      {canManage && row.isActive && (
        <View style={{ flexDirection: 'row' }}>
          <IconButton icon="pencil-outline" size={20} onPress={() => router.push({ pathname: '/staff/new', params: { id: row._id } })} />
          {/* Nobody removes themselves — the owner does that. */}
          {(entitlements.isAdmin || !isOwnStaffRow(row, user)) && (
            <IconButton icon="account-remove-outline" size={20} iconColor={c.error} onPress={() => confirmRemove(row)} />
          )}
        </View>
      )}
      {canManage && !row.isActive && !row.personalDataErasedAt && (
        <View style={{ flexDirection: 'row' }}>
          <IconButton
            icon="account-reactivate-outline"
            size={20}
            disabled={cap.atLimit}
            onPress={() => reactivate.mutate(row._id)}
          />
          {/* P10S — erase a leaver's contact details (staff cannot delete themselves). */}
          <IconButton
            icon="eraser"
            size={20}
            iconColor={c.error}
            accessibilityLabel={t('staff.list.eraseAction')}
            disabled={erase.isPending}
            onPress={() => confirmErase(row)}
          />
        </View>
      )}
    </View>
    </Rise>
  );

  return (
    <Screen
      c={c}
      title={t('staff.list.title')}
      right={canManage ? (
        <IconButton icon="shield-account-outline" size={22} onPress={() => router.push('/staff/roles')} />
      ) : undefined}
      floating={canManage ? (
        <FAB
          icon="plus"
          label={cap.atLimit ? t('staff.list.limitReached') : t('staff.list.inviteStaff')}
          disabled={cap.atLimit}
          style={[styles.fab, { backgroundColor: cap.atLimit ? c.textDisabled : c.primary }]}
          color={c.textInverse}
          onPress={() => router.push('/staff/new')}
        />
      ) : undefined}
    >
      <Hero
        isDark={isDark}
        eyebrow={t('staff.list.eyebrow')}
        headline={list.data ? { value: String(active.length), label: rosterLabel } : undefined}
        subtitle={rosterSubtitle}
      >
        {list.data ? (
          <>
            <GlassStat icon="shield-account-outline" label={t('staff.list.statRoles')} value={String(rolesInUse)} />
            <GlassStat icon="calendar-check-outline" label={t('staff.list.statBookings')} value={String(bookingReady)} />
          </>
        ) : null}
      </Hero>

      {list.isPending ? (
        // The list's shape while it loads, not a lone spinner.
        <SkeletonList rows={4} testID="staff-list-loading" />
      ) : list.isError ? (
        <ErrorBlock c={c} message={apiErrorMessage(list.error, t('staff.list.loadFailed'))} onRetry={() => list.refetch()} />
      ) : list.data && list.data.length > 0 ? (
        <View style={{ gap: 10 }}>
          {active.map(renderRow)}
          {inactive.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('staff.list.noLongerHere')}</Text>
              {inactive.map((r, i) => renderRow(r, active.length + i))}
            </>
          )}
        </View>
      ) : (
        <EmptyBlock c={c} icon="account-tie-outline" title={t('staff.list.emptyTitle')} body={t('staff.list.emptyBody')} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 8 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  chip: { borderRadius: radii.pill },
  chipText: { fontSize: 11, fontWeight: '600', marginVertical: 0 },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 8 },
  fab: { position: 'absolute', right: 16, bottom: 20, borderRadius: radii.pill },
});
