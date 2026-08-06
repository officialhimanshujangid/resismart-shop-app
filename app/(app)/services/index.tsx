import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, useColorScheme, Pressable } from 'react-native';
import { Text, Searchbar, ActivityIndicator, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import {
  useServices, useWithdrawService, ServiceCard, ServiceUsageMeterBar,
} from '../../../src/features/services';
import type { PartnerServiceRow } from '../../../src/features/services';

type Tab = 'on' | 'off';

/**
 * C3 — the partner's price list. Gate 3 (`CATALOG_VIEW` READ) got this far —
 * `services/_layout.tsx` already refused anyone without it. `canManage` below
 * is gate 3 at FULL, and it is what decides whether Add/Edit/Withdraw render.
 *
 * Unpaginated, same as the web `services/page.tsx`: a price list is a dozen
 * rows, so the Offered/Withdrawn tabs and the search box filter what is
 * already loaded rather than a request per keystroke.
 */
export default function ServicesListScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const canManage = can('CATALOG_MANAGE', 'FULL');
  const { capacity } = usePlanUsage();
  const cap = capacity('max_services');

  const [tab, setTab] = useState<Tab>('on');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [snackbar, setSnackbar] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const servicesQuery = useServices();
  const withdrawService = useWithdrawService();

  const rows: PartnerServiceRow[] = servicesQuery.data ?? [];
  const activeCount = useMemo(() => rows.filter((r) => r.isActive).length, [rows]);

  const shown = useMemo(() => {
    const needle = q.toLowerCase();
    return rows
      .filter((r) => (tab === 'on' ? r.isActive : !r.isActive))
      .filter((r) => !needle || r.name.toLowerCase().includes(needle) || (r.description || '').toLowerCase().includes(needle));
  }, [rows, tab, q]);

  const goCreate = () => {
    if (cap.atLimit) return;
    router.push('/services/create');
  };

  const withdraw = (service: PartnerServiceRow) => {
    withdrawService.mutate(service._id, {
      onSuccess: (res) => setSnackbar(res.message || 'Taken off your list'),
      onError: (e: unknown) => setSnackbar(apiErrorMessage(e)),
    });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['bottom']}>
      <View style={styles.headerBox}>
        <ServiceUsageMeterBar cap={cap} c={c} />
      </View>

      <Searchbar
        placeholder="Search your services"
        value={searchInput}
        onChangeText={setSearchInput}
        style={[styles.search, { backgroundColor: c.surfaceVariant }]}
        elevation={0}
      />

      <View style={styles.tabRow}>
        {(['on', 'off'] as Tab[]).map((t) => {
          const active = t === tab;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tabChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
            >
              <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12.5, fontWeight: '700' }}>
                {t === 'on' ? 'Offered' : 'No longer offered'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(s) => s._id}
        renderItem={({ item }) => (
          <ServiceCardRow
            service={item}
            canManage={canManage}
            withdrawing={withdrawService.isPending && withdrawService.variables === item._id}
            onPress={() => router.push({ pathname: '/services/[id]', params: { id: item._id } })}
            onWithdraw={() => withdraw(item)}
            c={c}
          />
        )}
        contentContainerStyle={shown.length === 0 ? styles.emptyGrow : styles.listPad}
        ListEmptyComponent={
          servicesQuery.isLoading ? (
            <ActivityIndicator color={c.primary} />
          ) : (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="wrench-outline" size={30} color={c.textDisabled} />
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
                {q ? 'Nothing matched that' : tab === 'off' ? 'Everything you have is being offered' : 'No services yet'}
              </Text>
              <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
                {tab === 'on' && !q
                  ? 'Add the first thing you sell. Give it a price and a length, and residents can book it once your working hours are set.'
                  : 'Try a different search, or switch tabs above.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          activeCount > 0 ? (
            <Pressable onPress={() => router.push('/availability')} style={styles.footerNote}>
              <MaterialCommunityIcons name="clock-alert-outline" size={14} color={c.primary} />
              <Text style={[styles.footerNoteText, { color: c.textSecondary }]}>
                Residents can only book these once your <Text style={{ color: c.primary, fontWeight: '700' }}>working hours</Text> are set.
              </Text>
            </Pressable>
          ) : null
        }
      />

      {canManage && (
        <Pressable
          onPress={goCreate}
          disabled={cap.atLimit}
          style={[styles.fab, { backgroundColor: cap.atLimit ? c.textDisabled : c.primary }]}
        >
          <MaterialCommunityIcons name="plus" size={20} color="#fff" />
          <Text style={styles.fabText}>Add a service</Text>
        </Pressable>
      )}

      <Snackbar visible={Boolean(snackbar)} onDismiss={() => setSnackbar(null)} duration={4000}>
        {snackbar}
      </Snackbar>
    </SafeAreaView>
  );
}

function ServiceCardRow({
  service, canManage, withdrawing, onPress, onWithdraw, c,
}: {
  service: PartnerServiceRow;
  canManage: boolean;
  withdrawing: boolean;
  onPress: () => void;
  onWithdraw: () => void;
  c: ReturnType<typeof themeColors>;
}) {
  return (
    <View>
      <ServiceCard service={service} onPress={onPress} />
      {canManage && service.isActive && (
        <Pressable onPress={onWithdraw} disabled={withdrawing} style={styles.withdrawBtn}>
          <Text style={{ color: c.error, fontSize: 12, fontWeight: '700' }}>
            {withdrawing ? 'Removing…' : 'Stop offering'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBox: { paddingHorizontal: 14, paddingTop: 10 },
  search: { marginHorizontal: 14, marginTop: 10, borderRadius: radii.field },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  tabChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  listPad: { paddingBottom: 90 },
  emptyGrow: { flexGrow: 1, justifyContent: 'center' },
  emptyBox: { alignItems: 'center', gap: 6, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  emptyBody: { fontSize: 13, textAlign: 'center' },
  withdrawBtn: { alignSelf: 'flex-end', marginRight: 22, marginTop: -8, marginBottom: 4, paddingVertical: 4, paddingHorizontal: 6 },
  footerNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 14, marginTop: 4, paddingVertical: 8 },
  footerNoteText: { fontSize: 11.5, flex: 1, lineHeight: 16 },
  fab: {
    position: 'absolute', right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: radii.pill, paddingHorizontal: 18, paddingVertical: 13, elevation: 3,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
});
