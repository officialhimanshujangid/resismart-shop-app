import React from 'react';
import { Alert, FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { FAB, IconButton, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors, radii, palette } from '../../../src/constants/colors';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { staffApi, PartnerStaffRow } from '../../../src/api/staff.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { EmptyBlock, ErrorBlock, Loading, Row, Screen } from '../../../src/features/more/ui';

function nameOf(row: PartnerStaffRow): string {
  return typeof row.userId === 'object' ? row.userId.name : 'Staff member';
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
  const { can } = usePartnerEntitlements();
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
    onError: (err) => Alert.alert('Could not bring them back', apiErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => staffApi.remove(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.staff() }),
    onError: (err) => Alert.alert('Could not remove them', apiErrorMessage(err)),
  });

  const confirmRemove = (row: PartnerStaffRow) => {
    Alert.alert('Take off the staff list?', `${nameOf(row)} will lose access to this business. Their name stays on old bookings and invoices.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(row._id) },
    ]);
  };

  const active = (list.data ?? []).filter((r) => r.isActive);
  const inactive = (list.data ?? []).filter((r) => !r.isActive);

  const renderRow = (row: PartnerStaffRow) => (
    <View key={row._id} style={[styles.card, { backgroundColor: c.surface }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{nameOf(row)}</Text>
        <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
          {row.designation}{contactOf(row) ? ` · ${contactOf(row)}` : ''}
        </Text>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: c.surfaceVariant }]}>
            <Text style={{ fontSize: 11, color: c.textSecondary, fontWeight: '700' }}>
              {roleNameOf(row) || 'No role assigned'}
            </Text>
          </View>
          {row.canTakeBookings && (
            <View style={[styles.badge, { backgroundColor: palette.brand[50] }]}>
              <Text style={{ fontSize: 11, color: palette.brand[600], fontWeight: '700' }}>Takes bookings</Text>
            </View>
          )}
        </View>
      </View>
      {canManage && row.isActive && (
        <View style={{ flexDirection: 'row' }}>
          <IconButton icon="pencil-outline" size={20} onPress={() => router.push({ pathname: '/staff/new', params: { id: row._id } })} />
          <IconButton icon="account-remove-outline" size={20} iconColor={c.error} onPress={() => confirmRemove(row)} />
        </View>
      )}
      {canManage && !row.isActive && (
        <IconButton
          icon="account-reactivate-outline"
          size={20}
          disabled={cap.atLimit}
          onPress={() => reactivate.mutate(row._id)}
        />
      )}
    </View>
  );

  return (
    <Screen
      c={c}
      title="Staff"
      subtitle={cap.limit !== null ? `${cap.used} of ${cap.limit} ${cap.noun}` : undefined}
      right={canManage ? (
        <IconButton icon="shield-account-outline" size={22} onPress={() => router.push('/staff/roles')} />
      ) : undefined}
      floating={canManage ? (
        <FAB
          icon="plus"
          label={cap.atLimit ? 'Limit reached' : 'Invite staff'}
          disabled={cap.atLimit}
          style={[styles.fab, { backgroundColor: cap.atLimit ? c.textDisabled : c.primary }]}
          color={c.textInverse}
          onPress={() => router.push('/staff/new')}
        />
      ) : undefined}
    >
      {list.isPending ? (
        <Loading c={c} />
      ) : list.isError ? (
        <ErrorBlock c={c} message={apiErrorMessage(list.error, 'Could not load your staff list.')} onRetry={() => list.refetch()} />
      ) : list.data && list.data.length > 0 ? (
        <View style={{ gap: 10 }}>
          {active.map(renderRow)}
          {inactive.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>No longer here</Text>
              {inactive.map(renderRow)}
            </>
          )}
        </View>
      ) : (
        <EmptyBlock c={c} icon="account-tie-outline" title="Nobody invited yet" body="Add the people who work here, and give them a role." />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.card, padding: 14, gap: 8 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  badge: { borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 8 },
  fab: { position: 'absolute', right: 16, bottom: 20, borderRadius: radii.pill },
});
