import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';
import {
  DocumentLineInput, DocumentPartySnapshot, PartnerDocumentRecord, PartnerDocumentStatus, PartnerDocumentType,
  TransportReason,
} from './types';

/**
 * `/partners/me/documents/**` — read exact shapes from
 * `backend/src/controllers/partner-document.controller.ts` and
 * `backend/src/validators/partner-billing.validator.ts` rather than guessing;
 * both were re-read for this file.
 */

export interface DocumentListFilters {
  /**
   * One type, or several comma-separated (`documentTypeCsv` on the server
   * splits and validates each member). Typed as `string` rather than
   * `PartnerDocumentType` because the Sales/Purchase toggle (C5) and the
   * payment allocation picker (C1) both need to ask for several types in one
   * request — see `partner-billing.validator.ts`'s comment on why this was
   * widened from a single-member enum in the first place.
   */
  type?: string;
  /** Comma-separated — the server does `status.split(',')` into an `$in`. */
  status?: string;
  partyId?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface DocumentListResult {
  data: PartnerDocumentRecord[];
  page: number;
  limit: number;
  total: number;
}

export interface CreateDocumentPayload {
  type: PartnerDocumentType;
  partyId?: string;
  partySnapshot: DocumentPartySnapshot;
  lines: DocumentLineInput[];
  notes?: string;
  /** ISO strings — see C6. Server defaults `documentDate` to "now" when absent. */
  documentDate?: string;
  dueDate?: string;
  validUntil?: string;
  goodsReturned?: boolean;
  /** Delivery challan only (CGST Rule 55). */
  transportReason?: TransportReason;
  /** Required by the server when `transportReason` is OTHER. */
  transportReasonNote?: string;
  /** Purchase order only — never before `documentDate`. */
  deliveryDate?: string;
  sourceType?: 'BOOKING' | 'ORDER' | 'MANUAL';
  sourceId?: string;
}

export interface ConvertDocumentPayload {
  to: PartnerDocumentType;
  documentDate?: string;
  dueDate?: string;
  validUntil?: string;
}

export const documentsApi = {
  list: (filters: DocumentListFilters = {}) =>
    apiClient
      .get<DocumentListResult>('/partners/me/documents', { params: filters })
      .then((r) => r.data),

  get: (id: string) =>
    apiClient
      .get<ApiEnvelope<PartnerDocumentRecord> & { conversionTargets: PartnerDocumentType[] }>(
        `/partners/me/documents/${id}`,
      )
      .then((r) => unwrap(r.data)),

  /**
   * A DRAFT.
   *
   * The header is no longer speculative: the route carries
   * `idempotent('partner-document.create')`
   * (`backend/src/routes/partner-document.routes.ts:64`), so a retry with this
   * key is replayed from the server's stored answer rather than creating a
   * second draft. The client-side promise — never re-`create` a draft that
   * already has a `serverDraftId` — still stands on top of it, because the two
   * cover different halves: the server dedupes one intent across attempts, the
   * draft store dedupes one intent across app launches.
   */
  create: (payload: CreateDocumentPayload, idempotencyKey: string) =>
    apiClient
      .post<ApiEnvelope<PartnerDocumentRecord>>('/partners/me/documents', payload, withIdempotency(idempotencyKey))
      .then((r) => unwrap(r.data)),

  update: (id: string, payload: Partial<CreateDocumentPayload>) =>
    apiClient
      .put<ApiEnvelope<PartnerDocumentRecord>>(`/partners/me/documents/${id}`, payload)
      .then((r) => unwrap(r.data)),

  /** Only a DRAFT may be deleted — the server 409s on anything issued. */
  remove: (id: string) =>
    apiClient.delete<ApiEnvelope<unknown>>(`/partners/me/documents/${id}`).then((r) => r.data),

  /**
   * Turn a draft into a NUMBERED, immutable tax document.
   *
   * This is the single highest-stakes retry in the app, and it was the one
   * create call here sending no key. The body is `{}` and the subject is in the
   * URL, so the server's fingerprint is over `{ params: { id }, body: {} }` —
   * which is exactly what makes the key mandatory rather than decorative:
   * `idempotent()` is a no-op without one (`idempotency.middleware.ts:122`), so
   * an `issue` that half-sent and was retried could draw a SECOND statutory
   * invoice number for one bill. That is the failure
   * `models/idempotency-key.model.ts` was written about.
   *
   * `idempotencyKey` comes from the CALLER for the usual reason, and here the
   * caller has something better than a fresh string: an `issue` intent is
   * identified by the draft it issues, so both call sites derive a key that is
   * stable across every attempt at that one draft rather than minting per try.
   */
  issue: (id: string, idempotencyKey: string) =>
    apiClient
      .post<ApiEnvelope<PartnerDocumentRecord> & { message: string }>(
        `/partners/me/documents/${id}/issue`,
        {},
        withIdempotency(idempotencyKey),
      )
      .then((r) => ({ document: unwrap(r.data), message: r.data.message })),

  cancel: (id: string, reason?: string) =>
    apiClient
      .post<{ success: boolean; data: { cancelled: PartnerDocumentRecord }; message: string }>(
        `/partners/me/documents/${id}/cancel`,
        { reason },
      )
      .then((r) => r.data),

  /**
   * Turn this document into its target type — C4. One server transaction
   * writes both documents; there is no client-side "half converted" state.
   * Mirrors `ConvertDialog.tsx` on web.
   */
  convert: (id: string, payload: ConvertDocumentPayload) =>
    apiClient
      .post<ApiEnvelope<{ source: PartnerDocumentRecord; created: PartnerDocumentRecord }>>(
        `/partners/me/documents/${id}/convert`,
        payload,
      )
      .then((r) => unwrap(r.data)),

  send: (id: string, channel: 'WHATSAPP' | 'EMAIL' | 'SMS') =>
    apiClient
      .post<{ success: boolean; message: string }>(`/partners/me/documents/${id}/send`, { channel })
      .then((r) => r.data),

  /**
   * The raw PDF bytes for `id`. `responseType: 'arraybuffer'` so the bytes come
   * back through the SAME axios instance as everything else — including its
   * auth header and refresh-on-401 interceptor. Fetching this with
   * `File.downloadFileAsync` instead (a header-only auth option) would skip
   * that interceptor and fail outright on a merely-stale access token instead
   * of quietly refreshing it, which is exactly the class of "works on every
   * screen except the one that shares a bill" bug this avoids.
   */
  pdfBytes: (id: string) =>
    apiClient
      .get<ArrayBuffer>(`/partners/me/documents/${id}/pdf`, { responseType: 'arraybuffer' })
      .then((r) => new Uint8Array(r.data)),
};

export const documentStatusGroup = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED,PARTIALLY_PAID,PAID',
  UNPAID: 'ISSUED,PARTIALLY_PAID',
} satisfies Record<string, string>;

export const isTerminalStatus = (status: PartnerDocumentStatus): boolean =>
  status === 'CANCELLED' || status === 'CONVERTED' || status === 'EXPIRED';
