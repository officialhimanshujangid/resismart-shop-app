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
 * The types this screen's "New Invoice" flow may create.
 *
 * Narrower than `PARTNER_DOCUMENT_TYPES` on purpose. Every one of these is a
 * SALES document that never requires a party (`requiresParty: false` on the
 * server's behaviour table), so a walk-in customer can always be billed. The
 * four purchase-side types (`PURCHASE_INVOICE`, `PURCHASE_ORDER`, `DEBIT_NOTE`)
 * and the two return types (`CREDIT_NOTE`, `SALES_RETURN`) all need an
 * existing document or supplier to make sense of, which is a different screen
 * than "two-tap invoice" — see `judgementCalls`.
 */
export const BILLING_SCREEN_DOCUMENT_TYPES = [
  'TAX_INVOICE',
  'QUOTATION',
  'PROFORMA',
  'DELIVERY_CHALLAN',
] as const;
export type BillingScreenDocumentType = typeof BILLING_SCREEN_DOCUMENT_TYPES[number];

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
  /** The job this bill is for, when the screen was opened from one. */
  sourceType?: 'BOOKING' | 'ORDER';
  sourceId?: string;
}
