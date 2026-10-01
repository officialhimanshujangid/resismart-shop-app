import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Switch, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { ReorderRow, stockApi } from '../../../src/features/stock/api';
import { buildReorderRequest, initialPicks, ReorderPick } from '../../../src/features/stock/reorderLogic';
import { ReorderRowCard } from '../../../src/features/stock/components/ReorderRowCard';
import { ReorderSettingsDialog } from '../../../src/features/stock/components/ReorderSettingsDialog';
import { SupplierPickerDialog } from '../../../src/features/purchases/components/SupplierPickerDialog';
import { EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { ActionRow, Banner, PillButton, useIsWide } from '../../../src/features/p1/ui';

/**
 * The reorder list → purchase orders (screen S12, and where a low-stock push
 * lands — S13). Everything low is ticked with the server's suggested quantity
 * and its preferred supplier; the partner adjusts, then one tap drafts ONE
 * purchase order per supplier (`POST /reorder/purchase-orders`).
 */
export default function ReorderScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const wide = useIsWide();
  const queryClient = useQueryClient();
  const { can, hasModule } = usePartnerEntitlements();
  const canOrder = hasModule('INVOICING') && can('PURCHASES_MANAGE', 'FULL');
  const canSettings = can('STOCK_MANAGE', 'FULL');
  const [includeAll, setIncludeAll] = useState(false);

  const list = useQuery({
    queryKey: qk.stock.reorder({ includeAll: includeAll ? 'true' : 'false' }),
    queryFn: () => stockApi.reorder({ includeAll: includeAll ? 'true' : 'false', limit: 200 }),
  });
  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const [picks, setPicks] = useState<Record<string, ReorderPick>>({});
  useEffect(() => { setPicks((cur) => ({ ...initialPicks(rows), ...cur })); }, [rows]);

  const [supplierFor, setSupplierFor] = useState<string | null>(null);
  const [settingsFor, setSettingsFor] = useState<ReorderRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const req = useMemo(() => buildReorderRequest(rows, picks), [rows, picks]);
  const intentKey = useRef<string | null>(null);
  useEffect(() => { intentKey.current = null; }, [req]);

  const create = useMutation({
    mutationFn: () => {
      if (!intentKey.current) intentKey.current = newIdempotencyKey('reorder');
      return stockApi.createPurchaseOrders({ lines: req.lines }, intentKey.current);
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: qk.billing.all() });
      void queryClient.invalidateQueries({ queryKey: qk.stock.all() });
      const names = res.purchaseOrders.map((p) => p.partyName).join(', ');
      Alert.alert(
        t('stock.reorder.createdTitle', { count: res.purchaseOrders.length }),
        t('stock.reorder.createdBody', { names }),
        [
          { text: t('stock.reorder.openPurchases'), onPress: () => router.replace('/purchases') },
          ...(res.purchaseOrders.length === 1
            ? [{ text: t('stock.reorder.openPo'), onPress: () => router.replace({ pathname: '/billing/[id]', params: { id: res.purchaseOrders[0].id } }) }]
            : []),
        ],
      );
    },
    onError: (e) => setToast(apiErrorMessage(e, t('stock.reorder.createFailed'))),
  });

  const saveSettings = useMutation({
    mutationFn: (body: Parameters<typeof stockApi.reorderSettings>[1]) => stockApi.reorderSettings(settingsFor!.productId, body),
    onSuccess: () => { setSettingsFor(null); void queryClient.invalidateQueries({ queryKey: qk.stock.all() }); },
    onError: (e) => setToast(apiErrorMessage(e, t('stock.reorder.settingsFailed'))),
  });

  const title = t('stock.reorder.title');
  const selectedCount = req.lines.length + req.missingSupplier.length;

  return (
    <Screen
      c={c}
      title={title}
      subtitle={t('stock.reorder.subtitle')}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      <View style={styles.toggle}>
        <Text style={{ color: c.textSecondary, flex: 1 }}>{t('stock.reorder.includeAll')}</Text>
        <Switch value={includeAll} onValueChange={setIncludeAll} accessibilityLabel={t('stock.reorder.includeAll')} />
      </View>
      {list.isPending ? (
        <Loading c={c} />
      ) : list.isError ? (
        <ErrorBlock c={c} message={apiErrorMessage(list.error, t('stock.reorder.loadFailed'))} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBlock c={c} icon="check-circle-outline" title={t('stock.reorder.emptyTitle')} body={t('stock.reorder.emptyBody')} />
      ) : (
        <>
          {req.missingSupplier.length > 0 && (
            <Banner c={c} tone="warn" body={t('errors.REORDER_NEEDS_SUPPLIER', { productName: req.missingSupplier[0] })} testID="reorder-missing" />
          )}
          <View style={[styles.grid, wide && styles.gridWide]}>
            {rows.map((r) => (
              <View key={r.productId} style={wide ? styles.cellWide : undefined}>
                <ReorderRowCard
                  c={c}
                  row={r}
                  pick={picks[r.productId] ?? { qty: r.suggestedQty, supplier: r.preferredSupplier, selected: true }}
                  onChange={(next) => setPicks((p) => ({ ...p, [r.productId]: next }))}
                  onPickSupplier={() => setSupplierFor(r.productId)}
                  onSettings={canSettings ? () => setSettingsFor(r) : undefined}
                />
              </View>
            ))}
          </View>
          {canOrder && (
            <ActionRow>
              <PillButton
                c={c}
                icon="file-document-edit-outline"
                label={create.isPending ? t('p1.saving') : t('stock.reorder.create', { count: req.supplierCount })}
                disabled={!req.lines.length || req.missingSupplier.length > 0 || create.isPending}
                onPress={() => create.mutate()}
                testID="reorder-create"
              />
            </ActionRow>
          )}
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('stock.reorder.selected', { count: selectedCount })}</Text>
        </>
      )}

      <SupplierPickerDialog
        visible={!!supplierFor}
        onDismiss={() => setSupplierFor(null)}
        onPick={(s) => {
          if (supplierFor && s) setPicks((p) => ({ ...p, [supplierFor]: { ...(p[supplierFor] ?? { qty: 1, selected: true }), supplier: s } }));
          setSupplierFor(null);
        }}
      />
      <ReorderSettingsDialog
        row={settingsFor}
        supplier={settingsFor ? picks[settingsFor.productId]?.supplier : undefined}
        submitting={saveSettings.isPending}
        onCancel={() => setSettingsFor(null)}
        onSubmit={(body) => saveSettings.mutate(body)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grid: { gap: 10 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  cellWide: { width: '49%' },
});
