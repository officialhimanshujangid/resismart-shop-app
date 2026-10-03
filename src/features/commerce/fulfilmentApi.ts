import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';
import i18n from '../../i18n';
import type { PartnerOrder } from '../orders/types';

/**
 * Commerce C2 — fulfilment (CONTRACT-commerce §7), every path exactly the
 * backend's: these ride INSIDE the order router at `/partners/me/orders`
 * (`commerce-fulfilment.routes.ts`), so `/my-deliveries` and `/picking-list`
 * win over `/:id`. Every answer that carries an order is the partner view
 * (`serializeOrderForPartner`) — never the hand-over code.
 */

export const PARTIAL_REASONS = ['OUT_OF_STOCK', 'DAMAGED', 'QUALITY', 'OTHER'] as const;
export type PartialReason = typeof PARTIAL_REASONS[number];
export interface PartialChange { productId: string; toQty: number; reason: PartialReason; note?: string }

export type PickingGroup = 'NONE' | 'TOWER' | 'SLOT';
/** `GET /partners/me/orders/eligible-riders`. `staffId` is what `assign` takes. */
export interface EligibleRider { staffId: string; userId: string; name: string; designation?: string }

const BASE = '/partners/me/orders';
const id = (s: string) => encodeURIComponent(s);
async function sharePdf(bytes: Uint8Array, label: string): Promise<void> {
  // Built on use, not at import: the Orders tab imports this file and must not touch the file system to load.
  const DIR = new Directory(Paths.cache, 'orders');
  if (!DIR.exists) DIR.create({ intermediates: true, idempotent: true });
  const file = new File(DIR, `${label.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'picking-list'}.pdf`);
  file.create({ overwrite: true });
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error(i18n.t('billing.share.sharingUnavailable'));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: i18n.t('billing.share.dialogTitle', { label }) });
}

export const fulfilmentApi = {
  /** Accept with LOWER quantities / removed lines (B-1). Re-priced on the server. */
  acceptPartial: (orderId: string, body: { changes: PartialChange[]; note?: string }, key: string) =>
    apiClient
      .post<ApiEnvelope<PartnerOrder>>(`${BASE}/${id(orderId)}/accept-partial`, body, withIdempotency(key))
      .then((r) => unwrap(r.data)),

  /** Give the order to a delivery person (a PartnerStaff id), or `null` to take it back. */
  assign: (orderId: string, staffId: string | null) =>
    apiClient.post<ApiEnvelope<PartnerOrder>>(`${BASE}/${id(orderId)}/assign`, { staffId }).then((r) => unwrap(r.data)),

  /** Active staff whose role can deliver (ORDER_DELIVERIES FULL) — names only; needs ORDERS_MANAGE, not STAFF. */
  eligibleRiders: () =>
    apiClient
      .get<ApiEnvelope<EligibleRider[]>>(`${BASE}/eligible-riders`)
      .then((r) => unwrap(r.data) ?? []),

  /** Only the orders given to the caller (B-3). */
  myDeliveries: (params: { status?: string; page?: number; limit?: number } = {}) =>
    apiClient
      .get<{ data?: PartnerOrder[]; page?: number; limit?: number; total?: number }>(`${BASE}/my-deliveries`, { params })
      .then((r) => ({ data: Array.isArray(r.data?.data) ? r.data.data : [], total: Number(r.data?.total) || 0 })),

  dispatch: (orderId: string, note?: string) =>
    apiClient.post<ApiEnvelope<PartnerOrder>>(`${BASE}/${id(orderId)}/dispatch`, note ? { note } : {}).then((r) => unwrap(r.data)),

  /** Deliver with proof (B-5): the customer's 4-digit code, or a photo uploaded through us. */
  deliver: (orderId: string, body: { otp?: string; proofPhotoUrl?: string; note?: string }) =>
    apiClient.post<ApiEnvelope<PartnerOrder>>(`${BASE}/${id(orderId)}/deliver`, body).then((r) => unwrap(r.data)),

  /** The batch picking list (B-8) as a PDF through the share sheet. */
  sharePickingList: async (q: { groupBy: PickingGroup; date?: string; lang: 'en' | 'hi'; orderIds?: string[] }) => {
    const r = await apiClient.get<ArrayBuffer>(`${BASE}/picking-list`, {
      params: {
        groupBy: q.groupBy, format: 'pdf', lang: q.lang,
        ...(q.date ? { date: q.date } : {}),
        ...(q.orderIds?.length ? { orderIds: q.orderIds.join(',') } : {}),
      },
      responseType: 'arraybuffer',
    });
    await sharePdf(new Uint8Array(r.data), `picking-list-${q.date ?? new Date().toISOString().slice(0, 10)}`);
  },

  /** One order's packing slip. */
  sharePickingSlip: async (orderId: string, code: string, lang: 'en' | 'hi') => {
    const r = await apiClient.get<ArrayBuffer>(`${BASE}/${id(orderId)}/picking-slip`, { params: { lang }, responseType: 'arraybuffer' });
    await sharePdf(new Uint8Array(r.data), `slip-${code}`);
  },
};
