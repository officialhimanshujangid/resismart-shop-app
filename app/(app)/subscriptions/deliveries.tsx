import React, { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { useAuth } from '../../../src/context/AuthContext';
import { apiErrorMessage } from '../../../src/api/axios';
import { EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { ActionRow, Banner, PillButton } from '../../../src/features/p1/ui';
import { ChoiceChips, DayStepper } from '../../../src/features/p2/ui';
import { istToday } from '../../../src/features/p2/dates';
import { useModuleSettings } from '../../../src/features/p2/useCategoryModules';
import { subKeys, subscriptionsApi } from '../../../src/features/subscriptions/api';
import { useMarkQueue } from '../../../src/features/subscriptions/useMarkQueue';
import { PendingMark, RefusedOp, allPendingFor, pendingMarksFor } from '../../../src/features/subscriptions/markQueue';
import {
  ViewRow, clampDay, markMinDay, notDeliveredAction, overlayRows, qtyChanges, sheetCounts,
} from '../../../src/features/subscriptions/logic';
import { DeliveryRow } from '../../../src/features/subscriptions/components/DeliveryRow';
import { DeliveryCounts } from '../../../src/features/subscriptions/components/DeliveryCounts';
import { Rise } from '../../../src/theme/motion'; // M22
import { LoadingList } from '../../../src/features/subscriptions/components/LoadingList';

/**
 * Today's delivery round (S-priority). Built for a delivery boy holding only
 * DELIVERIES_MARK: pick the day (back `markBackDays`, never ahead) and the
 * route, then walk the list in order — one tap on a row marks it delivered.
 * Every mark is kept on the phone first and sent when there is signal
 * (`useMarkQueue`), so a lane with no network loses nothing; a mark still on the
 * phone shows "⏳".
 */
type Confirmed = PendingMark & { at: number };

export default function DeliveriesScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const params = useLocalSearchParams<{ routeId?: string; day?: string }>();
  const { can } = usePartnerEntitlements();
  const { profile } = useAuth();
  const canMark = can('DELIVERIES_MARK', 'FULL');
  const { settings } = useModuleSettings();
  const today = istToday();
  const minDay = markMinDay(today, settings.subscriptions.markBackDays);
  const [day, setDay] = useState(() => clampDay(params.day, minDay, today));
  const [routeId, setRouteId] = useState<string>(typeof params.routeId === 'string' ? params.routeId : '');
  const [confirmed, setConfirmed] = useState<Map<string, Confirmed>>(() => new Map());
  const [allDoneAt, setAllDoneAt] = useState<Map<string, number>>(() => new Map());
  const qc = useQueryClient();

  const routes = useQuery({ queryKey: subKeys.routes(), queryFn: subscriptionsApi.routes });
  const routeList = (routes.data ?? []).filter((r) => r.kind === 'ROUTE' && r.isActive);
  const sheet = useQuery({ queryKey: subKeys.sheet(day, routeId), queryFn: () => subscriptionsApi.sheet(day, routeId || undefined) });

  const queue = useMarkQueue(profile?.tenantId, (op) => {
    const at = Date.now();
    if (op?.kind === 'MARK') {
      setConfirmed((prev) => {
        const next = new Map(prev);
        for (const e of op.entries) next.set(`${op.day}|${e.subscriptionId}`, { status: e.status, qty: e.qty, local: false, at });
        return next;
      });
    } else if (op?.kind === 'ALL') {
      setAllDoneAt((prev) => new Map(prev).set(`${op.day}|${op.routeId}`, at));
    }
    void qc.invalidateQueries({ queryKey: ['p2', 'subscriptions', 'sheet'] });
  });

  const fetchedAt = sheet.dataUpdatedAt;
  const rows: ViewRow[] = useMemo(() => {
    const done = new Map<string, PendingMark>();
    for (const [k, v] of confirmed) {
      const [d, id] = k.split('|');
      if (d === day && v.at > fetchedAt) done.set(id, v);
    }
    const allWaiting = allPendingFor(queue.state, day, routeId || undefined)
      || (!!routeId && (allDoneAt.get(`${day}|${routeId}`) ?? 0) > fetchedAt);
    return overlayRows(sheet.data?.rows ?? [], pendingMarksFor(queue.state, day), allWaiting, done);
  }, [sheet.data, queue.state, day, routeId, confirmed, allDoneAt, fetchedAt]);
  const counts = sheetCounts(rows);

  const mark = (v: ViewRow, status: 'DELIVERED' | 'NOT_DELIVERED' | 'EXTRA', qty?: { lineKey: string; qty: number }[]) =>
    queue.mark(day, { subscriptionId: v.row.subscriptionId, status, ...(qty ? { qty } : {}) });

  const onNotDelivered = (v: ViewRow) => {
    const a = notDeliveredAction(v);
    if (a.kind === 'UNQUEUE') queue.unmark(day, v.row.subscriptionId);
    else mark(v, a.status);
  };

  const confirmAll = () => {
    if (!routeId) return;
    const name = routeList.find((r) => r._id === routeId)?.name ?? '';
    Alert.alert(
      t('p2.subscriptions.deliveries.allTitle'),
      t('p2.subscriptions.deliveries.allBody', { count: counts.due, route: name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('p2.subscriptions.deliveries.allDelivered'), onPress: () => queue.markAll(day, routeId) },
      ],
    );
  };

  // Name the home a refused mark was for, when it is on this sheet.
  const refusedLine = (r: RefusedOp) => {
    const id = r.op.kind === 'MARK' && r.op.entries.length === 1 ? r.op.entries[0].subscriptionId : null;
    const row = id ? sheet.data?.rows.find((x) => x.subscriptionId === id) : undefined;
    return row ? `${row.flatLabel || row.customerName}: ${r.message}` : r.message;
  };

  const routeName = routeList.find((r) => r._id === routeId)?.name;
  const header = (
    <View style={styles.header}>
      <DayStepper c={c} day={day} onChange={setDay} min={minDay} max={today} testID="delivery-day" />
      {routeList.length > 0 ? (
        <ChoiceChips
          c={c}
          testID="route-chips"
          options={[{ key: '', label: t('p2.common.all') }, ...routeList.map((r) => ({ key: r._id, label: r.name }))]}
          value={[routeId]}
          onChange={(v) => setRouteId(v[0] ?? '')}
        />
      ) : null}
      {!canMark ? <Banner c={c} body={t('p2.subscriptions.deliveries.viewOnly')} /> : null}
      {queue.unsent > 0 && !queue.online ? (
        <Banner c={c} tone="warn" body={t('p2.subscriptions.deliveries.waiting', { count: queue.unsent })} testID="marks-waiting" />
      ) : null}
      {queue.error ? <Banner c={c} tone="error" body={queue.error} testID="mark-queue-error" /> : null}
      {queue.refused.map((r, i) => (
        <Banner key={`${r.op.day}-${i}`} c={c} tone="warn" testID="mark-refused"
          title={t('p2.subscriptions.deliveries.refusedTitle')} body={refusedLine(r)} />
      ))}
      {queue.unsent > 0 || queue.refused.length > 0 ? (
        <ActionRow>
          {queue.unsent > 0 ? (
            <PillButton c={c} tone="outline" icon="cloud-upload-outline" label={t('p2.subscriptions.deliveries.sendNow', { count: queue.unsent })}
              onPress={() => void queue.sendNow()} disabled={queue.flushing} testID="send-now" />
          ) : null}
          {queue.refused.length > 0 ? (
            <PillButton c={c} tone="outline" icon="check" label={t('common.ok')} onPress={queue.clearRefused} testID="refused-ok" />
          ) : null}
        </ActionRow>
      ) : null}
      {sheet.data ? <LoadingList c={c} items={sheet.data.loadingList ?? []} /> : null}
    </View>
  );

  const empty = sheet.isPending ? <Loading c={c} skeleton={5} />
    : sheet.isError ? (
      <ErrorBlock c={c} message={apiErrorMessage(sheet.error, t('p2.subscriptions.deliveries.loadFailed'))} onRetry={() => void sheet.refetch()} />
    ) : <EmptyBlock c={c} icon="truck-outline" title={t('p2.subscriptions.deliveries.empty')} />;

  return (
    <Screen c={c} title={t('p2.subscriptions.deliveries.title')} subtitle={routeName} scroll={false}>
      <FlatList
        data={rows}
        keyExtractor={(v) => v.row.subscriptionId}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={Gap}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshing={sheet.isRefetching}
        onRefresh={() => void sheet.refetch()}
        initialNumToRender={10}
        windowSize={9}
        renderItem={({ item, index }) => (
          // M22 — the first screenful rises in (keyed per day, so a new day's sheet rises too).
          <Rise key={`${day}-${item.row.subscriptionId}`} index={index < 8 ? Math.min(index, 6) : 0}>
          <DeliveryRow
            c={c}
            v={item}
            disabled={!canMark}
            onTap={() => mark(item, 'DELIVERED')}
            onNotDelivered={() => onNotDelivered(item)}
            onDeliveredAnyway={() => mark(item, 'DELIVERED')}
            onSaveQty={(edited) => mark(item, item.state === 'EXTRA' ? 'EXTRA' : 'DELIVERED', qtyChanges(item.lines, edited))}
          />
          </Rise>
        )}
      />
      {sheet.data ? (
        <DeliveryCounts c={c} counts={counts} onAllDelivered={canMark && routeId ? confirmAll : undefined} />
      ) : null}
    </Screen>
  );
}

function Gap() { return <View style={{ height: 10 }} />; }

const styles = StyleSheet.create({
  header: { gap: 10, marginBottom: 10 },
  list: { padding: 12, paddingBottom: 24 },
});
