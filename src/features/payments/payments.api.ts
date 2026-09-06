import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';
import { PaymentDirection, PaymentMode, PaymentRecord } from './types';

/**
 * `/partners/me/payments` — read exact shapes from
 * `backend/src/controllers/partner-payment.controller.ts`, not guessed. See
 * `types.ts`'s header for the two ways this differs from the web mirror.
 *
 * No `update` — the model refuses money-field writes through anything but
 * load-set-save (`partner-payment.model.ts`'s query-path guard), and there is
 * no `PUT /:id` on the server to call even if this file offered one. A
 * payment is either cancelled and re-entered, or left alone.
 */

export interface PaymentListFilters {
  direction?: PaymentDirection;
  partyId?: string;
  page?: number;
  limit?: number;
}

export interface PaymentListResult {
  data: PaymentRecord[];
  page: number;
  limit: number;
  total: number;
}

export interface CreatePaymentPayload {
  partyId: string;
  direction: PaymentDirection;
  mode: PaymentMode;
  amountPaise: number;
  /** Defaults to `[]` server-side — an unallocated payment is entirely on account. */
  allocations?: { documentId: string; amountPaise: number }[];
  reference?: string;
  upiTxnRef?: string;
  /** ISO string. Defaults to "now" server-side when absent. */
  receivedAt?: string;
}

export const paymentsApi = {
  list: (filters: PaymentListFilters = {}) =>
    apiClient
      .get<PaymentListResult>('/partners/me/payments', { params: filters })
      .then((r) => r.data),

  /**
   * Record money in or out — the one call here that CREATES money, and the one
   * that has to carry an `Idempotency-Key`.
   *
   * It used to post bare. `partner-payment.routes.ts` has carried
   * `idempotent('partner.payment.create')` all along and says in its own header
   * that "the client half is one `Idempotency-Key` header per payment the user
   * is entering, held across retries of that same payment" — that half was
   * simply never written, and `idempotent()` passes a keyless request straight
   * through by design, so the server protection was inert for this app.
   *
   * What that cost: recording a payment twice writes two rows, moves the
   * allocated document's `paidPaise` twice and knocks the party's cached
   * `outstandingPaise` down twice. The customer's invoice then reads as overpaid
   * and the books are wrong by the amount. The unique index on `upiTxnRef`
   * catches the UPI case and only that one — a cash receipt has nothing to
   * collide on. And the double tap is not theoretical: the Save button disables
   * itself while the request is in flight, and the cold-start timeout window
   * (`api/axios.ts` allows a full minute for a sleeping instance) re-enables it
   * long before the server has answered.
   *
   * THE KEY IS A REQUIRED ARGUMENT, not something minted in here. Minting it
   * inside this function would produce a fresh key per attempt, which is exactly
   * the bug the header is describing — see `lib/idempotency.ts`. The caller
   * mints one when the partner starts entering a payment and reuses it for every
   * retry of THAT payment; changing the amount, party or allocation means a new
   * intent and a new key, and the server's request-hash check (422) is the
   * backstop if a caller gets that wrong.
   */
  create: (payload: CreatePaymentPayload, idempotencyKey: string) =>
    apiClient
      .post<ApiEnvelope<PaymentRecord>>('/partners/me/payments', payload, withIdempotency(idempotencyKey))
      .then((r) => unwrap(r.data)),

  /**
   * Never a delete — the row stays on record, `status` moves to `CANCELLED`,
   * and every document/party balance it touched is reversed inside one
   * transaction server-side. See the model header on why deleting would make
   * the money vanish from the audit trail along with the ledger.
   */
  cancel: (id: string, reason?: string) =>
    apiClient
      .post<{ success: boolean; data: PaymentRecord; message: string }>(`/partners/me/payments/${id}/cancel`, { reason })
      .then((r) => r.data),
};
