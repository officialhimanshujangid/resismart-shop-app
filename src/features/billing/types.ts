/**
 * The billing vertical's own types, mirrored from the backend models this
 * screen talks to: `partner-document.model.ts` and `partner-party.model.ts`.
 *
 * **Why these are hand-written and not imported from `api-contract.generated.ts`**
 * — the hard rule for this build is "never hand-write a union that file
 * already carries". It does not carry one here: as of this build the
 * generated contract stops at `PARTNER_MODULES` / `PARTNER_ACCESS_MODULES`
 * and has never heard of a document type, a document status or a party kind.
 * Duplicating nothing is not possible when the source of truth for billing
 * was never generated in the first place — see `bugsSpotted` in this agent's
 * report. These are typed here, once, spelled EXACTLY as the backend enums
 * (same literal strings, same order where it matters for a switch), so if the
 * contract generator is ever extended to cover billing this file is a
 * one-line diff to re-point at it, not a rewrite.
 */

// ─────────────────────────────────────────────────────────────── documents

export const PARTNER_DOCUMENT_TYPES = [
  'TAX_INVOICE',
  'QUOTATION',
  'PROFORMA',
  'DELIVERY_CHALLAN',
  'CREDIT_NOTE',
  'SALES_RETURN',
  'PURCHASE_INVOICE',
  'PURCHASE_ORDER',
  'DEBIT_NOTE',
] as const;
export type PartnerDocumentType = typeof PARTNER_DOCUMENT_TYPES[number];

/**
 * The types the New Invoice screen may create — as of C5, all nine.
 *
 * Used to be the four SALES types that never require a party
 * (`requiresParty: false`), because the purchase-side types and the two
 * return types "need an existing document or supplier to make sense of".
 * That reasoning does not survive contact with the actual behaviour table:
 * `PURCHASE_ORDER` and `PURCHASE_INVOICE` need a SUPPLIER, not an existing
 * document, and `partiesApi` can search suppliers exactly as it searches
 * customers — there was no missing capability, only a missing toggle. See
 * `PARTNER_DOCUMENT_BEHAVIOUR` below for what each type still requires.
 */
export const BILLING_SCREEN_DOCUMENT_TYPES = PARTNER_DOCUMENT_TYPES;
export type BillingScreenDocumentType = PartnerDocumentType;

export const DOCUMENT_TYPE_LABEL: Record<PartnerDocumentType, string> = {
  TAX_INVOICE: 'Tax invoice',
  QUOTATION: 'Quotation',
  PROFORMA: 'Proforma invoice',
  DELIVERY_CHALLAN: 'Delivery challan',
  CREDIT_NOTE: 'Credit note',
  SALES_RETURN: 'Sales return',
  PURCHASE_INVOICE: 'Purchase invoice',
  PURCHASE_ORDER: 'Purchase order',
  DEBIT_NOTE: 'Debit note',
};

// ──────────────────────────────────────────────────────────── behaviour

/**
 * Mirrors `PARTNER_DOCUMENT_BEHAVIOUR` in `backend/src/models/partner-document.model.ts`
 * — same rule as the header above: hand-copied, kept narrow to what a SCREEN
 * needs to decide what to show or require, and never authoritative. The
 * server re-checks every one of these independently
 * (`partner-document.service.ts`), so a stale entry here costs a confusing
 * form, never a wrong document.
 */
export type DocumentDirection = 'SALES' | 'PURCHASE';
export type DocumentSettlement = 'IN' | 'OUT' | 'NONE';

export interface DocumentBehaviour {
  label: string;
  direction: DocumentDirection;
  /** Which date field this type carries, if any. */
  dateField: 'validUntil' | 'dueDate' | 'none';
  /** A purchase document needs a named supplier; a counter sale can be a name on a slip. */
  requiresParty: boolean;
  /** Only a credit note and a debit note ask "did goods actually move?" — the `goodsReturned` flag decides. */
  stockNeedsGoodsFlag: boolean;
  isTaxDocument: boolean;
  /** Which way money moves to settle this document — drives the payment direction, `NONE` for paper that is never paid against. */
  settlement: DocumentSettlement;
}

