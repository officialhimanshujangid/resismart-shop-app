import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { Banner, PillButton } from '../../p1/ui';
import { Sheet } from '../../p2/ui';
import { istToday } from '../../p2/dates';
import { subKeys, subscriptionsApi } from '../api';
import { initialOrder, moveItem } from '../logic';
import type { DeliveryRoute, SubscriptionRow } from '../types';

/**
 * The walking order of one route: its running subscriptions, first stop at the
 * top, each moved with ▲ / ▼ (48dp). Save sends the whole order
 * (`PUT /routes/:id/order`); the delivery sheet then lists homes in it.
 */
export function RouteOrderSheet({
  route, onDismiss, submitting, error, onSubmit,
}: {
  route: DeliveryRoute | null; onDismiss: () => void; submitting: boolean; error?: string | null;
  onSubmit: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const routeId = route?._id ?? '';
  const query = { routeId, status: 'ACTIVE' as const, limit: 200 };
  // The route's own stops in walking order (a newer server); null = not there (404) → old way.
  const stops = useQuery({ queryKey: [...subKeys.routes(), routeId, 'stops'], queryFn: () => subscriptionsApi.routeStops(routeId), enabled: !!route });
  const fallback = !!route && stops.isSuccess && stops.data === null;
  const list = useQuery({ queryKey: subKeys.list(query), queryFn: () => subscriptionsApi.list(query), enabled: fallback });
  const today = istToday();
  // Today's sheet is already in walking order: the fallback when the list has no routeSeq.
  const sheet = useQuery({ queryKey: subKeys.sheet(today, routeId), queryFn: () => subscriptionsApi.sheet(today, routeId), enabled: fallback });
  const [order, setOrder] = useState<string[]>([]);

  const stopRows: SubscriptionRow[] = (stops.data ?? []).map((s) => ({
    id: s.subscriptionId, code: s.code, customerName: s.customerName, ...(s.flatLabel ? { flatLabel: s.flatLabel } : {}), routeSeq: s.order,
  }) as SubscriptionRow);
  const rows = fallback ? (list.data?.data ?? []) : stopRows;
  const ready = fallback ? list.isSuccess && (sheet.isSuccess || sheet.isError) : stops.isSuccess;
  useEffect(() => {
    if (!ready) return;
    setOrder(initialOrder(rows, (sheet.data?.rows ?? []).map((r) => r.subscriptionId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stops.dataUpdatedAt, list.dataUpdatedAt, sheet.dataUpdatedAt]);

  const byId = new Map<string, SubscriptionRow>(rows.map((r) => [r.id, r]));
  return (
    <Sheet
      visible={!!route}
      onDismiss={onDismiss}
      title={t('p2.subscriptions.routes.orderTitle', { name: route?.name ?? '' })}
      testID="route-order-sheet"
      footer={(
        <PillButton c={c} icon="content-save" label={submitting ? t('common.saving') : t('common.save')}
          onPress={() => onSubmit(order)} disabled={submitting || !order.length} testID="route-order-save" />
      )}
    >
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.subscriptions.routes.orderHelp')}</Text>
      {list.isError || stops.isError ? <Banner c={c} tone="error" body={apiErrorMessage(list.error ?? stops.error, t('p2.common.loadFailed'))} /> : null}
      {ready && !order.length ? <Text style={{ color: c.textSecondary }}>{t('p2.subscriptions.routes.orderEmpty')}</Text> : null}
      {order.map((id, i) => {
        const r = byId.get(id);
        if (!r) return null;
        return (
          <View key={id} style={[styles.row, { backgroundColor: c.surface, borderColor: c.divider }]} testID={`order-${id}`}>
            <Text style={[styles.pos, { color: c.textSecondary }]}>{i + 1}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: c.textPrimary, fontWeight: '700' }} numberOfLines={1}>{r.flatLabel || r.customerName}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>{[r.flatLabel ? r.customerName : null, r.code].filter(Boolean).join(' · ')}</Text>
            </View>
            <Pressable onPress={() => setOrder((o) => moveItem(o, i, -1))} disabled={i === 0} accessibilityRole="button"
              accessibilityLabel={t('p2.subscriptions.routes.up', { name: r.flatLabel || r.customerName })} testID={`order-up-${id}`}
              style={[styles.btn, { borderColor: c.divider, opacity: i === 0 ? 0.35 : 1 }]}>
              <MaterialCommunityIcons name="arrow-up" size={22} color={c.primary} />
            </Pressable>
            <Pressable onPress={() => setOrder((o) => moveItem(o, i, 1))} disabled={i === order.length - 1} accessibilityRole="button"
              accessibilityLabel={t('p2.subscriptions.routes.down', { name: r.flatLabel || r.customerName })} testID={`order-down-${id}`}
              style={[styles.btn, { borderColor: c.divider, opacity: i === order.length - 1 ? 0.35 : 1 }]}>
              <MaterialCommunityIcons name="arrow-down" size={22} color={c.primary} />
            </Pressable>
          </View>
        );
      })}
      {error ? <Banner c={c} tone="error" body={error} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 10, paddingVertical: 4 },
  pos: { width: 22, fontWeight: '700', textAlign: 'center' },
  btn: { width: 48, height: 48, borderRadius: radii.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
