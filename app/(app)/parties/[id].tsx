import React, { useState } from 'react';
import { Alert, FlatList, Linking, StyleSheet, useColorScheme, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { partiesApi, PartyLedgerEntry } from '../../../src/api/parties.api';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { Card, EmptyBlock, ErrorBlock, Loading, Row, Screen } from '../../../src/features/more/ui';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PartyDetailScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = usePartnerEntitlements();
  const canManage = can('CUSTOMERS', 'FULL');
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
    onError: (err) => Alert.alert('Could not hide this party', apiErrorMessage(err)),
  });

  const recompute = async () => {
    setRecomputing(true);
    try {
      const result = await partiesApi.recompute(id);
      void queryClient.invalidateQueries({ queryKey: qk.parties.detail(id) });
      void queryClient.invalidateQueries({ queryKey: [...qk.parties.detail(id), 'ledger'] });
      Alert.alert(
        'Balance rebuilt',
        result.driftPaise === 0
          ? 'The stored balance already matched the ledger.'
          : `The stored balance was off by ${formatPaise(Math.abs(result.driftPaise))}. It now reads ${formatPaise(result.outstandingPaise)}.`,
      );
    } catch (err) {
      Alert.alert('Could not rebuild balance', apiErrorMessage(err));
    } finally {
      setRecomputing(false);
    }
  };

  const onHide = () => {
    if (!party.data) return;
    Alert.alert('Hide this party?', `${party.data.name} will no longer appear in lists. This does not delete their history.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Hide', style: 'destructive', onPress: () => deactivate.mutate() },
    ]);
  };

  if (party.isPending) {
    return <Screen c={c} title="Party"><Loading c={c} /></Screen>;
  }
  if (party.isError || !party.data) {
    return (
      <Screen c={c} title="Party">
        <ErrorBlock c={c} message={apiErrorMessage(party.error, 'That party could not be found.')} onRetry={() => party.refetch()} />
      </Screen>
    );
  }

  const p = party.data;
  const balanceLabel = p.outstandingPaise > 0 ? 'They owe you' : p.outstandingPaise < 0 ? 'You owe them' : 'Settled';
  const balanceColor = p.outstandingPaise > 0 ? c.error : p.outstandingPaise < 0 ? c.success : c.textSecondary;

  const renderEntry = ({ item }: { item: PartyLedgerEntry }) => (
    <View style={styles.entryRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.entryLabel, { color: c.textPrimary }]} numberOfLines={1}>{item.label}</Text>
        <Text style={[styles.entryDate, { color: c.textDisabled }]}>{fmtDate(item.at)}{item.reference ? ` · ${item.reference}` : ''}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.entryAmount, { color: item.debitPaise ? c.error : c.success }]}>
          {item.debitPaise ? `+${formatPaise(item.debitPaise)}` : `−${formatPaise(item.creditPaise)}`}
        </Text>
        <Text style={[styles.entryBalance, { color: c.textDisabled }]}>bal {formatPaise(item.balancePaise)}</Text>
      </View>
    </View>
  );

  return (
    <Screen
      c={c}
      title={p.name}
      subtitle={p.kind === 'BOTH' ? 'Customer & supplier' : p.kind === 'CUSTOMER' ? 'Customer' : 'Supplier'}
      scroll={false}
      right={canManage ? (
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
            <Card c={c}>
              <View style={styles.balanceRow}>
                <View>
                  <Text style={[styles.balanceLabel, { color: c.textSecondary }]}>{balanceLabel}</Text>
                  <Text style={[styles.balanceValue, { color: balanceColor }]}>{formatPaise(Math.abs(p.outstandingPaise))}</Text>
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
              {p.gstin && <Text style={{ color: c.textSecondary, fontSize: 12 }}>GSTIN {p.gstin}</Text>}
            </Card>

            {canManage && (
              <Row c={c} icon="calculator-variant-outline" title="Rebuild balance from ledger" subtitle="Fixes a stored figure that has drifted from the truth." onPress={recomputing ? undefined : recompute} />
            )}
            {canManage && (
              <Row c={c} icon="eye-off-outline" title="Hide this party" danger onPress={onHide} />
            )}

            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>Ledger</Text>
          </View>
        }
        ListEmptyComponent={
          ledger.isPending ? <Loading c={c} /> : (
            <EmptyBlock c={c} icon="receipt" title="No activity yet" body="Documents and payments raised against this party will show up here." />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: 16, paddingBottom: 40 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  balanceValue: { fontSize: 24, fontWeight: '800', marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  entryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  entryLabel: { fontSize: 14, fontWeight: '600' },
  entryDate: { fontSize: 11, marginTop: 2 },
  entryAmount: { fontSize: 13, fontWeight: '700' },
  entryBalance: { fontSize: 10, marginTop: 1 },
});
