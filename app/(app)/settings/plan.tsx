import React, { useCallback, useState } from 'react';
import { Alert, Linking, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii, palette, ColorScheme } from '../../../src/constants/colors';
import { IN_APP_PLAN_PURCHASES, WEB_BILLING_URL } from '../../../src/constants/app';
import { usePartnerEntitlements, usePlanUsage, CATALOG_ITEMS_KEY } from '../../../src/hooks'; // X2F: module list removed
import { platformBillingApi, TenantInvoice } from '../../../src/api/billing.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { qk } from '../../../src/lib/queryKeys';
import { formatPaise } from '../../../src/lib/money';
import { sharePlatformInvoicePdf } from '../../../src/features/billing/pdf';
import { UsageMeterBar } from '../../../src/features/catalog/components/UsageMeterBar'; // X2F: one catalogue-items meter
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
 * ── And, while `IN_APP_PLAN_PURCHASES` is off, no way out to one either ────
 *
 * Google Play's Payments policy forbids pointing a partner at the web panel to
 * pay, not only taking the payment here. So with the flag off the "Change your
 * plan" row, the price lines and the pay-page link on an unpaid invoice are not
 * drawn; a neutral box says renewal details arrive on WhatsApp and email, and
 * the trial and grace banners say when, not where to pay.
 *
 * ── Who may open it ───────────────────────────────────────────────────────
 *
 * `settings/_layout.tsx` gates the whole folder at SETTINGS READ, which is the
 * right gate for the folder and is NOT the gate on the data. `/billing/**` is
 * authorised by the TENANT ROLE (`authorizeRoles([SOCIETY_ADMIN, PARTNER_ADMIN])`),
 * so a member of staff holding SETTINGS at FULL is still `PARTNER_STAFF` and is
 * refused. The row into this screen is therefore gated on `entitlements.isAdmin`
 * — `isAdmin` also covers `PARTNER_OWNER`, which that route admits too since
 * FIXA (the proprietor pair is one person). A refusal is still rendered as a
 * sentence here rather than left as an empty card. See `billing.api.ts`.
 *
 * Everything above the invoice list — plan name, trial deadline, modules, usage
 * meters — comes from `/partners/me/entitlements` and `/partners/me/usage`,
 * which every SETTINGS holder may read. So a staff member who reaches this
 * screen still learns what the business is on; only the money is withheld.
 */

/** Which statuses are a problem the partner has to act on. */
const ALARMING = new Set(['past_due', 'pending_payment', 'expired', 'cancelled']);

/**
 * How close the end of a term must be before it is announced. Matches the
 * window in which renewal details go out on WhatsApp and email, so the banner
 * and the message it promises arrive together.
 */
const PLAN_ENDING_SOON_DAYS = 7;

