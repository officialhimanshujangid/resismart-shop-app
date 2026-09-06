import React, { useCallback, useState } from 'react';
import { Alert, Linking, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';

import { themeColors, radii, palette, ColorScheme } from '../../../src/constants/colors';
import { WEB_BILLING_URL } from '../../../src/constants/app';
import { usePartnerEntitlements, usePlanUsage, PARTNER_MODULE_INFO } from '../../../src/hooks';
import { PARTNER_MODULES, PartnerModule } from '../../../src/types/api-contract.generated';
import { platformBillingApi, TenantInvoice } from '../../../src/api/billing.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { qk } from '../../../src/lib/queryKeys';
import { formatPaise } from '../../../src/lib/money';
import { sharePlatformInvoicePdf } from '../../../src/features/billing/pdf';
import { UsageMeter } from '../../../src/features/billing/components/UsageMeter';
import { Card, ErrorBlock, Row, Screen, SectionLabel } from '../../../src/features/more/ui';

/**
 * The plan this business is on — READ ONLY, and that is the whole design.
 *
 * ── Why this screen exists ────────────────────────────────────────────────
 *
 * Until now the app's answer to "why can't I use Orders?" was a native alert
 * telling the proprietor to ring their ResiSmart contact. That sentence defends
 * the absence of a PURCHASE flow, which is a defensible absence — see below. It
 * never defended the absence of VISIBILITY, and those are different things: a
 * partner could not see which plan they were on, what it costs, when it renews,
 * whether they were on a trial that was about to end, or download a single
 * receipt. Six live endpoints answered every one of those questions and no
 * screen asked them.
 *
 * ── Why there is still no purchase flow ───────────────────────────────────
 *
 * `POST /billing/checkout` is live and is not called from here. Buying on a
 * phone means the Razorpay SDK, a signature-verify round trip and a webhook
 * race, each with a failure mode that ends with a partner charged and no plan.
 * "Change your plan" opens `WEB_BILLING_URL` with `expo-linking` instead. That
 * is one line, it is honest, and the web panel already has the confirmation
 * flow. `cancel` is left out for the same reason and one more: cancelling a
 * subscription is the only destructive action in this surface, and it must not
 * be two taps from a phone with no preview of what it costs.
 *
 * ── Who may open it ───────────────────────────────────────────────────────
 *
 * `settings/_layout.tsx` gates the whole folder at SETTINGS READ, which is the
 * right gate for the folder and is NOT the gate on the data. `/billing/**` is
 * authorised by the TENANT ROLE (`authorizeRoles([SOCIETY_ADMIN, PARTNER_ADMIN])`),
 * so a member of staff holding SETTINGS at FULL is still `PARTNER_STAFF` and is
 * refused. The row into this screen is therefore gated on `entitlements.isAdmin`
 * — but `isAdmin` also covers `PARTNER_OWNER`, which that route does not list,
 * so the refusal is rendered as a sentence here rather than left as an empty
 * card. See `billing.api.ts`.
 *
 * Everything above the invoice list — plan name, trial deadline, modules, usage
 * meters — comes from `/partners/me/entitlements` and `/partners/me/usage`,
 * which every SETTINGS holder may read. So a staff member who reaches this
 * screen still learns what the business is on; only the money is withheld.
 */

/** `subscription.status` / `planStatus.status` → something a proprietor reads. */
const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  trialing: 'On trial',
  past_due: 'Payment overdue',
  pending_payment: 'Awaiting payment',
  cancelled: 'Cancelled',
  expired: 'Expired',
  scheduled: 'Starts later',
  free: 'Free plan',
  unknown: 'Unknown',
};

/** Which statuses are a problem the partner has to act on. */
const ALARMING = new Set(['past_due', 'pending_payment', 'expired', 'cancelled']);

/** `2026-09-06T…` → `6 Sep 2026`. Renders a dash rather than "Invalid Date". */
function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Whole days from now until `iso`, or `null` when there is no readable date.
 *
 * Floored, and compared against the START of today rather than this instant: a
 * trial ending tonight must read "ends today", not "ends in 0 days", and one
 * ending tomorrow morning must not read "today" merely because it is under
 * twenty-four hours away.
 */
function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return Math.floor((end.getTime() - startOfToday.getTime()) / 86_400_000);
}

