import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';
import type { Product } from '../catalog/types';
import type {
  AdjustBody, AdjustResult, AudienceCount, Broadcast, BroadcastInput, BroadcastList, BroadcastSegment,
  CommerceSettingsPatch, CommerceSettingsPayload, CounterCheckoutResult, CounterHold, DeadStockRow, HoldInput,
  InsightsHeatmap, InsightsOverview, InsightsQuery, LabelSheetInput, OfferDetail, OfferInput, OfferRedemption,
  OfferStatus, OfferView, Paged, PointsQuote, QuickKey, ResumeResult, StaffSalesRow, StockAlertDemand, TenderPart,
  TopCustomer, TopUpBody, TopUpResult, UsePoints, VariantInput, WalletBucket, WalletDetail, WalletListRow,
  WalletStatementRow,
} from './types';
// >>> GAP-C-SHOP
import type { BroadcastUpdate, ReferralCodeResult } from './types';
import { labelCountsOf } from './logic';
// <<< GAP-C-SHOP

/**
 * Commerce C3–C6, every path exactly the backend's (`app.ts` COMMERCE-Cn-MOUNTS):
 *
 *   /partners/me/commerce/settings       C1 router — the C3–C6 sections only are sent from here
 *   /partners/me/offers                  C3 (module CATALOG; OFFERS_VIEW / OFFERS_MANAGE)
 *   /partners/me/wallet                  C4 (WALLET_VIEW / WALLET_MANAGE; top-up/refund/pay-bill need INVOICING)
 *   /partners/me/broadcasts              C5 (module ORDERS; BROADCAST_SEND)
 *   /partners/me/commerce-insights       C5 (REPORTS; dead stock STOCK_VIEW; top customers + CUSTOMERS)
 *   /partners/me/counter                 C6 (module INVOICING)
 *   /partners/me/products/:id/variants   C6 (module CATALOG)
 *   /partners/me/products/labels         C6
 *
 * The server keys everything on the session's shop: nothing here sends a
 * partner id. Refusals are coded (`errors.<CODE>` in both catalogues).
 */

/** A list answer `{ success, data, page, limit, total, … }` → the rest without `success`. */
const paged = <T>(body: { data?: T[]; page?: number; limit?: number; total?: number } & Record<string, unknown>) => ({
  ...body,
  data: Array.isArray(body?.data) ? body.data : [],
  page: Number(body?.page) || 1,
  limit: Number(body?.limit) || 25,
  total: Number(body?.total) || 0,
});

const id = (s: string) => encodeURIComponent(s);