/** An invoice that no longer wants money — its document is a receipt, not a bill. */
const SETTLED_INVOICE = new Set(['PAID', 'REFUNDED']);

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
  const { entitlements, ready, refresh } = usePartnerEntitlements();
  const { capacity } = usePlanUsage();
  const catalogItems = capacity(CATALOG_ITEMS_KEY); // X2F: the one meter
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [openingNoteId, setOpeningNoteId] = useState<string | null>(null); // FIXA

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
   *
   * With `IN_APP_PLAN_PURCHASES` off, an unsettled invoice is refused here as
   * well as at the row: Razorpay's hosted page for one is a PAY page, and
   * opening it would be the exact "pay elsewhere" link the flag exists to remove.
   */
  const shareInvoice = useCallback(
    async (invoice: TenantInvoice) => {
      if (!IN_APP_PLAN_PURCHASES && !SETTLED_INVOICE.has(invoice.status ?? '')) return;
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

  // >>> FIXA — the business's own GST credit note (tenant route). A refusal is worded
  // from its code (`settings.plan.creditNoteErrors.<CODE>`), en + hi.
  const openCreditNote = async (invoice: TenantInvoice) => {
    if (openingNoteId) return;
    setOpeningNoteId(invoice._id);
    try {
      const url = await platformBillingApi.creditNoteDownloadUrl(invoice._id);
      await Linking.openURL(url);
    } catch (e: unknown) {
      const code = (e as { response?: { data?: { code?: unknown } } } | undefined)?.response?.data?.code;
      const known = typeof code === 'string' && ['INVOICE_NOT_FOUND', 'CREDIT_NOTE_NOT_ISSUED', 'CREDIT_NOTE_PDF_FAILED'].includes(code);
      Alert.alert(
        t('settings.plan.creditNoteFailedTitle'),
        known ? t(`settings.plan.creditNoteErrors.${String(code)}`) : apiErrorMessage(e, t('settings.plan.creditNoteFailedBody')),
      );
    } finally {
      setOpeningNoteId(null);
    }
  };
  // <<< FIXA

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

  /**
   * Days left on a paid term that is about to end with nothing set to renew
   * it, or `null` when there is nothing to announce. Not for a trial (its own
   * banner), a lapsed plan (the grace banner), the free tier (no end to speak
   * of) or an active auto-pay mandate (it will renew, so "ends on" is false).
   */
  const endingIn = daysUntil(endDate);
  const planEndingDays =
    sub && !plan.isTrial && !plan.isFreeTier && !graceEndsAt && !ALARMING.has(status)
    && !sub.subscription?.autoPayActive
    && endingIn !== null && endingIn >= 0 && endingIn <= PLAN_ENDING_SOON_DAYS
      ? endingIn
      : null;

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
                    : IN_APP_PLAN_PURCHASES
                      ? t('settings.plan.trialEndsIn', { count: trialDays })
                      : t('settings.plan.trialEndsOnLeft', { count: trialDays, date: formatDay(plan.trialEndsAt, t) })}
            </Text>
            {IN_APP_PLAN_PURCHASES ? (
              <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>
                {plan.trialEndsAt ? t('settings.plan.trialEndsOn', { date: formatDay(plan.trialEndsAt, t) }) : ''}
                {t('settings.plan.trialChoose')}
              </Text>
            ) : (
              // `trialEndsOnLeft` already carries this promise; every other
              // branch gets it on its own line.
              (trialDays === null || trialDays <= 0) && (
                <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {t('settings.plan.trialDetailsNote')}
                </Text>
              )
            )}
          </View>
        )}

        {planEndingDays !== null && (
          <View style={[styles.banner, { backgroundColor: c.surfaceVariant }]}>
            <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }}>
              {t('settings.plan.planEndsOnLeft', { count: planEndingDays, date: formatDay(endDate, t) })}
            </Text>
          </View>
        )}

        {graceEndsAt && (
          <View style={[styles.banner, { backgroundColor: palette.coral.soft }]}>
            <Text style={{ color: palette.coral[600], fontWeight: '600', fontSize: 13 }}>
              {/* The date it ended, and how long the features stay on — no
                  "payment is overdue", which reads as "go and pay somewhere". */}
              {IN_APP_PLAN_PURCHASES
                ? t('settings.plan.graceBanner', { date: formatDay(graceEndsAt, t) })
                : endDate
                  ? t('settings.plan.graceEnded', { date: formatDay(endDate, t), until: formatDay(graceEndsAt, t) })
                  : t('settings.plan.graceUntil', { until: formatDay(graceEndsAt, t) })}
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
            {/* The amount and the price notice are a renewal quote, and with
                `IN_APP_PLAN_PURCHASES` off that quote goes out on WhatsApp and
                email rather than being printed beside a plan it cannot buy. */}
            {IN_APP_PLAN_PURCHASES && nextAmount && <KeyValue c={c} label={t('settings.plan.nextPayment')} value={nextAmount} />}
            {sub.subscription?.autoPayActive && (
              <KeyValue c={c} label={t('settings.plan.autoPay')} value={t('settings.plan.autoPayOn')} />
            )}
            {/* The whole point of `nextPriceNotice`: they are told the new rate
                and the date, instead of finding out on an invoice. */}
            {IN_APP_PLAN_PURCHASES && sub.nextPriceNotice && (
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

      {IN_APP_PLAN_PURCHASES ? (
        <Row
          c={c}
          icon="open-in-new"
          title={t('settings.plan.changePlan')}
          subtitle={t('settings.plan.changePlanSub')}
          onPress={openWebBilling}
        />
      ) : (
        // Shown to everybody, trial or not, admin or not: the one answer to
        // "how do I change this", with no link and no place to go and pay.
        <Card c={c} style={{ backgroundColor: c.surfaceVariant }}>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('settings.plan.changesNotInApp')}</Text>
        </Card>
      )}

      {/* >>> X2F — ONE-FACTOR PLANS (Owner, 2026-10-04). Every feature is on every
          plan; the plan sets one number, catalogue items (active products +
          services). The old per-module list and its ON/OFF/LOCKED rows are gone. */}
      <SectionLabel c={c}>{t('planItems.heading')}</SectionLabel>
      <Card c={c}>
        <Text style={{ color: c.textPrimary, fontSize: 13 }}>{t('planItems.oneFactorNote')}</Text>
        {/* Usage is sent only to people who can act on it, so an UNKNOWN answer
            (not included) draws no meter rather than a row of zeroes. */}
        <UsageMeterBar cap={catalogItems} c={c} />
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('planItems.countsNote')}</Text>
        {(catalogItems.overBy ?? 0) > 0 && (
          <View style={[styles.banner, { backgroundColor: palette.coral.soft }]}>
            <Text style={{ color: palette.coral[600], fontWeight: '600', fontSize: 13 }}>
              {t('planItems.overBy', { n: catalogItems.overBy, limit: catalogItems.limit ?? 0 })}
            </Text>
          </View>
        )}
      </Card>
      {/* <<< X2F */}

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
                const paid = invoice.status === 'PAID';
                // With the flag off an unsettled invoice has no action at all —
                // its Razorpay page is where it would be PAID — and says
                // "Payment pending" instead of offering to open it.
                const awaitingPayment = !IN_APP_PLAN_PURCHASES && !SETTLED_INVOICE.has(invoice.status ?? '');
                const hasFile = !awaitingPayment && Boolean(invoice.customPdfUrl || invoice.razorpayInvoiceUrl);
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
                        ) : awaitingPayment ? (
                          <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>
                            {t('settings.plan.invoicePaymentPending')}
                          </Text>
                        ) : undefined
                      }
                      onPress={hasFile ? () => void shareInvoice(invoice) : undefined}
                    />
                    {/* >>> FIXA — the GST credit note for a refund on this invoice (web + society app parity) */}
                    {invoice.creditNoteNumber ? (
                      <Row
                        c={c}
                        icon="file-document-outline"
                        title={t('settings.plan.creditNote', { number: invoice.creditNoteNumber })}
                        right={
                          openingNoteId === invoice._id ? (
                            <ActivityIndicator color={c.primary} size={18} />
                          ) : (
                            <Text style={{ color: c.primary, fontSize: 12, fontWeight: '600' }}>{t('settings.plan.invoiceOpen')}</Text>
                          )
                        }
                        onPress={() => void openCreditNote(invoice)}
                      />
                    ) : null}
                    {/* <<< FIXA */}
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