function KeyValue({ c, label, value, tone }: { c: ColorScheme; label: string; value: string; tone?: string }) {
  return (
    <View style={styles.kv}>
      <Text style={[styles.kvLabel, { color: c.textSecondary }]}>{label}</Text>
      <Text style={[styles.kvValue, { color: tone ?? c.textPrimary }]}>{value}</Text>
    </View>
  );
}

export default function PlanScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { entitlements, ready, moduleState, refresh } = usePartnerEntitlements();
  const { rows: usageRows, capacity } = usePlanUsage();
  const [sharingId, setSharingId] = useState<string | null>(null);

  const isAdmin = entitlements.isAdmin;

  const subscriptionQuery = useQuery({
    queryKey: qk.plan.subscription(),
    queryFn: () => platformBillingApi.mySubscription(),
    // Only asked when the session can actually be authorised for it. Firing it
    // for a staff member would spend a request to be told 403 and would put a
    // permanent error into the cache the whole screen reads.
    enabled: isAdmin,
    staleTime: 120_000,
  });

  const invoicesQuery = useQuery({
    queryKey: qk.plan.invoices(),
    queryFn: () => platformBillingApi.invoices(),
    enabled: isAdmin,
    staleTime: 120_000,
  });

  const openWebBilling = useCallback(() => {
    Linking.openURL(WEB_BILLING_URL).catch(() =>
      Alert.alert(
        'Could not open your browser',
        `Go to ${WEB_BILLING_URL} on a computer or phone browser to change your plan.`,
      ),
    );
  }, []);

  /**
   * Share one receipt.
   *
   * Only offered for an invoice that actually HAS a document. A Razorpay-hosted
   * invoice is an HTML page and is opened in the browser instead of being handed
   * to the share sheet announced as a PDF; a PENDING invoice has no file at all,
   * and its row simply carries no action.
   */
  const shareInvoice = useCallback(
    async (invoice: TenantInvoice) => {
      const label = invoice.customInvoiceNumber || `ResiSmart invoice ${formatDay(invoice.createdAt)}`;
      if (invoice.razorpayInvoiceUrl) {
        Linking.openURL(invoice.razorpayInvoiceUrl).catch(() =>
          Alert.alert('Could not open that invoice', 'Your browser refused to open the link.'),
        );
        return;
      }
      setSharingId(invoice._id);
      try {
        await sharePlatformInvoicePdf(invoice._id, label);
      } catch (e: unknown) {
        Alert.alert('Could not get that invoice', apiErrorMessage(e, 'No PDF is available for this invoice yet.'));
      } finally {
        setSharingId(null);
      }
    },
    [],
  );

  if (!ready) {
    return (
      <Screen c={c} title="Your plan">
        <View style={styles.center}><ActivityIndicator color={c.primary} /></View>
      </Screen>
    );
  }

  const plan = entitlements.plan;
  const sub = subscriptionQuery.data;
  // `planStatus` is preferred over `subscription.planId.name` — a partner inside
  // their grace window still has a subscription row naming the plan that
  // lapsed, and `planStatus` is the half that says so. `entitlements.plan` is
  // the fallback, and it is the only answer a staff member gets at all.
  const planName = sub?.planStatus?.planName || plan.name;
  const status = sub?.planStatus?.status || plan.status;
  const statusLabel = STATUS_LABEL[status] ?? status;
  const trialDays = plan.isTrial ? daysUntil(plan.trialEndsAt) : null;

  /**
   * "Renews on", and it is deliberately not printed as a promise when nothing
   * is going to be charged.
   *
   * `nextAmountPaise` is ZERO both for a free-tier partner and for a term the
   * server could not quote (`renewalQuote` throws on a legacy term whose cycle
   * has since been disabled, and `getMySubscription` swallows it). Neither is
   * "your next payment is ₹0", so the amount is shown only when it is positive.
   */
  const nextAmount = sub && sub.nextAmountPaise > 0 ? formatPaise(sub.nextAmountPaise) : null;
  const endDate = sub?.planStatus?.endDate ?? sub?.subscription?.endDate ?? null;
  const graceEndsAt = sub?.planStatus?.graceEndsAt ?? null;

  const subError = subscriptionQuery.isError
    ? apiErrorMessage(subscriptionQuery.error, 'Could not load your subscription.')
    : subscriptionQuery.isPending && subscriptionQuery.isPaused
      ? 'No connection. Check your network and try again.'
      : null;

  const invoices = invoicesQuery.data ?? [];

  return (
    <Screen c={c} title="Your plan" subtitle={planName}>
      {/* ── the headline ─────────────────────────────────────────────── */}
      <Card c={c}>
        <View style={styles.headlineRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.planName, { color: c.textPrimary }]} numberOfLines={2}>{planName}</Text>
            <Text style={{ color: ALARMING.has(status) ? c.error : c.textSecondary, fontSize: 13, marginTop: 2 }}>
              {statusLabel}
              {plan.isFreeTier ? ' · free tier' : ''}
            </Text>
          </View>
        </View>

        {/* A trial with a deadline nobody can see is worse than no trial: the
            product simply stops one morning. Phase 4 put `isTrial`/`trialEndsAt`
            on the entitlements payload for exactly this line. */}
        {plan.isTrial && (
          <View style={[styles.banner, { backgroundColor: (trialDays !== null && trialDays <= 3) ? palette.coral.soft : c.surfaceVariant }]}>
            <Text style={{ color: (trialDays !== null && trialDays <= 3) ? palette.coral[600] : c.textPrimary, fontWeight: '600', fontSize: 13 }}>
              {trialDays === null
                ? 'You are on a free trial.'
                : trialDays < 0
                  ? 'Your free trial has ended.'
                  : trialDays === 0
                    ? 'Your free trial ends today.'
                    : `Your free trial ends in ${trialDays} ${trialDays === 1 ? 'day' : 'days'}.`}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>
              {plan.trialEndsAt ? `Ends ${formatDay(plan.trialEndsAt)}. ` : ''}
              Choose a plan before then to keep everything you have set up.
            </Text>
          </View>
        )}

        {graceEndsAt && (
          <View style={[styles.banner, { backgroundColor: palette.coral.soft }]}>
            <Text style={{ color: palette.coral[600], fontWeight: '600', fontSize: 13 }}>
              Payment is overdue. Your plan keeps working until {formatDay(graceEndsAt)}.
            </Text>
          </View>
        )}

        {isAdmin && subError && <ErrorBlock c={c} message={subError} onRetry={() => void subscriptionQuery.refetch()} />}

        {isAdmin && !subError && subscriptionQuery.isPending && (
          <ActivityIndicator color={c.primary} style={{ alignSelf: 'flex-start' }} />
        )}

        {isAdmin && sub && (
          <>
            <KeyValue c={c} label="Billing cycle" value={sub.subscription?.tenure ?? (plan.isFreeTier ? 'Not billed' : '—')} />
            <KeyValue
              c={c}
              label={ALARMING.has(status) ? 'Ended on' : 'Renews on'}
              value={formatDay(endDate)}
              tone={ALARMING.has(status) ? c.error : undefined}
            />
            {nextAmount && <KeyValue c={c} label="Next payment" value={nextAmount} />}
            {sub.subscription?.autoPayActive && (
              <KeyValue c={c} label="Auto-pay" value="On — we will charge your saved mandate" />
            )}
            {/* The whole point of `nextPriceNotice`: they are told the new rate
                and the date, instead of finding out on an invoice. */}
            {sub.nextPriceNotice && (
              <Text style={{ color: c.warning, fontSize: 12, marginTop: 2 }}>
                From {formatDay(sub.nextPriceNotice.effectiveFrom)} this plan renews at{' '}
                {formatPaise(sub.nextPriceNotice.wouldBecomePaise)}.
              </Text>
            )}
            {/* `?? []` because a server older than the `upcoming` key sends no
                array at all, and this is a length read on a signed-in partner's
                first screen — a crash here would be a blank plan page. */}
            {(sub.upcoming ?? []).length > 0 && (
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                {sub.upcoming.length === 1 ? 'A new term is' : `${sub.upcoming.length} new terms are`} already scheduled —
                next one starts {formatDay(sub.upcoming[0]?.startDate)}.
              </Text>
            )}
          </>
        )}

        {!isAdmin && (
          <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>
            Only the business owner can see what the plan costs and when it renews. Everything below is what your
            plan lets this business do.
          </Text>
        )}
      </Card>

      <Row
        c={c}
        icon="open-in-new"
        title="Change your plan"
        subtitle="Opens the ResiSmart web panel, where plans are bought and changed"
        onPress={openWebBilling}
      />

      {/* ── what the plan includes ───────────────────────────────────── */}
      <SectionLabel c={c}>What your plan includes</SectionLabel>
      <Card c={c} style={styles.listCard}>
        {PARTNER_MODULES.map((module: PartnerModule, i) => {
          const info = PARTNER_MODULE_INFO[module];
          const state = moduleState(module);
          // ON / OFF / LOCKED, from the SAME `moduleStateOf` the tab bar and the
          // More menu read. A second rule here would be a second answer to "may
          // I", and the one nobody is looking at is the one that drifts.
          const detail =
            state === 'ON'
              ? 'Included and switched on'
              : state === 'OFF'
                ? 'Included — you have switched it off in Settings → Modules'
                : 'Not on your plan';
          return (
            <View key={module}>
              <Row
                c={c}
                icon={info.icon}
                title={info.label}
                subtitle={`${detail} · ${info.blurb}`}
                right={
                  <Text style={{ color: state === 'LOCKED' ? c.textDisabled : state === 'OFF' ? c.warning : c.success, fontSize: 12, fontWeight: '600' }}>
                    {state === 'ON' ? 'On' : state === 'OFF' ? 'Off' : 'Locked'}
                  </Text>
                }
              />
              {i < PARTNER_MODULES.length - 1 && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
            </View>
          );
        })}
      </Card>

      {/* ── the meters ───────────────────────────────────────────────── */}
      {/* `/partners/me/usage` is sent only to people who can act on it (admins
          and SETTINGS holders), so an empty list here is a permission answer,
          not an error — nothing is drawn rather than a row of zeroes. */}
      {usageRows && usageRows.length > 0 && (
        <>
          <SectionLabel c={c}>What you have used</SectionLabel>
          <Card c={c}>
            {usageRows.map((row) => {
              const cap = capacity(row.key);
              // `comingSoon` rows have no model behind them yet — a "0 of 30"
              // meter for something that cannot be counted is a lie with a
              // progress bar on it.
              if (cap.comingSoon || !cap.included) return null;
              return <UsageMeter key={row.key} capacity={cap} c={c} />;
            })}
          </Card>
        </>
      )}

      {/* ── the receipts ─────────────────────────────────────────────── */}
      {isAdmin && (
        <>
          <SectionLabel c={c}>Invoices from ResiSmart</SectionLabel>
          {invoicesQuery.isError ? (
            <ErrorBlock
              c={c}
              message={apiErrorMessage(invoicesQuery.error, 'Could not load your invoices.')}
              onRetry={() => void invoicesQuery.refetch()}
            />
          ) : invoicesQuery.isPending ? (
            <Card c={c}><ActivityIndicator color={c.primary} /></Card>
          ) : invoices.length === 0 ? (
            <Card c={c}>
              <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                Nothing yet. Invoices appear here after your first payment.
              </Text>
            </Card>
          ) : (
            <Card c={c} style={styles.listCard}>
              {invoices.map((invoice, i) => {
                const hasFile = Boolean(invoice.customPdfUrl || invoice.razorpayInvoiceUrl);
                const paid = invoice.status === 'PAID';
                return (
                  <View key={invoice._id}>
                    <Row
                      c={c}
                      icon={paid ? 'receipt' : invoice.status === 'REFUNDED' ? 'cash-refund' : 'clock-outline'}
                      title={invoice.customInvoiceNumber || formatDay(invoice.paidAt || invoice.createdAt)}
                      subtitle={
                        `${formatPaise(invoice.amount)} · ${invoice.status ?? 'PENDING'}` +
                        (invoice.planId?.name ? ` · ${invoice.planId.name}` : '') +
                        (invoice.pricingSnapshot?.line ? `\n${invoice.pricingSnapshot.line}` : '')
                      }
                      right={
                        sharingId === invoice._id ? (
                          <ActivityIndicator color={c.primary} size={18} />
                        ) : hasFile ? (
                          <Text style={{ color: c.primary, fontSize: 12, fontWeight: '600' }}>
                            {invoice.razorpayInvoiceUrl ? 'Open' : 'Share'}
                          </Text>
                        ) : undefined
                      }
                      onPress={hasFile ? () => void shareInvoice(invoice) : undefined}
                    />
                    {i < invoices.length - 1 && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
                  </View>
                );
              })}
            </Card>
          )}
        </>
      )}

      <Row
        c={c}
        icon="refresh"
        title="Refresh"
        subtitle="Re-check your plan, your modules and your usage"
        onPress={() => {
          refresh();
          void subscriptionQuery.refetch();
          void invoicesQuery.refetch();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 48, alignItems: 'center' },
  headlineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  planName: { fontSize: 20, fontWeight: '700' },
  banner: { borderRadius: radii.sm, padding: 10 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  kvLabel: { fontSize: 12.5 },
  kvValue: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  listCard: { padding: 0, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
});
