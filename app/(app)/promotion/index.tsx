import React, { useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors, radii, palette } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { boostApi, BoostPackage, BoostPackagesResponse, BoostReach, MyBoostsResponse } from '../../../src/api/boost.api';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { AppButton } from '../../../src/components/AppButton';
import { Hero } from '../../../src/components/Hero';
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
 *
 * That refusal now happens BEFORE the request, not after it. `pricePaise` is on
 * the package the screen is already drawing, so the client knows which path a
 * tap is on without asking — and `checkoutBoost` is not a question, it is the
 * act of buying: it writes a PENDING `Invoice`, a PENDING `PartnerBoost` and a
 * live Razorpay order every time it is called. Posting it only to apologise
 * afterwards left one of each behind per tap, for a payment this build cannot
 * finish. `expo-linking` and Razorpay's hosted page were considered as a way to
 * actually finish it and rejected — see the note on `buy`.
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

  /**
   * A PAID package stops here, before the request.
   *
   * Razorpay's hosted alternative was looked at properly rather than assumed:
   * `checkoutBoost` answers with an ORDER id, and the only hosted surface that
   * takes a bare order id is `api.razorpay.com/v1/checkout/embedded`, which is
   * a form POST with a `callback_url` — not something `Linking.openURL` can
   * open, and not something this app can be handed the result of without a
   * backend redirect target and a signature check on the way back. A hosted
   * PAYMENT LINK (`short_url`) would work with `expo-linking` and a poll on
   * `boostApi.status`, but the server does not mint one for a boost today.
   * Both are backend changes, so neither is built here on a guess.
   */
  const buy = async (pkg: BoostPackage) => {
    if (pkg.pricePaise > 0) {
      Alert.alert(
        `${pkg.label} — ${formatPaise(pkg.pricePaise)}`,
        'This app cannot take the payment for a boost yet. Buy it on the ResiSmart web dashboard under '
        + 'Promotion, and it will show up here the moment it is paid for.',
      );
      return;
    }

    setBuying(pkg.id);
    try {
      const res = await boostApi.checkout(pkg.id);
      if ('free' in res) {
        void queryClient.invalidateQueries({ queryKey: qk.promotion() });
        Alert.alert('Boost applied', res.message);
        return;
      }
      // Only reachable if the owner repriced the package between this screen
      // loading and the tap. The order is real and is waiting to be paid, so
      // the message says so rather than pretending nothing happened.
      Alert.alert(
        `${res.packageLabel} — ${formatPaise(res.amountPaise)}`,
        'The price of this package changed while the screen was open, and this app cannot take a payment. '
        + `Order ${res.orderId} is waiting — finish it on the ResiSmart web dashboard.`,
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
      <Hero
        isDark={isDark}
        rounded={false}
        eyebrow="Grow"
        title="Promotion"
        subtitle="Appear above other businesses near you"
      />

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
  /**
   * One reach fetch per DISTINCT radius among the packages, not one per card —
   * two packages that sell the same radius must read the same number, and
   * asking twice is how they would eventually disagree. Same rule the web
   * screen states in `promotion/page.tsx`.
   *
   * Fetched even for a plan that does not sell boost, which is deliberate and
   * matches the server: `PROMOTION_REACH_CHAIN` applies no plan gate, because
   * "what would this actually buy me" is the question an upgrade prompt exists
   * to answer.
   */
  const packageRadii = useMemo(
    () => Array.from(new Set(pkgData.packages.map((p) => p.radiusKm))),
    [pkgData.packages],
  );
  const reachQueries = useQueries({
    queries: packageRadii.map((km) => ({
      queryKey: qk.promotionReach(km),
      queryFn: () => boostApi.reach(km),
      staleTime: 5 * 60_000,
      // A shop does not move, and neither does the map of societies around it.
      // Retrying a 409 "you have no location" on a timer would only spend the
      // geo budget on an answer that cannot change until the partner edits
      // their profile.
      retry: false,
    })),
  });
  const reachByRadius = new Map<number, BoostReach>();
  packageRadii.forEach((km, i) => {
    const row = reachQueries[i]?.data;
    if (row) reachByRadius.set(km, row);
  });
  const reachLoading = new Set(packageRadii.filter((_, i) => reachQueries[i]?.isPending));
  /**
   * The one reach failure with a next step, and it is the same for every
   * radius — so it is said once, above the packages, rather than repeated on
   * every card. Everything else stays a quiet "unavailable": a `0` on a
   * card reads as "this package reaches nobody" and would talk a partner out of
   * a purchase that would in fact have worked.
   */
  const noLocation = reachQueries.some((q) => apiErrorCode(q.error) === 'PARTNER_LOCATION_MISSING');

  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {!pkgData.boostAvailable && (
        <Card c={c} style={{ backgroundColor: palette.coral.soft }}>
          <Text style={{ color: palette.coral[600], fontWeight: '600' }}>Not on your plan</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{pkgData.message || 'Upgrade your plan to buy a boost.'}</Text>
        </Card>
      )}

      {boostData.current && (
        <>
          <SectionLabel c={c}>Running now</SectionLabel>
          <Card c={c}>
            <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 16 }}>{boostData.current.package.label}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              {boostData.current.package.radiusKm} km radius{boostData.current.package.topPlacement ? ' · Top placement' : ''}
            </Text>
            <Text style={{ color: c.primary, fontWeight: '600', fontSize: 13 }}>
              {boostData.current.daysRemaining} day{boostData.current.daysRemaining === 1 ? '' : 's'} left
            </Text>
          </Card>
        </>
      )}

      <SectionLabel c={c}>Packages</SectionLabel>
      {noLocation && (
        <Card c={c} style={{ backgroundColor: c.surfaceVariant }}>
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>We do not have your shop on the map yet</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>
            Add your business location in Settings and each package below will say how many societies and
            residents it reaches.
          </Text>
        </Card>
      )}
      {!pkgData.partnersEnabled ? (
        <EmptyBlock c={c} icon="rocket-launch-outline" title="Promotion is currently switched off" body="Check back later." />
      ) : pkgData.packages.length === 0 ? (
        <EmptyBlock c={c} icon="rocket-launch-outline" title="No packages on sale right now" />
      ) : (
        pkgData.packages.map((pkg) => (
          <Card key={pkg.id} c={c} style={styles.pkgCard}>
            <View style={styles.pkgTop}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 15 }}>{pkg.label}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                  {pkg.durationDays} days · {pkg.radiusKm} km{pkg.topPlacement ? ' · Top placement' : ''}
                </Text>
                <Text style={{ color: c.primary, fontWeight: '600', fontSize: 16, marginTop: 4 }}>
                  {pkg.pricePaise === 0 ? 'Free' : formatPaise(pkg.pricePaise)}
                </Text>
              </View>
              {canSpend && (
                <AppButton
                  label="Buy"
                  onPress={() => onBuy(pkg)}
                  loading={buying === pkg.id}
                  disabled={buying !== null || !pkgData.boostAvailable}
                  fullWidth={false}
                  style={styles.buyBtn}
                />
              )}
            </View>
            {/*
              What the radius actually buys. Without it this screen sold a
              number of kilometres and left the partner to guess whether that
              was ten households or ten thousand.
            */}
            <View style={[styles.reachRow, { borderTopColor: c.divider }]}>
              <ReachLine c={c} pkg={pkg} reach={reachByRadius.get(pkg.radiusKm)} loading={reachLoading.has(pkg.radiusKm)} />
            </View>
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
              <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }}>{formatPaise(b.amountPaise)}</Text>
            </View>
          ))}
        </Card>
      ) : (
        <EmptyBlock c={c} icon="history" title="No boosts bought yet" />
      )}
    </ScrollView>
  );
}

