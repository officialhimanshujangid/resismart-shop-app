import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';
import type { DocumentLineInput, PartnerDocumentRecord } from '../billing/types';

/**
 * `/partners/me/purchases` (CONTRACT-partner-P1 §4.3, module INVOICING):
 * receive against a PO (GRN), close a PO short, bill goods-received notes,
 * return goods against a purchase bill, and the supplier summary.
 * Shapes are the contract's, field for field; money in paise.
 */

export type PoFulfilment = 'OPEN' | 'PARTIAL' | 'RECEIVED' | 'CLOSED_SHORT';

export interface PoReceiptLine {
  poLineIndex: number;
  itemId?: string;
  itemName: string;
  unit: string;
  ordered: number;
  received: number;
  pending: number;
  ratePaise: number;
}

export interface PoReceipts {
  po: { id: string; number?: string; status: string; fulfilment: PoFulfilment; partyId: string; partyName: string };
  lines: PoReceiptLine[];
  grns: { id: string; number?: string; status: string; documentDate: string; billedById?: string }[];
}

export interface ReceivePoBody {
  documentDate?: string;
  /** M20: `batch` only for a PHARMACY business (web parity: CONTRACT-partner-P2 §7). */
  lines: { poLineIndex: number; qty: number; ratePaise?: number; batch?: { batchNo: string; expiryDate: string } }[];
  notes?: string;
  issue?: boolean;
  /** M20: true only after the user confirmed an already-expired batch was really received. */
  confirmExpiredBatch?: boolean;
}

export interface UnbilledGrn {
  id: string;
  number: string;
  documentDate: string;
  partyId: string;
  partyName: string;
  lineCount: number;
  totals: { subPaise?: number; taxPaise?: number; grandPaise: number };
  poId?: string;
  poNumber?: string;
}

export interface BillFromGrnsBody {
  grnIds: string[];
  supplierInvoiceNo: string;
  supplierInvoiceDate: string;
  documentDate?: string;
  dueDate?: string;
  extraLines?: DocumentLineInput[];
  itcEligible?: boolean;
  issue?: boolean;
  confirmDuplicateSupplierNo?: boolean;
}

export interface PurchaseReturnBody {
  lines: { lineIndex: number; qty: number }[];
  reason: string;
  documentDate?: string;
  issue?: boolean;
}

export interface SupplierSummary {
  party: { id: string; name: string; gstin?: string; supplier?: Record<string, unknown> };
  openPOs: { id: string; number?: string; documentDate: string; fulfilment: PoFulfilment }[];
  unbilledGrns: UnbilledGrn[];
  payablePaise: number;
  lastRates: { itemId: string; itemName: string; ratePaise: number; documentDate: string }[];
}

export interface PageOf<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export const purchasesApi = {
  receipts: (poId: string) =>
    apiClient
      .get<ApiEnvelope<PoReceipts>>(`/partners/me/purchases/purchase-orders/${poId}/receipts`)
      .then((r) => unwrap(r.data)),

  /** Idempotent (`partner.po.receive`): one key per "Receive" tap, reused on retry. */
  receive: (poId: string, body: ReceivePoBody, idempotencyKey: string) =>
    apiClient
      .post<ApiEnvelope<{ grn: PartnerDocumentRecord; po: { id: string; fulfilment: PoFulfilment } }>>(
        `/partners/me/purchases/purchase-orders/${poId}/receive`, body, withIdempotency(idempotencyKey),
      )
      .then((r) => unwrap(r.data)),

  closeShort: (poId: string, reason: string) =>
    apiClient
      .post<ApiEnvelope<{ id: string; fulfilment: PoFulfilment; fulfilmentNote: string }>>(
        `/partners/me/purchases/purchase-orders/${poId}/close-short`, { reason },
      )
      .then((r) => unwrap(r.data)),

  unbilledGrns: (query: { partyId?: string; page?: number; limit?: number } = {}) =>
    apiClient
      .get<PageOf<UnbilledGrn>>('/partners/me/purchases/grns/unbilled', { params: query })
      .then((r) => r.data),

  billFromGrns: (body: BillFromGrnsBody, idempotencyKey: string) =>
    apiClient
      .post<ApiEnvelope<PartnerDocumentRecord>>('/partners/me/purchases/bills/from-grns', body, withIdempotency(idempotencyKey))
      .then((r) => unwrap(r.data)),

  returnGoods: (billId: string, body: PurchaseReturnBody, idempotencyKey: string) =>
    apiClient
      .post<ApiEnvelope<PartnerDocumentRecord>>(`/partners/me/purchases/bills/${billId}/return`, body, withIdempotency(idempotencyKey))
      .then((r) => unwrap(r.data)),

  supplierSummary: (partyId: string) =>
    apiClient
      .get<ApiEnvelope<SupplierSummary>>(`/partners/me/purchases/suppliers/${partyId}/summary`)
      .then((r) => unwrap(r.data)),
};