export const commerceApi = {
  // ─────────────────────────────────────────── settings (C3–C6 sections)
  settings: {
    get: () =>
      apiClient.get<ApiEnvelope<CommerceSettingsPayload>>('/partners/me/commerce/settings').then((r) => unwrap(r.data)),
    /** One section per save; the server checks the section's own permission too. */
    put: (patch: CommerceSettingsPatch, key: string) =>
      apiClient
        .put<ApiEnvelope<CommerceSettingsPayload>>('/partners/me/commerce/settings', patch, withIdempotency(key))
        .then((r) => unwrap(r.data)),
  },

  // ─────────────────────────────────────────── offers (C3)
  offers: {
    list: (params: { status?: OfferStatus; kind?: string; q?: string; page?: number; limit?: number } = {}) =>
      apiClient.get<Paged<OfferView>>('/partners/me/offers', { params }).then((r) => paged<OfferView>(r.data as never) as Paged<OfferView>),
    get: (offerId: string) =>
      apiClient.get<ApiEnvelope<OfferDetail>>(`/partners/me/offers/${id(offerId)}`).then((r) => unwrap(r.data)),
    create: (body: OfferInput, key: string) =>
      apiClient.post<ApiEnvelope<OfferView>>('/partners/me/offers', body, withIdempotency(key)).then((r) => unwrap(r.data)),
    /** The editor posts the offer whole again (never `kind`). */
    update: (offerId: string, body: Partial<Omit<OfferInput, 'kind'>>) =>
      apiClient.put<ApiEnvelope<OfferView>>(`/partners/me/offers/${id(offerId)}`, body).then((r) => unwrap(r.data)),
    setStatus: (offerId: string, status: OfferStatus) =>
      apiClient.post<ApiEnvelope<OfferView>>(`/partners/me/offers/${id(offerId)}/status`, { status }).then((r) => unwrap(r.data)),
    redemptions: (offerId: string, page = 1, limit = 25) =>
      apiClient
        .get<Paged<OfferRedemption>>(`/partners/me/offers/${id(offerId)}/redemptions`, { params: { page, limit } })
        .then((r) => paged<OfferRedemption>(r.data as never) as Paged<OfferRedemption>),
  },

  // ─────────────────────────────────────────── wallet (C4)
  wallet: {
    list: (params: { q?: string; hasCredit?: 'true'; hasPoints?: 'true'; page?: number; limit?: number } = {}) =>
      apiClient.get<Paged<WalletListRow>>('/partners/me/wallet', { params })
        .then((r) => paged<WalletListRow>(r.data as never) as Paged<WalletListRow>),
    get: (partyId: string) =>
      apiClient.get<ApiEnvelope<WalletDetail>>(`/partners/me/wallet/${id(partyId)}`).then((r) => unwrap(r.data)),
    statement: (partyId: string, params: { bucket?: WalletBucket; page?: number; limit?: number } = {}) =>
      apiClient.get<Paged<WalletStatementRow>>(`/partners/me/wallet/${id(partyId)}/statement`, { params })
        .then((r) => paged<WalletStatementRow>(r.data as never) as Paged<WalletStatementRow>),
    adjust: (partyId: string, body: AdjustBody, key: string) =>
      apiClient.post<ApiEnvelope<AdjustResult>>(`/partners/me/wallet/${id(partyId)}/adjust`, body, withIdempotency(key))
        .then((r) => unwrap(r.data)),
    /** Money received from the customer, kept as store credit (receipt PDF). */
    topUp: (partyId: string, body: TopUpBody, key: string) =>
      apiClient.post<ApiEnvelope<TopUpResult>>(`/partners/me/wallet/${id(partyId)}/topup`, body, withIdempotency(key))
        .then((r) => unwrap(r.data)),
    /** Store credit paid back in money (receipt PDF). */
    refund: (partyId: string, body: TopUpBody, key: string) =>
      apiClient.post<ApiEnvelope<TopUpResult>>(`/partners/me/wallet/${id(partyId)}/refund`, body, withIdempotency(key))
        .then((r) => unwrap(r.data)),
    /** Store credit onto an ISSUED bill of this customer. */
    payBill: (partyId: string, body: { documentId: string; amountPaise: number }, key: string) =>
      apiClient
        .post<ApiEnvelope<{ creditPaise: number }>>(`/partners/me/wallet/${id(partyId)}/pay-bill`, body, withIdempotency(key))
        .then((r) => unwrap(r.data)),
    receiptBytes: (partyId: string, paymentId: string) =>
      apiClient
        .get<ArrayBuffer>(`/partners/me/wallet/${id(partyId)}/receipts/${id(paymentId)}.pdf`, { responseType: 'arraybuffer' })
        .then((r) => new Uint8Array(r.data)),
    // >>> GAP-C-SHOP — the customer's referral code at this shop, made on first ask (the same code after).
    // WALLET_MANAGE FULL + feature REFERRAL; 409 COMMERCE_FEATURE_OFF when referral is off.
    referralCode: (partyId: string) =>
      apiClient
        .post<ApiEnvelope<ReferralCodeResult>>(`/partners/me/wallet/${id(partyId)}/referral-code`, {})
        .then((r) => unwrap(r.data)),
    // <<< GAP-C-SHOP
  },

  // ─────────────────────────────────────────── broadcasts (C5)
  broadcasts: {
    list: (params: { status?: string; page?: number; limit?: number } = {}) =>
      apiClient.get<BroadcastList>('/partners/me/broadcasts', { params }).then((r) => {
        const body = paged<Broadcast>(r.data as never) as BroadcastList;
        return { ...body, weekly: body.weekly ?? { used: 0, max: 0 } };
      }),
    /** Counts only — never names. */
    audience: (segment: BroadcastSegment) =>
      apiClient.post<ApiEnvelope<AudienceCount>>('/partners/me/broadcasts/audience', { segment }).then((r) => unwrap(r.data)),
    create: (body: BroadcastInput, key: string) =>
      apiClient.post<ApiEnvelope<Broadcast>>('/partners/me/broadcasts', body, withIdempotency(key)).then((r) => unwrap(r.data)),
    // GAP-C-SHOP: `scheduledAt: null` clears the time (a SCHEDULED one goes back to DRAFT).
    update: (broadcastId: string, body: BroadcastUpdate) =>
      apiClient.put<ApiEnvelope<Broadcast>>(`/partners/me/broadcasts/${id(broadcastId)}`, body).then((r) => unwrap(r.data)),
    /** SENT now, or SCHEDULED when it carries a time. */
    send: (broadcastId: string, key: string) =>
      apiClient.post<ApiEnvelope<Broadcast>>(`/partners/me/broadcasts/${id(broadcastId)}/send`, {}, withIdempotency(key))
        .then((r) => unwrap(r.data)),
    cancel: (broadcastId: string) =>
      apiClient.post<ApiEnvelope<Broadcast>>(`/partners/me/broadcasts/${id(broadcastId)}/cancel`, {}).then((r) => unwrap(r.data)),
  },

  // ─────────────────────────────────────────── insights (C5)
  insights: {
    overview: (q: InsightsQuery) =>
      apiClient.get<ApiEnvelope<InsightsOverview>>('/partners/me/commerce-insights/overview', { params: q }).then((r) => unwrap(r.data)),
    heatmap: (q: InsightsQuery) =>
      apiClient.get<ApiEnvelope<InsightsHeatmap>>('/partners/me/commerce-insights/heatmap', { params: q }).then((r) => unwrap(r.data)),
    topCustomers: (q: InsightsQuery) =>
      apiClient.get<ApiEnvelope<TopCustomer[]>>('/partners/me/commerce-insights/top-customers', { params: q })
        .then((r) => unwrap(r.data) ?? []),
    staffSales: (q: InsightsQuery) =>
      apiClient.get<ApiEnvelope<StaffSalesRow[]>>('/partners/me/commerce-insights/staff-sales', { params: q })
        .then((r) => unwrap(r.data) ?? []),
    deadStock: (q: InsightsQuery) =>
      apiClient.get<ApiEnvelope<DeadStockRow[]>>('/partners/me/commerce-insights/dead-stock', { params: q })
        .then((r) => unwrap(r.data) ?? []),
    stockAlerts: () =>
      apiClient.get<ApiEnvelope<StockAlertDemand[]>>('/partners/me/commerce-insights/stock-alerts').then((r) => unwrap(r.data) ?? []),
  },

  // ─────────────────────────────────────────── counter (C6)
  counter: {
    holds: () => apiClient.get<ApiEnvelope<CounterHold[]>>('/partners/me/counter/holds').then((r) => unwrap(r.data) ?? []),
    hold: (body: HoldInput, key: string) =>
      apiClient.post<ApiEnvelope<CounterHold>>('/partners/me/counter/holds', body, withIdempotency(key)).then((r) => unwrap(r.data)),
    resume: (holdId: string) =>
      apiClient.post<ApiEnvelope<ResumeResult>>(`/partners/me/counter/holds/${id(holdId)}/resume`, {}).then((r) => unwrap(r.data)),
    discard: (holdId: string) =>
      apiClient.post<ApiEnvelope<CounterHold>>(`/partners/me/counter/holds/${id(holdId)}/discard`, {}).then((r) => unwrap(r.data)),
    quickKeys: () => apiClient.get<ApiEnvelope<QuickKey[]>>('/partners/me/counter/quick-keys').then((r) => unwrap(r.data) ?? []),
    setQuickKeys: (productIds: string[]) =>
      apiClient.put<ApiEnvelope<QuickKey[]>>('/partners/me/counter/quick-keys', { productIds }).then((r) => unwrap(r.data) ?? []),
    /** The draft's total with points off — nothing is written. */
    pointsQuote: (documentId: string, usePoints: UsePoints) =>
      apiClient.post<ApiEnvelope<PointsQuote>>('/partners/me/counter/points-quote', { documentId, usePoints }).then((r) => unwrap(r.data)),
    /** Issue the draft and record every part, in one transaction. */
    checkout: (body: { documentId: string; payments: TenderPart[]; usePoints?: UsePoints }, key: string) =>
      apiClient
        .post<ApiEnvelope<CounterCheckoutResult>>('/partners/me/counter/checkout', body, withIdempotency(key))
        .then((r) => unwrap(r.data)),
  },

  // ─────────────────────────────────────────── catalogue (C6 variants, labels)
  variants: {
    list: (productId: string) =>
      apiClient.get<ApiEnvelope<Product[]>>(`/partners/me/products/${id(productId)}/variants`).then((r) => unwrap(r.data) ?? []),
    create: (productId: string, body: VariantInput, key: string) =>
      apiClient
        .post<ApiEnvelope<{ parent: Product; variant: Product }>>(`/partners/me/products/${id(productId)}/variants`, body, withIdempotency(key))
        .then((r) => unwrap(r.data)),
    update: (productId: string, variantId: string, body: Partial<Omit<VariantInput, 'stockQty'>>) =>
      apiClient
        .put<ApiEnvelope<Product>>(`/partners/me/products/${id(productId)}/variants/${id(variantId)}`, body)
        .then((r) => unwrap(r.data)),
  },
  // >>> GAP-C-SHOP — the PDF plus what its headers say: `X-Labels-Count` / `X-Labels-Skipped`.
  labels: (body: LabelSheetInput) =>
    apiClient
      .post<ArrayBuffer>('/partners/me/products/labels', body, { responseType: 'arraybuffer' })
      .then((r) => ({ bytes: new Uint8Array(r.data), counts: labelCountsOf((r as { headers?: unknown }).headers) })),
  // <<< GAP-C-SHOP
};