export const PARTNER_DOCUMENT_BEHAVIOUR: Readonly<Record<PartnerDocumentType, DocumentBehaviour>> = Object.freeze({
  TAX_INVOICE: { label: 'Tax invoice', direction: 'SALES', dateField: 'dueDate', requiresParty: false, stockNeedsGoodsFlag: false, isTaxDocument: true, settlement: 'IN' },
  QUOTATION: { label: 'Quotation', direction: 'SALES', dateField: 'validUntil', requiresParty: false, stockNeedsGoodsFlag: false, isTaxDocument: false, settlement: 'NONE' },
  PROFORMA: { label: 'Proforma invoice', direction: 'SALES', dateField: 'none', requiresParty: false, stockNeedsGoodsFlag: false, isTaxDocument: false, settlement: 'NONE' },
  DELIVERY_CHALLAN: { label: 'Delivery challan', direction: 'SALES', dateField: 'none', requiresParty: false, stockNeedsGoodsFlag: false, isTaxDocument: false, settlement: 'NONE' },
  CREDIT_NOTE: { label: 'Credit note', direction: 'SALES', dateField: 'none', requiresParty: false, stockNeedsGoodsFlag: true, isTaxDocument: true, settlement: 'OUT' },
  SALES_RETURN: { label: 'Sales return', direction: 'SALES', dateField: 'none', requiresParty: false, stockNeedsGoodsFlag: false, isTaxDocument: true, settlement: 'OUT' },
  PURCHASE_INVOICE: { label: 'Purchase invoice', direction: 'PURCHASE', dateField: 'dueDate', requiresParty: true, stockNeedsGoodsFlag: false, isTaxDocument: true, settlement: 'OUT' },
  PURCHASE_ORDER: { label: 'Purchase order', direction: 'PURCHASE', dateField: 'none', requiresParty: true, stockNeedsGoodsFlag: false, isTaxDocument: false, settlement: 'NONE' },
  DEBIT_NOTE: { label: 'Debit note', direction: 'PURCHASE', dateField: 'none', requiresParty: true, stockNeedsGoodsFlag: true, isTaxDocument: true, settlement: 'IN' },
});

export const behaviourOf = (type: PartnerDocumentType): DocumentBehaviour => PARTNER_DOCUMENT_BEHAVIOUR[type];

export const SALES_DOCUMENT_TYPES: PartnerDocumentType[] =
  PARTNER_DOCUMENT_TYPES.filter((t) => PARTNER_DOCUMENT_BEHAVIOUR[t].direction === 'SALES');
export const PURCHASE_DOCUMENT_TYPES: PartnerDocumentType[] =
  PARTNER_DOCUMENT_TYPES.filter((t) => PARTNER_DOCUMENT_BEHAVIOUR[t].direction === 'PURCHASE');

/**
 * Mirrors `PARTNER_DOCUMENT_CONVERSIONS` — which button `billing/[id].tsx`
 * offers, never what the server accepts. `conversionTargets()` on the server
 * is the same table read the other way round.
 */
export const CONVERSION_TARGETS: Readonly<Record<PartnerDocumentType, PartnerDocumentType[]>> = Object.freeze({
  TAX_INVOICE: ['CREDIT_NOTE'],
  QUOTATION: ['TAX_INVOICE'],
  PROFORMA: ['TAX_INVOICE'],
  DELIVERY_CHALLAN: ['TAX_INVOICE'],
  CREDIT_NOTE: [],
  SALES_RETURN: [],
  PURCHASE_INVOICE: [],
  PURCHASE_ORDER: ['PURCHASE_INVOICE'],
  DEBIT_NOTE: [],
});

export const PARTNER_DOCUMENT_STATUSES = [
  'DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'CONVERTED', 'EXPIRED',
] as const;
export type PartnerDocumentStatus = typeof PARTNER_DOCUMENT_STATUSES[number];

export const STATUS_LABEL: Record<PartnerDocumentStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
  CONVERTED: 'Converted',
  EXPIRED: 'Expired',
};

/** The party AS THEY WERE when the document was raised — see the server model for why this is snapshotted, not joined. */
export interface DocumentPartySnapshot {
  name: string;
  phone?: string;
  gstin?: string;
  address?: string;
  placeOfSupply?: string;
}

/** One line as the server returns it — priced, taxed, totalled. Never sent back up wholesale; only qty/rate/etc. are re-sent. */
export interface PartnerDocumentLine {
  itemId?: string;
  itemName: string;
  description?: string;
  hsn?: string;
  qty: number;
  unit: string;
  ratePaise: number;
  discountPaise: number;
  taxInclusive: boolean;
  taxRatePercent: number;
  cessRatePercent: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  totalPaise: number;
}

export interface PartnerDocumentTotals {
  subPaise: number;
  discountPaise: number;
  taxPaise: number;
  roundOffPaise: number;
  grandPaise: number;
}

/** What `POST /partners/me/documents` accepts. Never a tax field — see `partner-billing.validator.ts`. */
export interface DocumentLineInput {
  itemId?: string;
  itemName: string;
  description?: string;
  hsn?: string;
  qty: number;
  unit?: string;
  ratePaise: number;
  discountPaise?: number;
  taxInclusive?: boolean;
  taxRatePercent?: number;
  cessRatePercent?: number;
}