/**
 * One package's reach line — "12 societies · ~840 residents within 5 km".
 *
 * Three states, and the third is the one that matters: an absent number prints
 * as "Reach unavailable right now", never as a zero. A `0` here reads as "this
 * package reaches nobody", which is a reason not to buy something that may in
 * fact reach thousands — the same rule `partnerReachPreview` states on the
 * server for why it answers 409 rather than a zeroed count.
 *
 * `effectiveRadiusKm` is named only when it is SMALLER than the package's own:
 * the server clamps by the partner's service modes and radius, so a business
 * that travels 3 km reaches 3 km whatever the package sells, and the count
 * beside it is the honest one.
 */
function ReachLine({
  c, pkg, reach, loading,
}: {
  c: ReturnType<typeof themeColors>;
  pkg: BoostPackage;
  reach: BoostReach | undefined;
  loading: boolean;
}) {
  if (loading) {
    return <Text style={{ color: c.textSecondary, fontSize: 12 }}>Working out who this reaches…</Text>;
  }
  if (!reach) {
    return <Text style={{ color: c.textSecondary, fontSize: 12 }}>Reach unavailable right now.</Text>;
  }
  const clamped = reach.effectiveRadiusKm > 0 && reach.effectiveRadiusKm < pkg.radiusKm;
  return (
    <>
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>
        <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{reach.societyCount.toLocaleString('en-IN')}</Text>
        {reach.societyCount === 1 ? ' society' : ' societies'} ·{' '}
        <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{reach.residentCount.toLocaleString('en-IN')}</Text>
        {reach.residentCount === 1 ? ' resident' : ' residents'} within {reach.effectiveRadiusKm} km
      </Text>
      {clamped && (
        <Text style={{ color: c.textSecondary, fontSize: 11 }}>
          Your business only serves {reach.effectiveRadiusKm} km, so the extra radius adds nothing until you
          widen it in Settings.
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  pkgCard: { gap: 10 },
  pkgTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reachRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 3 },
  buyBtn: { minWidth: 84 },
  historyRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
});
