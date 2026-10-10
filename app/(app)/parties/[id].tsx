import React, { useState } from 'react';
import { Alert, FlatList, Linking, StyleSheet, useColorScheme, View } from 'react-native';
import { IconButton, Snackbar, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { partiesApi, PartyLedgerEntry } from '../../../src/api/parties.api';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { Card, EmptyBlock, ErrorBlock, Loading, Row, Screen } from '../../../src/features/more/ui';
import { formatI18nDate } from '../../../src/i18n';
import { KhataPanel } from '../../../src/features/khata/components/KhataPanel';
import { SupplierPanel } from '../../../src/features/purchases/components/SupplierPanel';
import { TwoPane } from '../../../src/features/p1/ui';
import { Rise, useCountUp } from '../../../src/theme/motion';
import { StatusBadge } from '../../../src/components/ui';

export default function PartyDetailScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can, hasModule } = usePartnerEntitlements();
  const canManage = can('CUSTOMERS', 'FULL');
  // M21: merging moves money between khatas — the same two rights the server asks for.
  const canMerge = canManage && can('INVOICING_MANAGE', 'FULL');
  const [toast, setToast] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [recomputing, setRecomputing] = useState(false);

  const party = useQuery({
    queryKey: qk.parties.detail(id),
    queryFn: () => partiesApi.getOne(id),
  });

  const ledger = useQuery({
    queryKey: [...qk.parties.detail(id), 'ledger'],
    queryFn: () => partiesApi.ledger(id),
    enabled: Boolean(party.data),
  });

  const deactivate = useMutation({
    mutationFn: () => partiesApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.parties.all() });
      router.back();
    },
    onError: (err) => Alert.alert(t('parties.detail.hideFailed'), apiErrorMessage(err)),
  });

  const recompute = async () => {
    setRecomputing(true);
    try {
      const result = await partiesApi.recompute(id);
      void queryClient.invalidateQueries({ queryKey: qk.parties.detail(id) });
      void queryClient.invalidateQueries({ queryKey: [...qk.parties.detail(id), 'ledger'] });
      Alert.alert(
        t('parties.detail.rebuiltTitle'),
        result.driftPaise === 0
          ? t('parties.detail.rebuiltMatched')
          : t('parties.detail.rebuiltDrift', {
            drift: formatPaise(Math.abs(result.driftPaise)),
            balance: formatPaise(result.outstandingPaise),
          }),
      );
    } catch (err) {
      Alert.alert(t('parties.detail.rebuildFailed'), apiErrorMessage(err));
    } finally {
      setRecomputing(false);
    }
  };

  const onHide = () => {
    if (!party.data) return;
    Alert.alert(t('parties.detail.hideTitle'), t('parties.detail.hideBody', { name: party.data.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('parties.detail.hideConfirm'), style: 'destructive', onPress: () => deactivate.mutate() },
    ]);
  };

  if (party.isPending) {
    return <Screen c={c} title={t('parties.detail.screenTitle')}><Loading c={c} skeleton={4} /></Screen>;
  }
  if (party.isError || !party.data) {
    return (
      <Screen c={c} title={t('parties.detail.screenTitle')}>
        <ErrorBlock c={c} message={apiErrorMessage(party.error, t('parties.detail.notFound'))} onRetry={() => party.refetch()} />
      </Screen>
    );
  }

  const p = party.data;
  const merged = Boolean(p.mergedIntoPartyId);
  const balanceLabel = p.outstandingPaise > 0
    ? t('parties.detail.theyOweYou')
    : p.outstandingPaise < 0 ? t('parties.detail.youOweThem') : t('parties.detail.settled');
  const balanceColor = p.outstandingPaise > 0 ? c.error : p.outstandingPaise < 0 ? c.success : c.textSecondary;

  const renderEntry = ({ item }: { item: PartyLedgerEntry }) => (
    <View style={styles.entryRow}>
      <View style={{ flex: 1 }}>
        {/* `item.label` and `item.reference` are the SERVER's own words for a
            ledger line (an invoice number, a payment note) — data on the record,
            printed back as it came rather than re-labelled here. */}
        <Text style={[styles.entryLabel, { color: c.textPrimary }]} numberOfLines={1}>{item.label}</Text>
        <Text style={[styles.entryDate, { color: c.textSecondary }]}>
          {formatI18nDate(item.at, t)}
          {item.reference ? t('parties.detail.entryReference', { reference: item.reference }) : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.entryAmount, { color: item.debitPaise ? c.error : c.success }]}>
          {item.debitPaise
            ? t('parties.detail.entryDebit', { amount: formatPaise(item.debitPaise) })
            : t('parties.detail.entryCredit', { amount: formatPaise(item.creditPaise) })}
        </Text>
        <Text style={[styles.entryBalance, { color: c.textSecondary }]}>{t('parties.detail.entryBalance', { amount: formatPaise(item.balancePaise) })}</Text>
      </View>
    </View>
  );

  return (
    <Screen
      c={c}
      title={p.name}
      subtitle={t(p.kind === 'BOTH'
        ? 'parties.detail.kindBoth'
        : p.kind === 'CUSTOMER' ? 'parties.detail.kindCustomer' : 'parties.detail.kindSupplier')}
      scroll={false}
      right={canManage && !merged ? (
        <IconButton icon="pencil-outline" size={22} onPress={() => router.push({ pathname: '/parties/new', params: { id } })} />
      ) : undefined}
    >
      <FlatList
        data={ledger.data?.entries ?? []}
        keyExtractor={(e, i) => `${e.kind}-${e.refId}-${i}`}
        renderItem={renderEntry}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: c.divider }]} />}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 12 }}>
            {merged ? (
              <Rise index={0}>
                <Card c={c}>
                  <StatusBadge tone="info" label={t('parties.merge.mergedBadge')} />
                  <Text style={{ color: c.textPrimary, marginTop: 8 }}>{t('parties.merge.mergedNotice', { by: p.mergedByName || '—' })}</Text>
                  {p.mergedInto ? (
                    <Row c={c} icon="account-arrow-right-outline" title={t('parties.merge.openKept', { name: p.mergedInto.name })}
                      onPress={() => router.replace({ pathname: '/parties/[id]', params: { id: p.mergedInto!.id } })} />
                  ) : null}
                </Card>
              </Rise>
            ) : null}
            <Rise index={1}>
            <Card c={c}>
              <View style={styles.balanceRow}>
                <View>
                  <Text style={[styles.balanceLabel, { color: c.textSecondary }]}>{balanceLabel}</Text>
                  <BalanceCount paise={Math.abs(p.outstandingPaise)} color={balanceColor} />
                </View>
                {p.phone && (
                  <IconButton
                    icon="whatsapp"
                    size={26}
                    iconColor={c.success}
                    onPress={() => Linking.openURL(`https://wa.me/${p.phone!.replace(/\D/g, '')}`)}
                  />
                )}
              </View>
              {(p.phone || p.email) && (
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>{[p.phone, p.email].filter(Boolean).join(' · ')}</Text>
              )}
              {p.gstin && <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('parties.detail.gstin', { gstin: p.gstin })}</Text>}
            </Card>
            </Rise>

            {/* P1 (screens S2, S14, S15): the supplier side and the khata side, side by side on a tablet. */}
            {hasModule('INVOICING') && !merged && (
              <TwoPane
                left={p.kind !== 'SUPPLIER' ? <KhataPanel c={c} party={p} canManage={canManage} onMessage={setToast} /> : null}
                right={p.kind !== 'CUSTOMER' && can('PURCHASES_VIEW', 'READ')
                  ? <SupplierPanel c={c} partyId={p._id} canManage={can('PURCHASES_MANAGE', 'FULL')} />
                  : undefined}
              />
            )}

            {canMerge && !merged && p.isActive && p.kind !== 'SUPPLIER' && (
              <Row
                c={c}
                icon="call-merge"
                title={t('parties.merge.open')}
                subtitle={t('parties.merge.rowHint')}
                onPress={() => router.push({ pathname: '/parties/merge', params: { id, name: p.name } })}
              />
            )}
            {canManage && !merged && (
              <Row
                c={c}
                icon="calculator-variant-outline"
                title={t('parties.detail.rebuildRow')}
                subtitle={t('parties.detail.rebuildRowHint')}
                onPress={recomputing ? undefined : recompute}
              />
            )}
            {canManage && !merged && (
              <Row c={c} icon="eye-off-outline" title={t('parties.detail.hideRow')} danger onPress={onHide} />
            )}

            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('parties.detail.ledger')}</Text>
          </View>
        }
        ListEmptyComponent={
          ledger.isPending ? <Loading c={c} skeleton={4} /> : (
            <EmptyBlock c={c} icon="receipt" title={t('parties.detail.emptyTitle')} body={t('parties.detail.emptyBody')} />
          )
        }
      />
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3500}>{toast}</Snackbar>
    </Screen>
  );
}

/** M21: the balance counts up once (reduce-motion: shown at once); readers get the exact amount. */
function BalanceCount({ paise, color }: { paise: number; color: string }) {
  const shown = useCountUp(paise);
  return (
    <Text accessibilityLabel={formatPaise(paise)} style={[styles.balanceValue, { color }]}>{formatPaise(Math.round(shown))}</Text>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: 16, paddingBottom: 40 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  balanceValue: { fontSize: 24, fontWeight: '600', marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  entryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  entryLabel: { fontSize: 14, fontWeight: '600' },
  entryDate: { fontSize: 11, marginTop: 2 },
  entryAmount: { fontSize: 13, fontWeight: '600' },
  entryBalance: { fontSize: 10, marginTop: 1 },
});
