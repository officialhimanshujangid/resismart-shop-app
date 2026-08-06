import { PartnerDocumentType } from '../billing/types';

/**
 * The payments vocabulary — mirrors `IPartnerPayment` in
 * `backend/src/models/partner-payment.model.ts`. One model for both money
 * coming in against a sale and money going out against a purchase, told
 * apart by `direction`; see that model's header on why `sum(allocations) +
 * onAccountPaise === amountPaise` is the invariant this whole screen exists
 * to make easy to satisfy, not to re-check — the server enforces it inside
 * one transaction every time.
 *
 * **Shapes here are read off the actual controller responses
 * (`partner-payment.controller.ts`), not guessed from the web app.** Two
 * things differ from `frontend/.../partner/payments/shared.ts`'s `Payment`
 * type, and both matter for anyone touching this file next:
 *
 *   1. `list`/`getOne` `.populate('partyId', 'name kind')` — so `partyId` on
 *      those responses is an OBJECT (`{_id, name, kind}`), not a string, and
 *      there is no separate `partyName` field. `create`/`cancel` return the
 *      raw saved document, where `partyId` is still an unpopulated string.
 *      `partyNameOf()` below is the one place that tells the two apart.
 *   2. `_id`, not `id` — every mongoose response in this codebase is `_id`
 *      (see `PartnerDocumentRecord`), and the payment controller never
 *      renames it.
 *   3. `allocations[]` is exactly `{documentId, amountPaise}` on the model —
 *      no denormalised `documentNumber`/`documentType`. A screen that wants
 *      to show what a payment settled has to hold the document list it built
 *      the allocation from, not read it back off the payment.
 */

export const PAYMENT_DIRECTIONS = ['IN', 'OUT'] as const;
export type PaymentDirection = typeof PAYMENT_DIRECTIONS[number];

export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'BANK', 'ONLINE'] as const;
export type PaymentMode = typeof PAYMENT_MODES[number];

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  BANK: 'Bank transfer',
  ONLINE: 'Online',
};

export const PAYMENT_STATUSES = ['RECORDED', 'CANCELLED'] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];

export interface PaymentAllocation {
  documentId: string;
  amountPaise: number;
}

/** What `partyId` looks like on a POPULATED row (`list`/`getOne`). */
export interface PaymentPartyRef {
  _id: string;
  name: string;
  kind: string;
}

export interface PaymentRecord {
  _id: string;
  partnerId: string;
  /** Object on `list`/`getOne` (populated), plain id string on `create`/`cancel`. */
  partyId: PaymentPartyRef | string;
  direction: PaymentDirection;
  mode: PaymentMode;
  status: PaymentStatus;
  amountPaise: number;
  allocations: PaymentAllocation[];
  allocatedPaise: number;
  onAccountPaise: number;
  reference?: string;
  upiTxnRef?: string;
  receivedAt: string;
  recordedByName: string;
  cancelledAt?: string;
  cancelledByName?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** `payment.partyId.name` when populated, a placeholder otherwise — never throws on the unpopulated shape `create`/`cancel` return. */
export const partyNameOf = (payment: PaymentRecord): string =>
  typeof payment.partyId === 'object' && payment.partyId !== null ? payment.partyId.name : 'Party';

export const partyIdOf = (payment: PaymentRecord): string =>
  typeof payment.partyId === 'object' && payment.partyId !== null ? payment.partyId._id : payment.partyId;

/**
 * The document types a payment of this direction can settle — mirrors
 * `SETTLEABLE_TYPES` in the web `payments/shared.ts`, itself read off
 * `PARTNER_DOCUMENT_BEHAVIOUR.settlement`. Only decides which documents the
 * allocation picker OFFERS; the server re-checks `behaviourOf(doc.type).settlement`
 * against `direction` inside the same transaction that writes the payment.
 */
export const SETTLEABLE_TYPES: Record<PaymentDirection, PartnerDocumentType[]> = {
  IN: ['TAX_INVOICE', 'DEBIT_NOTE'],
  OUT: ['PURCHASE_INVOICE', 'CREDIT_NOTE', 'SALES_RETURN'],
};

/** The slice of a document an allocation picker needs — never the full record. */
export interface AllocatableDocument {
  _id: string;
  number?: string;
  type: PartnerDocumentType;
  documentDate: string;
  totals: { grandPaise: number };
  paidPaise: number;
}

export const outstandingOf = (d: AllocatableDocument): number => Math.max(0, d.totals.grandPaise - d.paidPaise);
