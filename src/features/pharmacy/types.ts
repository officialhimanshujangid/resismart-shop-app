/**
 * Partner suite P2 — PHARMACY: the wire shapes of `/partners/me/pharmacy`
 * (CONTRACT-partner-P2 §7), checked against the built backend
 * (`pharmacy.service.ts` `toBatchRow`, `pharmacy-rx.service.ts` `rxEntryRow` /
 * `getRxEntry`). Dates arrive as ISO strings; money in integer paise.
 */

export type BatchStatus = 'OK' | 'NEAR_EXPIRY' | 'EXPIRED' | 'EMPTY';
export type BatchStatusFilter = BatchStatus | 'ALL';
export type DrugSchedule = 'H' | 'H1' | 'X';
export type RxSchedule = 'H' | 'H1';
export type WriteOffReason = 'EXPIRY' | 'DAMAGE' | 'RECALL';
export const WRITE_OFF_REASONS: readonly WriteOffReason[] = ['EXPIRY', 'DAMAGE', 'RECALL'];

export interface BatchRow {
  id: string;
  productId: string;
  productName: string;
  batchNo: string;
  expiryDate: string;
  mfgDate?: string;
  mrpPaise?: number;
  qtyOnHand: number;
  status: BatchStatus;
  /** Civil IST days from today; negative = already expired. */
  daysToExpiry: number;
  /** Only for a reader holding COSTS. */
  unitCostPaise?: number;
}

export interface Paged<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export interface BatchListQuery {
  productId?: string;
  /** Absent = everything except EMPTY. */
  status?: BatchStatusFilter;
  withinDays?: number;
  q?: string;
  page?: number;
  limit?: number;
}

export interface ProductBatchesView {
  product: {
    id: string;
    name: string;
    stockQty: number;
    unit?: string;
    batchTracking: boolean;
    drugSchedule?: DrugSchedule;
  };
  /** stockQty − Σ batch qty, never below 0. */
  unbatchedQty: number;
  /** Only batches with qtyOnHand > 0, earliest expiry first. */
  batches: BatchRow[];
}

export type BatchMovementKind = 'IN' | 'OUT' | 'RETURN' | 'RELABEL' | 'RECONCILE';

export interface BatchMovement {
  id: string;
  qty: number;
  balanceAfter: number;
  kind: BatchMovementKind;
  type?: string;
  sourceType?: string;
  sourceId?: string;
  sourceRef?: string;
  isReversal: boolean;
  reason?: string;
  createdByName: string;
  createdAt: string;
}

/** `PUT /products/:productId/drug` — `null` clears a field. */
export interface DrugFieldsBody {
  batchTracking?: boolean;
  drugSchedule?: DrugSchedule | null;
  composition?: string | null;
  manufacturer?: string | null;
}

/** The part of `GET /partners/me/products/:id` the drug card reads (CATALOG_VIEW). */
export interface ProductDrugInfo {
  composition?: string;
  manufacturer?: string;
  trackStock?: boolean;
  batchTracking?: boolean;
  drugSchedule?: DrugSchedule;
}

export interface SplitBatchInput {
  batchNo: string;
  /** `YYYY-MM` (end of that month, IST) or `YYYY-MM-DD`. */
  expiryDate: string;
  mfgDate?: string;
  mrpPaise?: number;
  qty: number;
}

export interface SplitResult {
  unbatchedQty: number;
  batches: BatchRow[];
}

export interface BatchCorrectionBody {
  mrpPaise?: number | null;
  mfgDate?: string | null;
  expiryDate?: string;
  /** 3–200 chars, audited. */
  note: string;
}

export interface WriteOffBody {
  qty: number;
  reasonCode: WriteOffReason;
  note?: string;
}

export interface WriteOffResult {
  batch: BatchRow;
  movement: { id?: string; productId: string; qty: number; balanceAfter: number; type: string };
}

export interface NearExpiryBucket {
  /** 'EXPIRED' or '≤N' (N from the settings). */
  label: string;
  count: number;
  qty: number;
  /** Only for a reader holding COSTS. */
  valuePaise?: number;
}

export interface NearExpiryView {
  buckets: NearExpiryBucket[];
  rows: BatchRow[];
}

/**
 * The prescription a Schedule H / H1 sale carries (`rxDetailsSchema`). Only what
 * the register needs — no clinical fields (Owner rule 10). Re-exported by
 * `components/RxDetailsForm.tsx`; defined here so `logic.ts` stays React-free.
 */
export interface RxDetails {
  patientName: string;
  patientPhone?: string;
  patientAddress?: string;
  doctorName: string;
  doctorRegNo?: string;
  doctorAddress?: string;
  rxNo?: string;
  /** `YYYY-MM-DD` (IST day). */
  rxDate?: string;
}

/** What goes on the wire as `rx` (trimmed, empty optionals dropped, rxDate an IST instant). */
export interface RxWire {
  patientName: string;
  patientPhone?: string;
  patientAddress?: string;
  doctorName: string;
  doctorRegNo?: string;
  doctorAddress?: string;
  rxNo?: string;
  rxDate?: string;
}

/** A batch chosen at billing / order-accept. Re-exported by `components/BatchPickSheet.tsx`. */
export interface BatchPick {
  batchId: string;
  batchNo: string;
  expiryDate: string;
}

export type RxEntryStatus = 'ACTIVE' | 'CANCELLED';

export interface RxRegisterQuery {
  from?: string;
  to?: string;
  schedule?: RxSchedule;
  q?: string;
  status?: RxEntryStatus;
  page?: number;
  limit?: number;
}

export interface RxItem {
  productId: string;
  name: string;
  schedule: RxSchedule;
  batchNo?: string;
  expiryDate?: string;
  qty: number;
}

export interface RxRegisterRow {
  id: string;
  number: string;
  saleDate: string;
  status: RxEntryStatus;
  source: { kind?: 'DOCUMENT' | 'ORDER'; ref?: string };
  patient: { name: string; phoneMasked?: string };
  prescriber: { name: string; regNo?: string };
  rxNo?: string;
  rxDate?: string;
  items: RxItem[];
}

/** `GET /rx-register/:id` — full, the phone unmasked for an RX_REGISTER holder. */
export interface RxEntry extends Omit<RxRegisterRow, 'patient' | 'prescriber' | 'source'> {
  patient: { name: string; phone?: string; address?: string };
  prescriber: { name: string; regNo?: string; address?: string };
  source: { kind?: 'DOCUMENT' | 'ORDER'; id?: string; ref?: string };
  financialYear?: string;
  cancelledAt?: string;
  cancelledReason?: string;
  createdByName?: string;
  createdAt?: string;
}
