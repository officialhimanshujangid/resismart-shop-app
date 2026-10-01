import React, { useState } from 'react';
import { FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { Searchbar, Text } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { useDebouncedValue } from '../../../src/features/billing/useDebouncedValue';
import { ChipRow, EmptyBlock, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { ActionRow, PillButton } from '../../../src/features/p1/ui';
import { subKeys, subscriptionsApi } from '../../../src/features/subscriptions/api';
import { SUBSCRIPTION_KINDS, SubscriptionKind, SubscriptionStatus } from '../../../src/features/subscriptions/types';
import { HubDoor } from '../../../src/features/subscriptions/components/HubDoor';
import { SubscriptionListRow } from '../../../src/features/subscriptions/components/SubscriptionListRow';

/**
 * The subscriptions hub. The daily doors first (Today's deliveries, Mark
 * attendance). A person holding SUBSCRIPTIONS_VIEW also gets the list (search,
 * status, kind) and the set-up links; a delivery boy with only DELIVERIES_MARK
 * sees just his door — he may not read the list (the server would refuse).
 */
type StatusKey = 'ALL' | SubscriptionStatus;
type KindKey = 'ALL' | SubscriptionKind;
const LIMIT = 100;

export default function SubscriptionsHub() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { can } = usePartnerEntitlements();
  const canView = can('SUBSCRIPTIONS_VIEW', 'READ');
  const canManage = can('SUBSCRIPTIONS_MANAGE', 'FULL');
  const canMark = can('DELIVERIES_MARK', 'FULL');
  const canAttend = can('ATTENDANCE_MARK', 'FULL');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusKey>('ACTIVE');
  const [kind, setKind] = useState<KindKey>('ALL');
  const debounced = useDebouncedValue(q, 300);

  const query = {
    ...(status !== 'ALL' ? { status } : {}),
    ...(kind !== 'ALL' ? { kind } : {}),
    ...(debounced.trim() ? { q: debounced.trim() } : {}),
    limit: LIMIT,
  };
  const list = useQuery({ queryKey: subKeys.list(query), queryFn: () => subscriptionsApi.list(query), enabled: canView });
  const rows = list.data?.data ?? [];

  const header = (
    <View style={styles.header}>
      {canMark || canView ? (
        <HubDoor c={c} icon="truck-delivery-outline" title={t('p2.subscriptions.hub.deliveries')}
          body={t('p2.subscriptions.hub.deliveriesBody')} onPress={() => router.push('/subscriptions/deliveries' as Href)} testID="door-deliveries" />
      ) : null}
      {canAttend ? (
        <HubDoor c={c} icon="account-check-outline" title={t('p2.subscriptions.hub.attendance')}
          body={t('p2.subscriptions.hub.attendanceBody')} onPress={() => router.push('/subscriptions/attendance' as Href)} testID="door-attendance" />
      ) : null}
      {canView ? (
        <>
          <ActionRow>
            {canManage ? (
              <PillButton c={c} icon="plus" label={t('p2.subscriptions.hub.new')} onPress={() => router.push('/subscriptions/new' as Href)} testID="sub-new" />
            ) : null}
            <PillButton c={c} tone="outline" icon="clipboard-list-outline" label={t('p2.subscriptions.hub.plans')} onPress={() => router.push('/subscriptions/plans' as Href)} />
            <PillButton c={c} tone="outline" icon="map-marker-path" label={t('p2.subscriptions.hub.routes')} onPress={() => router.push('/subscriptions/routes' as Href)} />
            <PillButton c={c} tone="outline" icon="calendar-remove-outline" label={t('p2.subscriptions.hub.holidays')} onPress={() => router.push('/subscriptions/holidays' as Href)} />
            <PillButton c={c} tone="outline" icon="file-document-multiple-outline" label={t('p2.subscriptions.hub.bills')} onPress={() => router.push('/subscriptions/bills' as Href)} testID="sub-bills" />
          </ActionRow>
          <SectionLabel c={c}>{t('p2.subscriptions.hub.listTitle')}</SectionLabel>
          <Searchbar
            placeholder={t('p2.subscriptions.hub.search')}
            value={q}
            onChangeText={setQ}
            style={[styles.search, { backgroundColor: c.surfaceVariant }]}
            inputStyle={{ fontSize: 14 }}
            testID="sub-search"
          />
          <ChipRow<StatusKey>
            c={c}
            value={status}
            onChange={setStatus}
            options={(['ACTIVE', 'ENDED', 'ALL'] as StatusKey[]).map((k) => ({
              key: k, label: k === 'ALL' ? t('p2.common.all') : t(`p2.subscriptions.status.${k}`),
            }))}
          />
          <ChipRow<KindKey>
            c={c}
            value={kind}
            onChange={setKind}
            options={(['ALL', ...SUBSCRIPTION_KINDS] as KindKey[]).map((k) => ({
              key: k, label: k === 'ALL' ? t('p2.common.all') : t(`p2.subscriptions.kind.${k}`),
            }))}
          />
        </>
      ) : null}
    </View>
  );

  const empty = !canView ? null
    : list.isPending ? <Loading c={c} />
      : list.isError ? <ErrorBlock c={c} message={apiErrorMessage(list.error, t('p2.common.loadFailed'))} onRetry={() => void list.refetch()} />
        : <EmptyBlock c={c} icon="calendar-sync-outline" title={t('p2.subscriptions.hub.empty')} body={canManage ? t('p2.subscriptions.hub.emptyBody') : undefined} />;

  return (
    <Screen c={c} title={t('p2.subscriptions.hub.title')} scroll={false}>
      <FlatList
        data={canView ? rows : []}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={Gap}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <SubscriptionListRow c={c} row={item} onPress={() => router.push(`/subscriptions/${item.id}` as Href)} />
        )}
        ListFooterComponent={canView && (list.data?.total ?? 0) > rows.length ? (
          <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 10 }}>
            {t('p2.common.showing', { shown: rows.length, total: list.data?.total ?? 0 })}
          </Text>
        ) : null}
      />
    </Screen>
  );
}

function Gap() { return <View style={{ height: 8 }} />; }

const styles = StyleSheet.create({
  header: { gap: 10, marginBottom: 10 },
  list: { padding: 16, paddingBottom: 40 },
  search: { borderRadius: radii.field, elevation: 0 },
});
