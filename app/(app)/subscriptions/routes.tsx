import React, { useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { ActionRow, PillButton } from '../../../src/features/p1/ui';
import { Pill } from '../../../src/features/p2/ui';
import { subKeys, subscriptionsApi } from '../../../src/features/subscriptions/api';
import type { DeliveryRoute, RouteKind } from '../../../src/features/subscriptions/types';
import { RouteSheet } from '../../../src/features/subscriptions/components/RouteSheet';
import { RouteOrderSheet } from '../../../src/features/subscriptions/components/RouteOrderSheet';

/**
 * Routes (the delivery rounds) and classes (tuition batches). A route in use by
 * a running subscription cannot be deleted (409 ROUTE_IN_USE) — switch it off
 * instead; two with the same name are refused (409 ROUTE_NAME_TAKEN).
 */
export default function RoutesScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { can } = usePartnerEntitlements();
  const canManage = can('SUBSCRIPTIONS_MANAGE', 'FULL');
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<{ kind: RouteKind; route: DeliveryRoute | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ordering, setOrdering] = useState<DeliveryRoute | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const routes = useQuery({ queryKey: subKeys.routes(), queryFn: subscriptionsApi.routes });
  const refresh = () => { void qc.invalidateQueries({ queryKey: subKeys.routes() }); };
  const save = useMutation({
    mutationFn: (v: { name: string; timeText?: string; isActive: boolean }) => (sheet?.route
      ? subscriptionsApi.updateRoute(sheet.route._id, v)
      : subscriptionsApi.createRoute({ kind: sheet?.kind ?? 'ROUTE', ...v })),
    onSuccess: () => { setSheet(null); refresh(); },
    onError: (e) => setError(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });
  const remove = useMutation({
    mutationFn: (r: DeliveryRoute) => subscriptionsApi.deleteRoute(r._id),
    onSuccess: () => { setToast(t('p2.subscriptions.routes.deleted')); refresh(); },
    onError: (e) => setToast(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });

  const saveOrder = useMutation({
    mutationFn: (ids: string[]) => subscriptionsApi.orderRoute(ordering?._id ?? '', ids),
    onSuccess: () => {
      setOrdering(null);
      setToast(t('p2.subscriptions.routes.orderSaved'));
      void qc.invalidateQueries({ queryKey: subKeys.all() });
    },
    onError: (e) => setOrderError(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });

  const confirmDelete = (r: DeliveryRoute) => Alert.alert(t('p2.subscriptions.routes.deleteTitle'), t('p2.subscriptions.routes.deleteBody', { name: r.name }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate(r) },
  ]);

  const all = routes.data ?? [];
  const section = (kind: RouteKind) => {
    const list = all.filter((r) => r.kind === kind);
    return (
      <View style={{ gap: 8 }}>
        <SectionLabel c={c}>{t(`p2.subscriptions.routes.section.${kind}`)}</SectionLabel>
        {canManage ? (
          <ActionRow>
            <PillButton c={c} tone="outline" icon="plus" label={t(`p2.subscriptions.routes.sheet.add.${kind}`)}
              onPress={() => { setError(null); setSheet({ kind, route: null }); }} testID={`route-add-${kind}`} />
          </ActionRow>
        ) : null}
        {list.length === 0 ? <Text style={{ color: c.textSecondary }}>{t(`p2.subscriptions.routes.empty.${kind}`)}</Text> : null}
        {list.map((r) => (
          <View key={r._id} style={[styles.row, { backgroundColor: c.surface, borderColor: c.divider, opacity: r.isActive ? 1 : 0.6 }]} testID={`route-${r._id}`}>
            <View style={styles.top}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{r.name}</Text>
                {r.timeText ? <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>{r.timeText}</Text> : null}
              </View>
              <Pill c={c} tone={r.isActive ? 'good' : 'neutral'} label={r.isActive ? t('p2.subscriptions.routes.on') : t('p2.subscriptions.routes.off')} />
            </View>
            <ActionRow>
              {kind === 'ROUTE' ? (
                <PillButton c={c} tone="outline" icon="truck-delivery-outline" label={t('p2.subscriptions.routes.openSheet')}
                  onPress={() => router.push(`/subscriptions/deliveries?routeId=${r._id}` as Href)} />
              ) : (
                <PillButton c={c} tone="outline" icon="account-check-outline" label={t('p2.subscriptions.hub.attendance')}
                  onPress={() => router.push(`/subscriptions/attendance?batchId=${r._id}` as Href)} />
              )}
              {canManage ? (
                <>
                  {kind === 'ROUTE' ? (
                    <PillButton c={c} tone="outline" icon="sort" label={t('p2.subscriptions.routes.order')}
                      onPress={() => { setOrderError(null); setOrdering(r); }} testID={`route-order-${r._id}`} />
                  ) : null}
                  <PillButton c={c} tone="outline" icon="pencil-outline" label={t('p2.subscriptions.routes.editShort')}
                    onPress={() => { setError(null); setSheet({ kind, route: r }); }} testID={`route-edit-${r._id}`} />
                  <PillButton c={c} tone="danger" icon="delete-outline" label={t('common.delete')} onPress={() => confirmDelete(r)}
                    disabled={remove.isPending} testID={`route-delete-${r._id}`} />
                </>
              ) : null}
            </ActionRow>
          </View>
        ))}
      </View>
    );
  };

  return (
    <Screen
      c={c}
      title={t('p2.subscriptions.routes.title')}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      {routes.isPending ? <Loading c={c} />
        : routes.isError ? <ErrorBlock c={c} message={apiErrorMessage(routes.error, t('p2.common.loadFailed'))} onRetry={() => void routes.refetch()} />
          : (
            <>
              {section('ROUTE')}
              {section('BATCH')}
            </>
          )}
      <RouteOrderSheet
        route={ordering}
        onDismiss={() => setOrdering(null)}
        submitting={saveOrder.isPending}
        error={orderError}
        onSubmit={(ids) => saveOrder.mutate(ids)}
      />
      <RouteSheet
        visible={!!sheet}
        kind={sheet?.kind ?? 'ROUTE'}
        route={sheet?.route ?? null}
        onDismiss={() => setSheet(null)}
        submitting={save.isPending}
        error={error}
        onSubmit={(v) => save.mutate(v)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '700' },
});
