import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors, radii, palette } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { boostApi, BoostPackage, BoostPackagesResponse, MyBoostsResponse } from '../../../src/api/boost.api';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { AppButton } from '../../../src/components/AppButton';
import { Card, EmptyBlock, ErrorBlock, Loading, SectionLabel } from '../../../src/features/more/ui';

/**
 * Buy and track a boost — the ONE place in this app where a LOCKED module has
 * a screen to send a partner to (see `more.tsx`'s header). `getBoostPackages`
 * answers even for a plan that excludes boost (`requirePartnerModule
 * ('PROMOTION')` is deliberately absent on that route), so this screen reads
 * `boostAvailable`/`upgradeRequired` itself rather than trusting the tab to
 * have kept it out.
 *
 * CHECKOUT, evaluated honestly (spec §4.4's rule for the thermal printer,
 * applied the same way here): completing a Razorpay ORDER (as opposed to a
 * hosted payment link) needs the Checkout JS SDK, which on React Native means
 * either `react-native-razorpay` (a native module — a dev build, not Expo Go)
 * or a WebView loading `checkout.razorpay.com`'s script. Neither is installed
 * in this app, and dropping either in is a build-and-ship decision, not a
 * screen decision — see `ownerDecisionsNeeded`. A FREE package (an owner
 * launch offer) still applies with no gateway at all, so that path is fully
 * live; a PAID one gets an honest "this build cannot finish the payment yet"
 * message instead of a button that silently does nothing.
 */
export default function PromotionScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const canSpend = can('PROMOTION', 'FULL');
  const queryClient = useQueryClient();
  const [buying, setBuying] = useState<string | null>(null);

  const packages = useQuery({ queryKey: qk.promotion(), queryFn: boostApi.packages, staleTime: 30_000 });
  const boosts = useQuery({ queryKey: qk.promotionBoosts(), queryFn: boostApi.myBoosts, staleTime: 15_000 });

  const refreshAll = () => {
    void packages.refetch();
    void boosts.refetch();
  };

  const buy = async (pkg: BoostPackage) => {
    setBuying(pkg._id);
    try {
      const res = await boostApi.checkout(pkg._id);
      if ('free' in res) {
        void queryClient.invalidateQueries({ queryKey: qk.promotion() });
        Alert.alert('Boost applied', res.message);
        return;
      }
      Alert.alert(
        `${res.packageLabel} — ${formatPaise(res.amountPaise)}`,
        'This build cannot complete a paid boost purchase in-app yet — that needs a Razorpay checkout screen this app does not have wired in. '
        + `Order ${res.orderId} was created and is waiting; ask your ResiSmart contact how to complete it.`,
      );
    } catch (err) {
      Alert.alert('Could not start checkout', apiErrorMessage(err));
    } finally {
      setBuying(null);
    }
  };

  const loading = packages.isPending || boosts.isPending;
  const refreshing = packages.isRefetching || boosts.isRefetching;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Promotion</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>Appear above other businesses near you</Text>
      </View>

      {loading ? (
        <Loading c={c} />
      ) : packages.isError || boosts.isError || !packages.data || !boosts.data ? (
        <ErrorBlock c={c} message={apiErrorMessage(packages.error ?? boosts.error, 'Could not load promotion.')} onRetry={refreshAll} />
      ) : (
        <PromotionBody
          c={c}
          pkgData={packages.data}
          boostData={boosts.data}
          canSpend={canSpend}
          buying={buying}
          onBuy={buy}
          refreshing={refreshing}
          onRefresh={refreshAll}
        />
      )}
    </SafeAreaView>
  );
}

function PromotionBody({
  c, pkgData, boostData, canSpend, buying, onBuy, refreshing, onRefresh,
}: {
  c: ReturnType<typeof themeColors>;
  pkgData: BoostPackagesResponse;
  boostData: MyBoostsResponse;
  canSpend: boolean;
  buying: string | null;
  onBuy: (pkg: BoostPackage) => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {!pkgData.boostAvailable && (
        <Card c={c} style={{ backgroundColor: palette.coral.soft }}>
          <Text style={{ color: palette.coral[600], fontWeight: '700' }}>Not on your plan</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{pkgData.message || 'Upgrade your plan to buy a boost.'}</Text>
        </Card>
      )}

      {boostData.current && (
        <>
          <SectionLabel c={c}>Running now</SectionLabel>
          <Card c={c}>
            <Text style={{ color: c.textPrimary, fontWeight: '800', fontSize: 16 }}>{boostData.current.package.label}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              {boostData.current.package.radiusKm} km radius{boostData.current.package.topPlacement ? ' · Top placement' : ''}
            </Text>
            <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>
              {boostData.current.daysRemaining} day{boostData.current.daysRemaining === 1 ? '' : 's'} left
            </Text>
          </Card>
        </>
      )}

      <SectionLabel c={c}>Packages</SectionLabel>
      {!pkgData.partnersEnabled ? (
        <EmptyBlock c={c} icon="rocket-launch-outline" title="Promotion is currently switched off" body="Check back later." />
      ) : pkgData.packages.length === 0 ? (
        <EmptyBlock c={c} icon="rocket-launch-outline" title="No packages on sale right now" />
      ) : (
        pkgData.packages.map((pkg) => (
          <Card key={pkg._id} c={c} style={styles.pkgCard}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 15 }}>{pkg.label}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                {pkg.durationDays} days · {pkg.radiusKm} km{pkg.topPlacement ? ' · Top placement' : ''}
              </Text>
              <Text style={{ color: c.primary, fontWeight: '800', fontSize: 16, marginTop: 4 }}>
                {pkg.pricePaise === 0 ? 'Free' : formatPaise(pkg.pricePaise)}
              </Text>
            </View>
            {canSpend && (
              <AppButton
                label="Buy"
                onPress={() => onBuy(pkg)}
                loading={buying === pkg._id}
                disabled={buying !== null || !pkgData.boostAvailable}
                fullWidth={false}
                style={styles.buyBtn}
              />
            )}
          </Card>
        ))
      )}

      <SectionLabel c={c}>History</SectionLabel>
      {boostData.history.length > 0 ? (
        <Card c={c} style={{ padding: 0 }}>
          {boostData.history.map((b, i) => (
            <View key={b.id} style={[styles.historyRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }}>{b.package.label}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 11 }}>{new Date(b.purchasedAt).toLocaleDateString('en-IN')} · {b.status}</Text>
              </View>
              <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 13 }}>{formatPaise(b.amountPaise)}</Text>
            </View>
          ))}
        </Card>
      ) : (
        <EmptyBlock c={c} icon="history" title="No boosts bought yet" />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  pkgCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buyBtn: { minWidth: 84 },
  historyRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
});
