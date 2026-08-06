import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
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

  create: (payload: CreatePaymentPayload) =>
    apiClient
      .post<ApiEnvelope<PaymentRecord>>('/partners/me/payments', payload)
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
