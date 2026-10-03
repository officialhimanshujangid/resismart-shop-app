import { apiClient } from './axios';

/**
 * `/billing/**` — the SUBSCRIPTION this business pays ResiSmart for, which is a
 * different animal from everything under `src/features/billing/`.
 *
 * That folder is the partner billing THEIR OWN customers (invoices, quotes,
 * payments, the PDF they hand across the counter). This file is the plan the
 * partner is on, what it costs, when it renews, and the receipts ResiSmart
 * issues them. They share the word "invoice" and nothing else — hence the split
 * between `src/api/` (platform-level, one screen) and `src/features/billing/`
 * (the whole invoicing vertical).
 *
 * ── READ-ONLY, deliberately ────────────────────────────────────────────────
 *
 * `POST /billing/checkout` exists and is NOT called from here. Buying a plan on
 * a phone means the Razorpay SDK, a checkout screen, a signature-verify round
 * trip and a webhook race, and every one of those has a failure mode that ends
 * with a partner charged and no plan. `settings/plan.tsx` sends them to the web
 * panel with `expo-linking` instead, which is honest and is one line. The
 * endpoints deliberately left uncalled are `checkout`, `verify-payment`,
 * `upgrade-preview` and `cancel` — cancelling a subscription from a phone with
 * no preview of what it costs them is the one destructive action in this whole
 * surface, and it belongs beside the confirmation flow the web already has.
 *
 * ── The envelope ───────────────────────────────────────────────────────────
 *
 * `billing.controller.ts` answers with `{ success, ...fields }` at the top
 * level — NOT the `{ success, data }` envelope `unwrap()` reads. Every response
 * below is therefore taken off `r.data` directly. Passing these through
 * `unwrap` would hand back `undefined` on every call.
 */

/** `toTenantSubscription` in `backend/src/serializers/billing.serializer.ts` — that allowlist, exactly. */
export interface TenantSubscription {
  _id: string | null;
  status: string | null;
  tenure: string | null;
  /** ISO strings over the wire. */
  startDate: string | null;
  endDate: string | null;
  graceEndsAt: string | null;
  isFreeTier: boolean;
  planId: { _id: string; name: string } | null;
  capabilities?: Record<string, number> | null;
  termMonths?: number | null;
  priceLocked?: boolean;
  priceLockHeldByAutoPay?: boolean;
  priceLockHeldUntil?: string | null;
  autoPayActive?: boolean;
}

/**
 * The plan header the endpoint computes for itself, through
 * `partnerEffectiveLimits` for a partner tenant.
 *
 * Preferred over `subscription.planId.name` on the screen: a partner in their
 * grace window still has a subscription row whose plan is the one that lapsed,
 * and `planStatus` is the one that says so.
 */
export interface TenantPlanStatus {
  planName: string;
  status: string;
  isFreeTier: boolean;
  endDate?: string | null;
  graceEndsAt?: string | null;
}

/** What the catalogue would charge at the next renewal, when that is not what they pay today. */
export interface NextPriceNotice {
  wouldBecomePaise: number;
  effectiveFrom: string;
}

export interface MySubscriptionResponse {
  subscription: TenantSubscription | null;
  upcoming: TenantSubscription[];
  /** Capability key → ceiling. `-1` unlimited, `0` not sold. Same shape as `entitlements.plan.limits`. */
  capabilities: Record<string, number>;
  planStatus: TenantPlanStatus;
  /**
   * ZERO MEANS "WE COULD NOT QUOTE IT", not "it is free".
   *
   * `getMySubscription` catches `renewalQuote`'s throw — a legacy term with no
   * stored price whose plan cycle has since been disabled — and leaves this at
   * its initial `0`. It is also genuinely 0 for a free-tier partner. Either way
   * the screen must not print "next payment ₹0" as a promise; see how
   * `plan.tsx` guards it.
   */
  nextAmountPaise: number;
  nextPriceNotice?: NextPriceNotice;
}

