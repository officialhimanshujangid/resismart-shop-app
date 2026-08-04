import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';
import {
  DocumentLineInput, DocumentPartySnapshot, PartnerDocumentRecord, PartnerDocumentStatus, PartnerDocumentType,
} from './types';

/**
 * `/partners/me/documents/**` — read exact shapes from
 * `backend/src/controllers/partner-document.controller.ts` and
 * `backend/src/validators/partner-billing.validator.ts` rather than guessing;
 * both were re-read for this file.
 */

export interface DocumentListFilters {
  type?: PartnerDocumentType;
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
  sourceType?: 'BOOKING' | 'ORDER' | 'MANUAL';
  sourceId?: string;
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
   * A DRAFT. `idempotencyKey` is sent as a header so a future server that adds
   * idempotency-store support to this route needs no client change — today the
   * server does not read it (see `bugsSpotted`), so the durability this app
   * promises comes from never re-issuing a draft it has already issued, not
   * from this header alone.
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

  issue: (id: string) =>
    apiClient
      .post<ApiEnvelope<PartnerDocumentRecord> & { message: string }>(`/partners/me/documents/${id}/issue`, {})
      .then((r) => ({ document: unwrap(r.data), message: r.data.message })),

  cancel: (id: string, reason?: string) =>
    apiClient
      .post<{ success: boolean; data: { cancelled: PartnerDocumentRecord }; message: string }>(
        `/partners/me/documents/${id}/cancel`,
        { reason },
      )
      .then((r) => r.data),

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
