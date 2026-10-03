import React, { useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { IconButton, Snackbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { radii, themeColors } from '../../../src/constants/colors';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { formatPaise } from '../../../src/lib/money';
import { EmptyBlock, ErrorBlock, Loading } from '../../../src/features/more/ui';
import { ActionRow, PillButton } from '../../../src/features/p1/ui';
import { HelpButton } from '../../../src/features/help/HelpButton';
import { ORDER_STATUS_LABEL_KEYS } from '../../../src/features/orders/backend-mirror';
import type { PartnerOrder } from '../../../src/features/orders/types';
import { useCommerceAccess } from '../../../src/features/commerce/access';
import { fulfilmentApi } from '../../../src/features/commerce/fulfilmentApi';
import { slotText } from '../../../src/features/commerce/format';
import { CommerceHint, NoAccess, Tag } from '../../../src/features/commerce/components/ui';
import { DeliverProofSheet } from '../../../src/features/commerce/components/FulfilmentSheets';
// >>> GAP-C-SHOP
import { needsProof, proofNeededKey } from '../../../src/features/commerce/fulfilmentLogic';
// <<< GAP-C-SHOP

const KEY = ['commerce', 'myDeliveries'] as const;

/**
 * "My deliveries" (C2, B-3) — the rider's own list: only orders given to them,
 * nearest slot first. Two big buttons per order: Out for delivery, Delivered
 * (with the customer's code or a photo when the shop asks for proof).
 */
export default function MyDeliveriesScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const access = useCommerceAccess();
  const client = useQueryClient();
  const list = useQuery({ queryKey: KEY, queryFn: () => fulfilmentApi.myDeliveries({ limit: 50 }), enabled: access.deliveries.canDeliver });
  const [busy, setBusy] = useState<string | null>(null);
  const [proofFor, setProofFor] = useState<PartnerOrder | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => { void client.invalidateQueries({ queryKey: KEY }); void client.invalidateQueries({ queryKey: ['orders'] }); };

  const dispatch = async (o: PartnerOrder) => {
    setBusy(o.id);
    try {
      await fulfilmentApi.dispatch(o.id);
      setNotice(t('commerce.fulfilment.onTheWay', { code: o.code }));
      refresh();
    } catch (e) {
      setNotice(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const deliver = async (o: PartnerOrder) => {
    // >>> GAP-C-SHOP — each row carries the shop's rule (`delivery.proofMode`): ask for the code / photo
    // straight away instead of trying without it first. NONE (or no rule sent) = deliver now.
    if (needsProof(o.delivery?.proofMode, o)) { setProofFor(o); return; }
    // <<< GAP-C-SHOP
    setBusy(o.id);
    try {
      await fulfilmentApi.deliver(o.id, {});
      setNotice(t('commerce.fulfilment.deliveredToast', { code: o.code }));
      refresh();
    } catch (e) {
      // The rule changed since the list loaded (or was not sent): the code or a photo, then deliver again.
      if (apiErrorCode(e) === 'DELIVERY_PROOF_REQUIRED') setProofFor(o);
      else setNotice(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const rows = list.data?.data ?? [];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <View style={styles.header}>
        <IconButton icon="chevron-left" size={26} onPress={() => router.back()} accessibilityLabel={t('common.back')} style={{ margin: 0 }} />
        <Text style={{ flex: 1, textAlign: 'center', color: c.textPrimary, fontSize: 17, fontWeight: '600' }}>{t('commerce.fulfilment.myDeliveries')}</Text>
        <HelpButton c={c} />
      </View>
      {!access.deliveries.canDeliver ? (
        <View style={styles.body}><NoAccess c={c} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={c.primary} />}
        >
          <View style={styles.wrap}>
            <CommerceHint c={c} helpKey="deliveries" />
            {list.isPending ? <Loading c={c} /> : null}
            {list.isError ? <ErrorBlock c={c} message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} /> : null}
            {list.isSuccess && rows.length === 0 ? (
              <EmptyBlock c={c} icon="moped-outline" title={t('commerce.fulfilment.noDeliveries')} body={t('commerce.fulfilment.noDeliveriesBody')} />
            ) : null}
            {rows.map((o) => {
              const where = [o.customer.flatLabel, o.customer.societyName].filter(Boolean).join(', ');
              const canDispatch = o.allowedVerbs.includes('dispatch');
              const canDeliverNow = o.allowedVerbs.includes('deliver');
              // GAP-C-SHOP: what hand-over will ask for — nothing at all when the shop needs no proof.
              const proofKey = o.deliveryMode === 'DELIVERY' ? proofNeededKey(o.delivery?.proofMode) : null;
              return (
                <View key={o.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]} testID={`delivery-${o.id}`}>
                  <View style={styles.cardHead}>
                    <Text style={{ color: c.textPrimary, fontWeight: '800', fontSize: 16, flex: 1 }}>{o.code}</Text>
                    <Tag c={c} tone={o.status === 'OUT_FOR_DELIVERY' ? 'info' : 'neutral'} label={t(ORDER_STATUS_LABEL_KEYS[o.status])} />
                  </View>
                  <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>{o.customer.name}</Text>
                  {where ? <Text style={{ color: c.textSecondary }} numberOfLines={2}>{where}</Text> : null}
                  {o.deliverySlot ? <Text style={{ color: c.info, fontWeight: '600', fontSize: 13 }}>{slotText(o.deliverySlot, t)}</Text> : null}
                  <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>
                    {t('commerce.fulfilment.deliveryMeta', { count: o.itemCount, amount: formatPaise(o.amounts.totalPaise) })}
                  </Text>
                  {/* >>> GAP-C-SHOP */}
                  {proofKey ? (
                    <View style={styles.proof} testID={`proof-needed-${o.id}`}>
                      <MaterialCommunityIcons name="shield-check-outline" size={16} color={c.warning} />
                      <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 }}>{t(proofKey)}</Text>
                    </View>
                  ) : null}
                  {/* <<< GAP-C-SHOP */}
                  <ActionRow>
                    {o.customer.phone && !o.customer.contactMasked ? (
                      <PillButton c={c} tone="outline" icon="phone" label={t('commerce.fulfilment.call')} onPress={() => void Linking.openURL(`tel:${o.customer.phone}`)} />
                    ) : null}
                    {canDispatch ? (
                      <PillButton c={c} icon="moped" label={t('commerce.fulfilment.outForDelivery')} onPress={() => void dispatch(o)} disabled={busy === o.id} testID={`dispatch-${o.id}`} />
                    ) : null}
                    {canDeliverNow ? (
                      <PillButton c={c} icon="check-circle-outline" label={t('commerce.fulfilment.delivered')} onPress={() => void deliver(o)} disabled={busy === o.id} testID={`deliver-${o.id}`} />
                    ) : null}
                  </ActionRow>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
      {proofFor ? (
        <DeliverProofSheet
          order={proofFor}
          mode={proofFor.delivery?.proofMode}
          onDismiss={() => setProofFor(null)}
          onDone={(o) => { setNotice(t('commerce.fulfilment.deliveredToast', { code: o.code })); refresh(); }}
        />
      ) : null}
      <Snackbar visible={!!notice} onDismiss={() => setNotice(null)} duration={3000}>{notice}</Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 4 },
  body: { padding: 16, paddingBottom: 40 },
  wrap: { gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  proof: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
