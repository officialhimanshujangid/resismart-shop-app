import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';
import type { PartnerRentDetail, PartnerRentList, RentListStatus, RentPaidBody } from './types';

/**
 * CONTRACT-partner-P4 §10.8 — the ONLY partner-side door into leases and rent.
 * Every path is exactly the backend's (`partner-society-rent.routes.ts`); the
 * server keys everything on the session's partner, so nothing here sends an id
 * other than the bill's.
 *
 * Who may call (the route's own guards): the proprietor always; otherwise
 * INVOICING_VIEW, EXPENSES_VIEW or ACCOUNTS at READ for the reads, and
 * INVOICING_MANAGE or EXPENSES_MANAGE at FULL for "I have paid" — see `logic.ts`.
 */
export const RENT_BASE = '/partners/me/society-rent';
const billPath = (id: string) => `${RENT_BASE}/${encodeURIComponent(id)}`;

export const rentApi = {
  list: (params: { status?: RentListStatus; page?: number; pageSize?: number } = {}) =>
    apiClient.get<ApiEnvelope<PartnerRentList>>(RENT_BASE, { params }).then((r) => unwrap(r.data)),

  /** Not this partner's (or no such bill) → 404 `RENT_BILL_NOT_FOUND`. */
  detail: (id: string) =>
    apiClient.get<ApiEnvelope<PartnerRentDetail>>(billPath(id)).then((r) => unwrap(r.data)),

  /** The same PDF the society office prints. */
  pdfBytes: (id: string) =>
    apiClient
      .get<ArrayBuffer>(`${billPath(id)}/pdf`, { responseType: 'arraybuffer' })
      .then((r) => new Uint8Array(r.data)),

  /**
   * Tells the society's lease managers. Creates NO receipt (v1): the office
   * checks its bank and records it. 409 `RENT_NOTHING_DUE`, 429
   * `RENT_PAID_NOTE_LIMIT` (3 per bill per day), 400 `RENT_FIELD_INVALID`.
   * The key is minted when the sheet opens, so a retry of the same tap is one note.
   */
  iHavePaid: (id: string, body: RentPaidBody, idempotencyKey: string) => {
    const out: RentPaidBody = { amountPaise: body.amountPaise, reference: body.reference.trim(), mode: body.mode };
    if (body.paidOn) out.paidOn = body.paidOn.slice(0, 10);
    return apiClient
      .post<ApiEnvelope<{ noted: true }>>(`${billPath(id)}/i-have-paid`, out, withIdempotency(idempotencyKey))
      .then((r) => unwrap(r.data));
  },
};
