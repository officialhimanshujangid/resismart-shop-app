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

/**
 * WHAT A DOCUMENT TYPE IS CALLED ON SCREEN — a catalogue key per type, not the
 * words.
 *
 * These ARE display labels and they ARE translated. The KEY of each entry is the
 * `PartnerDocumentType` enum and never moves: it is what `type` carries in
 * `POST /partners/me/documents`, what `PARTNER_DOCUMENT_BEHAVIOUR` and
 * `CONVERSION_TARGETS` are keyed by, and what the server switches on.
 *
 * Contrast `GST_STATES` below, which looks like the same kind of table and is
 * the exact opposite — see its header.
 */
export const DOCUMENT_TYPE_LABEL_KEY: Record<PartnerDocumentType, string> = {
  TAX_INVOICE: 'billing.documentType.TAX_INVOICE',
  QUOTATION: 'billing.documentType.QUOTATION',
  PROFORMA: 'billing.documentType.PROFORMA',
  DELIVERY_CHALLAN: 'billing.documentType.DELIVERY_CHALLAN',
  CREDIT_NOTE: 'billing.documentType.CREDIT_NOTE',
  SALES_RETURN: 'billing.documentType.SALES_RETURN',
  PURCHASE_INVOICE: 'billing.documentType.PURCHASE_INVOICE',
  PURCHASE_ORDER: 'billing.documentType.PURCHASE_ORDER',
  DEBIT_NOTE: 'billing.documentType.DEBIT_NOTE',
};

/**
 * What a TAX_INVOICE is called when its issuer is NOT registered under GST — a
 * bill of supply. Same rule as the printed document
 * (`backend/src/services/partner-document-render.service.ts#isBillOfSupply`):
 * the type is TAX_INVOICE, Business Settings say "not GST registered", and the
 * stored document carries zero tax. The wire `type` never changes — only the
 * words on screen do.
 */
export const BILL_OF_SUPPLY_LABEL_KEY = 'billing.documentType.BILL_OF_SUPPLY';

/**
 * `taxPaise` absent means "not raised yet" (a type picker, an offline draft, a
 * conversion target): the server forces every rate to zero for an unregistered
 * issuer, so such a document will carry no tax. `isGstRegistered` absent
 * (settings not loaded) never reads as unregistered — the label stays as it was.
 */
export function isBillOfSupply(
  type: PartnerDocumentType,
  isGstRegistered: boolean | undefined,
  taxPaise?: number,
): boolean {
  return type === 'TAX_INVOICE' && isGstRegistered === false && (taxPaise ?? 0) === 0;
}

/** `DOCUMENT_TYPE_LABEL_KEY[type]`, except a bill of supply reads as one. */
export function documentTypeLabelKey(
  type: PartnerDocumentType,
  isGstRegistered: boolean | undefined,
  taxPaise?: number,
): string {
  return isBillOfSupply(type, isGstRegistered, taxPaise) ? BILL_OF_SUPPLY_LABEL_KEY : DOCUMENT_TYPE_LABEL_KEY[type];
}

/**
 * CGST Rule 55's reasons a delivery challan may move goods under — mirrors
 * `TRANSPORT_REASONS` in `backend/src/models/partner-document.model.ts`. The code
 * is what is stored and sent; only the words are translated here. The PDF
 * prints its own English words (`TRANSPORT_REASON_LABELS` in the backend render
 * model) — the printed challan is a legal document in one language.
 */
export const TRANSPORT_REASONS = [
  'SUPPLY_OF_LIQUID_GAS', 'JOB_WORK', 'SUPPLY_ON_APPROVAL', 'EXHIBITION_OR_FAIR', 'OWN_USE', 'OTHER',
] as const;
export type TransportReason = typeof TRANSPORT_REASONS[number];

export const TRANSPORT_REASON_LABEL_KEY: Record<TransportReason, string> = {
  SUPPLY_OF_LIQUID_GAS: 'billing.transportReason.SUPPLY_OF_LIQUID_GAS',
  JOB_WORK: 'billing.transportReason.JOB_WORK',
  SUPPLY_ON_APPROVAL: 'billing.transportReason.SUPPLY_ON_APPROVAL',
  EXHIBITION_OR_FAIR: 'billing.transportReason.EXHIBITION_OR_FAIR',
  OWN_USE: 'billing.transportReason.OWN_USE',
  OTHER: 'billing.transportReason.OTHER',
};

/** Which of the two extra fields a type carries — the backend's `statesTransportReason` / `statesDeliveryDate` columns. */
export const statesTransportReason = (type: PartnerDocumentType): boolean => type === 'DELIVERY_CHALLAN';
export const statesDeliveryDate = (type: PartnerDocumentType): boolean => type === 'PURCHASE_ORDER';

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
  /**
   * The BACKEND's own `label` field, mirrored verbatim from
   * `PARTNER_DOCUMENT_BEHAVIOUR` — see the header. Not rendered anywhere in
   * this app and therefore NOT translated: what a screen shows comes from
   * `DOCUMENT_TYPE_LABEL_KEY`. Kept so this table stays a faithful copy and a
   * future diff against the server is a comparison rather than a merge.
   */
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

