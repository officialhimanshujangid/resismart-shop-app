import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View, StyleSheet, FlatList, useColorScheme, Pressable } from 'react-native';
import { Text, Searchbar, ActivityIndicator, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { Hero, GlassStat } from '../../../src/components/Hero';
import { apiErrorMessage } from '../../../src/api/axios';
import { ErrorBlock } from '../../../src/features/more/ui';
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
  const { t } = useTranslation();
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

  // `timer`, not `t`: this file holds a translator now, and a local `t` would
  // shadow it inside the effect.
  useEffect(() => {
    const timer = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(timer);
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

  /**
   * Why the price list is empty, when it is empty for a reason other than
   * "nothing offered yet".
   *
   * `isLoading` goes false on failure too, so a 500 or a dropped connection
   * used to arrive as "No services yet" and an invitation to add the first
   * thing you sell — to a partner who has twenty. `isPaused` is the offline
   * case: `onlineManager` (see `lib/queryClient.ts`) holds the request instead
   * of firing it into a dead radio.
   */
  const loadError = servicesQuery.isError
    ? apiErrorMessage(servicesQuery.error, t('services.list.loadFailed'))
    : servicesQuery.isPending && servicesQuery.isPaused
      ? t('services.list.noConnection')
      : null;

  const goCreate = () => {
    if (cap.atLimit) return;
    router.push('/services/create');
  };

  /**
   * The same dialog `services/[id].tsx#confirmWithdraw` asks, word for word.
   *
   * "Stop offering" is a small label on a crowded list row and it used to fire
   * on the first tap, taking a service off sale with nothing to undo it here —
   * the detail screen and `catalog/[id].tsx` both confirm first, and the list is
   * the place a mis-tap is MOST likely because the row itself is tappable.
   */
  const confirmWithdraw = (service: PartnerServiceRow) => {
    Alert.alert(
      // `service.name` is the partner's own text, interpolated untouched.
      t('services.withdraw.title', { name: service.name }),
      t('services.withdraw.body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('services.withdraw.confirm'), style: 'destructive',
          onPress: () => withdrawService.mutate(service._id, {
            // `res.message` is the server's own confirmation and is shown as it
            // arrives — see `UsageMeter.tsx` for the trade this app makes on
            // server-supplied text. Only the fallback is ours to translate.
            onSuccess: (res) => setSnackbar(res.message || t('services.withdraw.done')),
            onError: (e: unknown) => setSnackbar(apiErrorMessage(e)),
          }),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['bottom']}>
      {/* >>> WEB-UI — the whole screen scrolls as one list: the hero, usage
          bar, search and tabs are the list's header (an element, so the
          search box keeps its focus), and the services are not squeezed. */}
      <FlatList
        data={shown}
        keyExtractor={(s) => s._id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
      <Hero
        isDark={isDark}
        rounded={false}
        eyebrow={t('services.list.eyebrow')}
        headline={{ value: String(activeCount), label: t('services.list.headlineLabel') }}
        subtitle={rows.length ? t('services.list.subtitleHas') : t('services.list.subtitleEmpty')}
      >
        <GlassStat icon="format-list-bulleted" label={t('services.list.statInList')} value={String(rows.length)} />
        <GlassStat icon="archive-outline" label={t('services.list.statWithdrawn')} value={String(rows.length - activeCount)} />
      </Hero>

      <View style={styles.headerBox}>
        <ServiceUsageMeterBar cap={cap} c={c} />
      </View>

      <Searchbar
        placeholder={t('services.list.searchPlaceholder')}
        value={searchInput}
        onChangeText={setSearchInput}
        style={[styles.search, { backgroundColor: c.surfaceVariant }]}
        elevation={0}
      />

      <View style={styles.tabRow}>
        {/* `key`, not `t` — the callback parameter here was called `t` and this
            file holds a translator now; that is the shadow that has already
            broken one screen in this app. */}
        {(['on', 'off'] as Tab[]).map((key) => {
          const active = key === tab;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[styles.tabChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
            >
              <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12.5, fontWeight: '600' }}>
                {key === 'on' ? t('services.list.tabOn') : t('services.list.tabOff')}
              </Text>
            </Pressable>
          );
        })}
      </View>
          </View>
        }
        // <<< WEB-UI
        renderItem={({ item }) => (
          <ServiceCardRow
            service={item}
            canManage={canManage}
            withdrawing={withdrawService.isPending && withdrawService.variables === item._id}
            onPress={() => router.push({ pathname: '/services/[id]', params: { id: item._id } })}
            onWithdraw={() => confirmWithdraw(item)}
            c={c}
          />
        )}
        contentContainerStyle={shown.length === 0 ? styles.emptyGrow : styles.listPad}
        ListEmptyComponent={
          // >>> WEB-UI — centred in the space under the header.
          <View style={styles.emptyFill}>
          {loadError ? (
            <ErrorBlock c={c} message={loadError} onRetry={() => void servicesQuery.refetch()} />
          ) : servicesQuery.isLoading ? (
            <ActivityIndicator color={c.primary} />
          ) : (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="wrench-outline" size={30} color={c.textDisabled} />
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
                {q
                  ? t('services.list.emptyNoMatch')
                  : tab === 'off'
                    ? t('services.list.emptyAllOffered')
                    : t('services.list.emptyNone')}
              </Text>
              <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
                {tab === 'on' && !q
                  ? t('services.list.emptyFirstBody')
                  : t('services.list.emptyOtherBody')}
              </Text>
            </View>
          )}
          </View>
          // <<< WEB-UI
        }
        ListFooterComponent={
          activeCount > 0 ? (
            <Pressable onPress={() => router.push('/availability')} style={styles.footerNote}>
              <MaterialCommunityIcons name="clock-alert-outline" size={14} color={c.primary} />
              {/* Three keys, not one with markup in it: the emphasised phrase
                  sits in a different place in the Hindi sentence, so each
                  language gets its own before/after halves around the same
                  highlighted words. */}
              <Text style={[styles.footerNoteText, { color: c.textSecondary }]}>
                {t('services.list.footerBefore')}
                <Text style={{ color: c.primary, fontWeight: '600' }}>{t('services.list.footerLink')}</Text>
                {t('services.list.footerAfter')}
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
          <Text style={styles.fabText}>{t('services.list.addService')}</Text>
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
  const { t } = useTranslation();
  return (
    <View>
      <ServiceCard service={service} onPress={onPress} />
      {canManage && service.isActive && (
        <Pressable onPress={onWithdraw} disabled={withdrawing} style={styles.withdrawBtn}>
          <Text style={{ color: c.error, fontSize: 12, fontWeight: '600' }}>
            {/* `services.form.stopOffering` is the same label the service form's
                own footer button carries — one phrase for one action. */}
            {withdrawing ? t('services.list.removing') : t('services.form.stopOffering')}
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
  // >>> WEB-UI — the header is inside the list; only the empty block is centred
  // (and clear of the floating Add button).
  emptyGrow: { flexGrow: 1, paddingBottom: 90 },
  emptyFill: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  // <<< WEB-UI
  emptyBox: { alignItems: 'center', gap: 6, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  emptyBody: { fontSize: 13, textAlign: 'center' },
  withdrawBtn: { alignSelf: 'flex-end', marginRight: 22, marginTop: -8, marginBottom: 4, paddingVertical: 4, paddingHorizontal: 6 },
  footerNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 14, marginTop: 4, paddingVertical: 8 },
  footerNoteText: { fontSize: 11.5, flex: 1, lineHeight: 16 },
  fab: {
    position: 'absolute', right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: radii.pill, paddingHorizontal: 18, paddingVertical: 13, elevation: 3,
  },
  fabText: { color: '#fff', fontWeight: '600', fontSize: 13.5 },
});