/** A document as `GET /partners/me/documents` and `GET .../documents/:id` return it. */
export interface PartnerDocumentRecord {
  _id: string;
  partnerId: string;
  type: PartnerDocumentType;
  series: string;
  number?: string;
  seq?: number;
  financialYear?: string;
  documentDate: string;
  issuedAt?: string;
  partyId?: string;
  partySnapshot: DocumentPartySnapshot;
  sourceType: 'BOOKING' | 'ORDER' | 'MANUAL' | 'CONVERSION';
  sourceId?: string;
  convertedFromId?: string;
  convertedToId?: string;
  reissuedFromId?: string;
  reissuedAsId?: string;
  lines: PartnerDocumentLine[];
  totals: PartnerDocumentTotals;
  status: PartnerDocumentStatus;
  paidPaise: number;
  dueDate?: string;
  validUntil?: string;
  reverseCharge: boolean;
  goodsReturned: boolean;
  pdfUrl?: string;
  sentVia: string[];
  terms?: string;
  notes?: string;
  cancelledAt?: string;
  cancelledReason?: string;
  createdAt: string;
  updatedAt: string;
}

// ────────────────────────────────────────────────────────────────── parties

export const PARTY_KINDS = ['CUSTOMER', 'SUPPLIER', 'BOTH'] as const;
export type PartyKind = typeof PARTY_KINDS[number];

export interface PartyAddress {
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface PartnerPartyRecord {
  _id: string;
  kind: PartyKind;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  billingAddress?: PartyAddress;
  shippingAddress?: PartyAddress;
  outstandingPaise: number;
  isWalkIn: boolean;
  isActive: boolean;
}

// ─────────────────────────────────────────────────────── offline drafts

/**
 * A line as it sits inside an OFFLINE draft — deliberately the request shape
 * (`DocumentLineInput`), never the priced server shape. Tax is computed by
 * `computeDocumentTax()` on the server and nowhere else in this codebase (see
 * `partner-tax.util.ts`); a client that reimplemented CGST/SGST/IGST splitting
 * to show a number while offline would be a second, drifting answer to a tax
 * question. The UI shows an approximate pre-tax total instead — see
 * `estimateDraftTotalPaise` in `offlineDrafts.ts`.
 */
export type DraftLineInput = DocumentLineInput;

export type DraftSyncStatus =
  | 'PENDING'         // written locally, not yet attempted
  | 'SYNCING'         // a create/issue call is in flight right now
  | 'FAILED'          // the server refused it; see `lastError`
  | 'BLOCKED_UPGRADE' // the plan's max_invoices_month ceiling was hit
  | 'SYNCED';         // issued; kept briefly so the screen can show a success state, then dropped

/**
 * One offline invoice draft, as stored under `DEVICE_KEYS.INVOICE_DRAFTS`.
 *
 * `idempotencyKey` is minted ONCE, the moment the partner taps "Issue" (see
 * `newIdempotencyKey()` in `src/lib/idempotency.ts`), and is never
 * regenerated by a retry — PARTNERS_PLAN §12.5 and the reason this whole type
 * exists. `serverDraftId`, once set, makes the create step idempotent from the
 * CLIENT's side even though the server has no idempotency store of its own:
 * once a draft id is known, sync only ever calls `issue` on it again, never
 * `create` — see `bugsSpotted` for the gap this covers and does not cover.
 */
export interface InvoiceDraft {
  id: string;
  idempotencyKey: string;
  createdAt: string;
  type: BillingScreenDocumentType;
  partyId?: string;
  partySnapshot: DocumentPartySnapshot;
  lines: DraftLineInput[];
  notes?: string;
  /** ISO date strings — see C6. `documentDate` defaults to "now" server-side when absent. */
  documentDate?: string;
  dueDate?: string;
  validUntil?: string;
  /** Only meaningful when the type's `stockNeedsGoodsFlag` is true (CREDIT_NOTE, DEBIT_NOTE). */
  goodsReturned?: boolean;
  /**
   * The job or order this bill is FOR, when it was started from one.
   *
   * `POST /partners/me/documents` has accepted these since P6, and
   * `POST /bookings/:id/invoice` reads them back to decide whether a job has
   * actually been billed — it refuses while no live document names the booking.
   * The draft used to hardcode `sourceType: 'MANUAL'`, so every bill raised on a
   * phone was unattached and no service job could ever reach INVOICED.
   *
   * Absent for a bill typed from scratch, which is still the common case and
   * still `MANUAL`.
   */
  sourceType?: 'BOOKING' | 'ORDER';
  sourceId?: string;
  status: DraftSyncStatus;
  /** Set the instant `create` succeeds, persisted before `issue` is ever attempted. */
  serverDraftId?: string;
  /** Set once `issue` succeeds — the real, numbered document. */
  syncedDocumentId?: string;
  syncedNumber?: string;
  lastError?: string;
  lastAttemptAt?: string;
}

/** What the New Invoice screen hands `draftStore.addDraft()` when it decides to bill offline. */
export interface AddDraftInput {
  type: BillingScreenDocumentType;
  partyId?: string;
  partySnapshot: DocumentPartySnapshot;
  lines: DraftLineInput[];
  notes?: string;
  documentDate?: string;
  dueDate?: string;
  validUntil?: string;
  goodsReturned?: boolean;
  /** The job this bill is for, when the screen was opened from one. */
  sourceType?: 'BOOKING' | 'ORDER';
  sourceId?: string;
}