/**
 * The status as a shopkeeper reads it — a catalogue key per status.
 *
 * Display only, like `DOCUMENT_TYPE_LABEL_KEY`. `PARTNER_DOCUMENT_STATUSES` is
 * the wire value and stays English literals: `PARTIALLY_PAID` is what the
 * server sends, what `serverStatusKind` switches on, and what a filter posts
 * back.
 */
export const STATUS_LABEL_KEY: Record<PartnerDocumentStatus, string> = {
  DRAFT: 'billing.status.DRAFT',
  ISSUED: 'billing.status.ISSUED',
  PARTIALLY_PAID: 'billing.status.PARTIALLY_PAID',
  PAID: 'billing.status.PAID',
  CANCELLED: 'billing.status.CANCELLED',
  CONVERTED: 'billing.status.CONVERTED',
  EXPIRED: 'billing.status.EXPIRED',
};

/** The party AS THEY WERE when the document was raised — see the server model for why this is snapshotted, not joined. */
export interface DocumentPartySnapshot {
  name: string;
  phone?: string;
  gstin?: string;
  address?: string;
  placeOfSupply?: string;
}

/**
 * The place-of-supply options — the same 37 names `GST_STATE_CODES` in
 * `backend/src/utils/partner-tax.util.ts` recognises, and the same list the web
 * client offers (`documents/shared.ts#GST_STATES`).
 *
 * This is not a cosmetic field. `isInterStateSupply` treats a BLANK place of
 * supply as intra-state, so a document raised with nothing here is taxed
 * CGST+SGST — correct for the counter sale it was defaulted for, and a filing
 * error for a customer from another state. Names only, no codes: the server
 * turns a name into the two-digit code that decides the split, and a second
 * copy of that mapping here is a second answer to a tax question.
 *
 * ── NEVER TRANSLATE THIS LIST ─────────────────────────────────────────────
 *
 * These are not labels. Each string is SENT as `partySnapshot.placeOfSupply`
 * and is matched by NAME — `GST_STATE_CODES` in `partner-tax.util.ts` on the
 * server, and `stateKey()` in `taxPreview.ts:94-95` on this side — to produce
 * the two-digit code that decides CGST+SGST versus IGST. A name the lookup does
 * not recognise resolves to no code, and no code is treated as INTRA-state.
 *
 * So a Hindi state name here does not render a Hindi word next to an unchanged
 * number. It silently puts the wrong tax split on a real invoice handed to a
 * real customer, on every inter-state sale, with nothing on any screen saying
 * so — a filing error, not a cosmetic bug. `DOCUMENT_TYPE_LABEL_KEY` and
 * `STATUS_LABEL_KEY` above ARE display labels and ARE translated; this table
 * sits in the same file and is the opposite kind of thing.
 *
 * If these ever need to READ in Hindi, the translation belongs beside the
 * value in the picker (`billing/new.tsx`) and the ENGLISH name still has to be
 * what is sent — it cannot be done by translating this array.
 */
export const GST_STATES = [
  'Jammu and Kashmir', 'Himachal Pradesh', 'Punjab', 'Chandigarh', 'Uttarakhand', 'Haryana', 'Delhi',
  'Rajasthan', 'Uttar Pradesh', 'Bihar', 'Sikkim', 'Arunachal Pradesh', 'Nagaland', 'Manipur', 'Mizoram',
  'Tripura', 'Meghalaya', 'Assam', 'West Bengal', 'Jharkhand', 'Odisha', 'Chhattisgarh', 'Madhya Pradesh',
  'Gujarat', 'Dadra and Nagar Haveli and Daman and Diu', 'Maharashtra', 'Karnataka', 'Goa', 'Lakshadweep',
  'Kerala', 'Tamil Nadu', 'Puducherry', 'Andaman and Nicobar Islands', 'Telangana', 'Andhra Pradesh',
  'Ladakh', 'Other Territory',
] as const;

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
  /** Delivery challan only — a CGST Rule 55 code. */
  transportReason?: TransportReason;
  /** The reason in words, when `transportReason` is OTHER. */
  transportReasonNote?: string;
  /** Purchase order only — when the goods are wanted. */
  deliveryDate?: string;
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
  /** Delivery challan only (CGST Rule 55) — `issue` refuses a challan without one. */
  transportReason?: TransportReason;
  transportReasonNote?: string;
  /** Purchase order only — ISO date string, never before `documentDate`. */
  deliveryDate?: string;
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
  transportReason?: TransportReason;
  transportReasonNote?: string;
  deliveryDate?: string;
  /** The job this bill is for, when the screen was opened from one. */
  sourceType?: 'BOOKING' | 'ORDER';
  sourceId?: string;
}
