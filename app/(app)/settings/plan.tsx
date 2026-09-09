import React, { useCallback, useState } from 'react';
import { Alert, Linking, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

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
import { formatI18nDate } from '../../../src/i18n';

/** The `t` this file needs — the whole signature, narrowed to what it calls. */
type TFunc = (key: string, opts?: Record<string, unknown>) => string;

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

/** Which statuses are a problem the partner has to act on. */
const ALARMING = new Set(['past_due', 'pending_payment', 'expired', 'cancelled']);

/**
 * `2026-09-06T…` → `6 Sep 2026`, or `6 सित 2026`.
 *
 * Through the catalogue rather than `toLocaleDateString(locale)` — see
 * `formatI18nDate`'s own note on why `Intl` is not trusted with a month NAME on
 * Hermes. A dash rather than "Invalid Date" for anything unreadable.
 */
const formatDay = (iso: string | null | undefined, t: TFunc): string =>
  (iso ? formatI18nDate(iso, t) : '—');

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
  const { t } = useTranslation();
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
        t('settings.plan.browserFailedTitle'),
        t('settings.plan.browserFailedBody', { url: WEB_BILLING_URL }),
      ),
    );
  }, [t]);

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
      const label = invoice.customInvoiceNumber
        || t('settings.plan.invoiceFallbackLabel', { date: formatDay(invoice.createdAt, t) });
      if (invoice.razorpayInvoiceUrl) {
        Linking.openURL(invoice.razorpayInvoiceUrl).catch(() =>
          Alert.alert(t('settings.plan.openInvoiceFailedTitle'), t('settings.plan.openInvoiceFailedBody')),
        );
        return;
      }
      setSharingId(invoice._id);
      try {
        await sharePlatformInvoicePdf(invoice._id, label);
      } catch (e: unknown) {
        Alert.alert(t('settings.plan.getInvoiceFailedTitle'), apiErrorMessage(e, t('settings.plan.getInvoiceFailedBody')));
      } finally {
        setSharingId(null);
      }
    },
    [t],
  );

  if (!ready) {
    return (
      <Screen c={c} title={t('settings.plan.title')}>
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
  // The third fallback is the translated one: `plan.name` is empty when the
  // server named no plan (`usePartnerEntitlements#normalise`'s sentinel), and
  // this screen prints the result as its own title.
  const planName = sub?.planStatus?.planName || plan.name || t('settings.plan.unknownName');
  const status = sub?.planStatus?.status || plan.status;
  // An unrecognised status prints itself — `subscription.status` is the
  // server's and can gain a member without this screen going blank.
  const statusLabel = t(`settings.plan.status.${status}`, { defaultValue: status });
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
    ? apiErrorMessage(subscriptionQuery.error, t('settings.plan.subLoadFailed'))
    : subscriptionQuery.isPending && subscriptionQuery.isPaused
      ? t('settings.plan.noConnection')
      : null;

  const invoices = invoicesQuery.data ?? [];

  return (
    <Screen c={c} title={t('settings.plan.title')} subtitle={planName}>
      {/* ── the headline ─────────────────────────────────────────────── */}
      <Card c={c}>
        <View style={styles.headlineRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.planName, { color: c.textPrimary }]} numberOfLines={2}>{planName}</Text>
            <Text style={{ color: ALARMING.has(status) ? c.error : c.textSecondary, fontSize: 13, marginTop: 2 }}>
              {statusLabel}
              {plan.isFreeTier ? t('settings.plan.freeTierSuffix') : ''}
            </Text>
          </View>
        </View>

        {/* A trial with a deadline nobody can see is worse than no trial: the
            product simply stops one morning. Phase 4 put `isTrial`/`trialEndsAt`
            on the entitlements payload for exactly this line. */}
        {plan.isTrial && (
          <View style={[styles.banner, { backgroundColor: (trialDays !== null && trialDays <= 3) ? palette.coral.soft : c.surfaceVariant }]}>
            <Text style={{ color: (trialDays !== null && trialDays <= 3) ? palette.coral[600] : c.textPrimary, fontWeight: '600', fontSize: 13 }}>
              {/* `_one` / `_other`, not an `-s`. Hindi cannot suffix, and CLDR
                  puts 0 AND 1 in `one` for it — which is why zero is handled by
                  its own branch above rather than left to the plural. */}
              {trialDays === null
                ? t('settings.plan.trialNoDeadline')
                : trialDays < 0
                  ? t('settings.plan.trialEnded')
                  : trialDays === 0
                    ? t('settings.plan.trialEndsToday')
                    : t('settings.plan.trialEndsIn', { count: trialDays })}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>
              {plan.trialEndsAt ? t('settings.plan.trialEndsOn', { date: formatDay(plan.trialEndsAt, t) }) : ''}
              {t('settings.plan.trialChoose')}
            </Text>
          </View>
        )}

        {graceEndsAt && (
          <View style={[styles.banner, { backgroundColor: palette.coral.soft }]}>
            <Text style={{ color: palette.coral[600], fontWeight: '600', fontSize: 13 }}>
              {t('settings.plan.graceBanner', { date: formatDay(graceEndsAt, t) })}
            </Text>
          </View>
        )}

        {isAdmin && subError && <ErrorBlock c={c} message={subError} onRetry={() => void subscriptionQuery.refetch()} />}

        {isAdmin && !subError && subscriptionQuery.isPending && (
          <ActivityIndicator color={c.primary} style={{ alignSelf: 'flex-start' }} />
        )}

        {isAdmin && sub && (
          <>
            <KeyValue
              c={c}
              label={t('settings.plan.billingCycle')}
              value={sub.subscription?.tenure ?? (plan.isFreeTier ? t('settings.plan.notBilled') : '—')}
            />
            <KeyValue
              c={c}
              label={ALARMING.has(status) ? t('settings.plan.endedOn') : t('settings.plan.renewsOn')}
              value={formatDay(endDate, t)}
              tone={ALARMING.has(status) ? c.error : undefined}
            />
            {nextAmount && <KeyValue c={c} label={t('settings.plan.nextPayment')} value={nextAmount} />}
            {sub.subscription?.autoPayActive && (
              <KeyValue c={c} label={t('settings.plan.autoPay')} value={t('settings.plan.autoPayOn')} />
            )}
            {/* The whole point of `nextPriceNotice`: they are told the new rate
                and the date, instead of finding out on an invoice. */}
            {sub.nextPriceNotice && (
              <Text style={{ color: c.warning, fontSize: 12, marginTop: 2 }}>
                {t('settings.plan.priceNotice', {
                  date: formatDay(sub.nextPriceNotice.effectiveFrom, t),
                  amount: formatPaise(sub.nextPriceNotice.wouldBecomePaise),
                })}
              </Text>
            )}
            {/* `?? []` because a server older than the `upcoming` key sends no
                array at all, and this is a length read on a signed-in partner's
                first screen — a crash here would be a blank plan page. */}
            {(sub.upcoming ?? []).length > 0 && (
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                {t('settings.plan.upcomingTerms', {
                  count: sub.upcoming.length,
                  date: formatDay(sub.upcoming[0]?.startDate, t),
                })}
              </Text>
            )}
          </>
        )}

        {!isAdmin && (
          <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>
            {t('settings.plan.staffNotice')}
          </Text>
        )}
      </Card>

      <Row
        c={c}
        icon="open-in-new"
        title={t('settings.plan.changePlan')}
        subtitle={t('settings.plan.changePlanSub')}
        onPress={openWebBilling}
      />

      {/* ── what the plan includes ───────────────────────────────────── */}
      <SectionLabel c={c}>{t('settings.plan.includesHeading')}</SectionLabel>
      <Card c={c} style={styles.listCard}>
        {PARTNER_MODULES.map((module: PartnerModule, i) => {
          const info = PARTNER_MODULE_INFO[module];
          const state = moduleState(module);
          // ON / OFF / LOCKED, from the SAME `moduleStateOf` the tab bar and the
          // More menu read. A second rule here would be a second answer to "may
          // I", and the one nobody is looking at is the one that drifts.
          const detail =
            state === 'ON'
              ? t('settings.plan.moduleOnDetail')
              : state === 'OFF'
                ? t('settings.plan.moduleOffDetail')
                : t('settings.plan.moduleLockedDetail');
          return (
            <View key={module}>
              <Row
                c={c}
                icon={info.icon}
                title={t(`modules.${module}.label`)}
                subtitle={t('settings.plan.moduleSubtitle', { detail, blurb: t(`modules.${module}.blurb`) })}
                right={
                  <Text style={{ color: state === 'LOCKED' ? c.textDisabled : state === 'OFF' ? c.warning : c.success, fontSize: 12, fontWeight: '600' }}>
                    {state === 'ON' ? t('settings.plan.moduleOn') : state === 'OFF' ? t('settings.plan.moduleOff') : t('settings.plan.moduleLocked')}
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
          <SectionLabel c={c}>{t('settings.plan.usedHeading')}</SectionLabel>
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
          <SectionLabel c={c}>{t('settings.plan.invoicesHeading')}</SectionLabel>
          {invoicesQuery.isError ? (
            <ErrorBlock
              c={c}
              message={apiErrorMessage(invoicesQuery.error, t('settings.plan.invoicesLoadFailed'))}
              onRetry={() => void invoicesQuery.refetch()}
            />
          ) : invoicesQuery.isPending ? (
            <Card c={c}><ActivityIndicator color={c.primary} /></Card>
          ) : invoices.length === 0 ? (
            <Card c={c}>
              <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                {t('settings.plan.invoicesEmpty')}
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
                      title={invoice.customInvoiceNumber || formatDay(invoice.paidAt || invoice.createdAt, t)}
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
                            {invoice.razorpayInvoiceUrl ? t('settings.plan.invoiceOpen') : t('settings.plan.invoiceShare')}
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
        title={t('settings.plan.refresh')}
        subtitle={t('settings.plan.refreshSub')}
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