/** `toTenantInvoice` in `billing.serializer.ts`. Only what this screen renders is typed. */
export interface TenantInvoice {
  _id: string;
  invoiceType: string | null;
  kind?: string | null;
  /** PAISE, like every other amount in this app. */
  amount: number;
  currency: string | null;
  status: 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED' | string | null;
  paidAt: string | null;
  createdAt: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  customInvoiceNumber: string | null;
  customPdfUrl: string | null;
  razorpayInvoiceUrl: string | null;
  razorpayPaymentLinkUrl?: string | null;
  planId: { _id: string; name: string } | null;
  tenure: string | null;
  creditApplied?: number | null;
  /** The sentence only. The arithmetic behind it is not sent to a tenant. */
  pricingSnapshot?: { line: string | null } | null;
  /** FIXA — the issued GST credit note for a refund on this invoice (its PDF: `creditNoteDownloadUrl`). */
  creditNoteNumber?: string;
}

export const platformBillingApi = {
  /**
   * The plan, the term, what renews when, and the usage rows behind it.
   *
   * `PARTNER_ADMIN` only — `billing.routes.ts` gates it with
   * `authorizeRoles([SOCIETY_ADMIN, PARTNER_ADMIN])`, which is the TENANT ROLE,
   * not one of the partner's own `PartnerAccessModule` permissions. A member of
   * staff with SETTINGS at FULL is still `PARTNER_STAFF` and gets a 403 here.
   * That is why the plan row is gated on `entitlements.isAdmin` rather than on
   * `can('SETTINGS')` — see `settings/plan.tsx`'s header.
   *
   * `isAdmin` is what the client has, and since FIXA it is exact: the server's
   * `PARTNER_ADMIN_ROLES` is `[PARTNER_ADMIN, PARTNER_OWNER]`, and
   * `billing.routes.ts` now admits both on every tenant billing line (the
   * proprietor pair is one person — `context.service#PARTNER_PROPRIETOR_ROLES`).
   * A 403 is still rendered as a sentence, never a broken state.
   * (was: "this route names only `PARTNER_ADMIN` … the fix is one word")
   */
  mySubscription: () =>
    apiClient.get<{ success: boolean } & MySubscriptionResponse>('/billing/my-subscription').then((r) => r.data),

  /**
   * Receipts, newest first. `isPagination` is opt-in server-side; without it the
   * handler returns the whole history in one array, which for a subscription is
   * a dozen rows a year and not worth a pager.
   */
  invoices: () =>
    apiClient
      .get<{ success: boolean; invoices: TenantInvoice[] }>('/billing/invoices')
      .then((r) => r.data.invoices ?? []),

  /**
   * A URL for one invoice's PDF — NOT the bytes.
   *
   * Unlike `documentsApi.pdfBytes` (which streams an authenticated response
   * through this same axios instance), this endpoint answers `{ url }`: either
   * Razorpay's own hosted invoice page, or a 5-minute presigned S3 link. Both
   * carry their own authorisation in the URL, which is why `sharePlatformInvoice`
   * downloads them with `File.downloadFileAsync` rather than through `apiClient`
   * — sending our bearer token to Razorpay or to a presigned URL would be both
   * pointless and careless.
   *
   * 404 with "No PDF available for this invoice" is a normal answer, not a
   * fault: a PENDING invoice has no document yet.
   */
  invoiceDownloadUrl: (id: string) =>
    apiClient
      .get<{ success: boolean; url: string }>(`/billing/invoices/${id}/download`)
      .then((r) => r.data.url),

  // >>> FIXA
  /**
   * A URL for the business's own GST credit note on a refunded invoice
   * (`GET /billing/invoices/:id/credit-note/pdf`, tenant-checked on the server).
   * A 5-minute presigned link, opened like an invoice receipt. Refusals carry a
   * code (`INVOICE_NOT_FOUND`, `CREDIT_NOTE_NOT_ISSUED`, `CREDIT_NOTE_PDF_FAILED`)
   * that `apiErrorMessage` words from `errors.<CODE>`.
   */
  creditNoteDownloadUrl: (id: string) =>
    apiClient
      .get<{ success: boolean; url: string; creditNoteNumber: string }>(`/billing/invoices/${id}/credit-note/pdf`)
      .then((r) => r.data.url),
  // <<< FIXA
};
