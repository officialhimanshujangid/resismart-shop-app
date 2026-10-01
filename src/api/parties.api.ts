import { apiClient, ApiEnvelope, unwrap } from './axios';

/**
 * `/partners/me/parties` — customers, suppliers, and the ones who are both.
 *
 * Mirrors `backend/src/controllers/partner-party.controller.ts` and
 * `backend/src/validators/partner-billing.validator.ts` field for field. `kind`
 * is never re-declared as a local union — `PARTY_KINDS` on the model is the one
 * source of truth, and it is small enough (three literals) that importing it
 * from the generated contract is not worth a second round of code generation
 * the way the five-member `PartnerModule` union was. If it ever changes on the
 * server this file's `PartyKind` must change with it.
 */
export const PARTY_KINDS = ['CUSTOMER', 'SUPPLIER', 'BOTH'] as const;
export type PartyKind = typeof PARTY_KINDS[number];
export type PartySide = 'CUSTOMER' | 'SUPPLIER';

export interface PartyAddress {
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface PartnerParty {
  _id: string;
  kind: PartyKind;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  billingAddress?: PartyAddress;
  shippingAddress?: PartyAddress;
  openingBalancePaise: number;
  /** A CACHE — see the model header. Render it, but `ledger()` is the truth. */
  outstandingPaise: number;
  outstandingRecomputedAt?: string;
  isWalkIn: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // ── P1 (CONTRACT-partner-P1 §1.4 / §7.1) — all optional.
  supplier?: SupplierDetails;
  tags?: string[];
  credit?: { limitPaise?: number; days?: number; mode?: 'WARN' | 'BLOCK' };
  collectionPlan?: {
    nextDate?: string; cadence?: 'NONE' | 'ON_DATE' | 'WEEKLY' | 'MONTHLY'; weekday?: number; dayOfMonth?: number;
    autoRemind?: boolean; channel?: 'PUSH' | 'WHATSAPP' | 'SMS'; lastRemindedAt?: string; remindCount?: number; optedOutAt?: string;
  };
  /** A customer who uses the ResiSmart app (push reminders reach them). */
  isResidentLinked?: boolean;
  /** Set when the customer is a resident on the ResiSmart app (the party JSON carries this, not the flag). */
  residentUserId?: string;
}

/** The supplier master (§1.4). The PAN is stored MASKED — the full PAN is only ever sent, never read back. */
export interface SupplierDetails {
  contactPerson?: string;
  paymentTermsDays?: number;
  leadTimeDays?: number;
  isComposition?: boolean;
  panMasked?: string;
  msmeUdyamNo?: string;
  bank?: { name?: string; acNoLast4?: string; ifsc?: string; upiId?: string };
  notes?: string;
}

/** What the form sends: `pan` in full (masked by the server), never `panMasked`. */
export type SupplierDetailsInput = Omit<SupplierDetails, 'panMasked'> & { pan?: string };

export interface PartyListQuery {
  side?: PartySide;
  q?: string;
  isActive?: 'true' | 'false';
  page?: number;
  limit?: number;
}

export interface PartyListResponse {
  data: PartnerParty[];
  page: number;
  limit: number;
  total: number;
}

export interface CreatePartyPayload {
  kind: PartyKind;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  billingAddress?: PartyAddress;
  shippingAddress?: PartyAddress;
  openingBalancePaise: number;
  isWalkIn: boolean;
  supplier?: SupplierDetailsInput;
  tags?: string[];
  /**
   * Opt in to the duplicate-GSTIN refusal (409 PARTY_GSTIN_ALREADY_USED). Without
   * it the server saves anyway and returns a `warnings` entry (old app builds).
   */
  checkDuplicateGstin?: boolean;
  /** Re-post after a 409 PARTY_GSTIN_ALREADY_USED to keep both parties. */
  confirmDuplicateGstin?: boolean;
}

export type UpdatePartyPayload = Partial<Omit<CreatePartyPayload, 'openingBalancePaise' | 'isWalkIn' | 'supplier' | 'tags'>> & {
  isActive?: boolean;
  /** An object REPLACES the supplier details; `null` removes them. */
  supplier?: SupplierDetailsInput | null;
  tags?: string[] | null;
};

export interface PartyLedgerEntry {
  at: string;
  kind: 'DOCUMENT' | 'PAYMENT';
  refId: string;
  documentType?: string;
  label: string;
  reference?: string;
  debitPaise: number;
  creditPaise: number;
  deltaPaise: number;
  balancePaise: number;
  onAccountPaise?: number;
}

export interface PartyLedger {
  partyId: string;
  partyName: string;
  kind: PartyKind;
  from?: string;
  to?: string;
  openingBalancePaise: number;
  broughtForwardPaise: number;
  entries: PartyLedgerEntry[];
  documentEffectPaise: number;
  paymentEffectPaise: number;
  closingBalancePaise: number;
  cachedOutstandingPaise: number;
  /** `null` when the window is not the whole history — see the server header. */
  driftPaise: number | null;
  outstandingRecomputedAt?: string;
}

export interface PartyRecomputeResult {
  openingBalancePaise: number;
  documentEffectPaise: number;
  paymentEffectPaise: number;
  outstandingPaise: number;
  previousOutstandingPaise: number;
  driftPaise: number;
}

export const partiesApi = {
  /**
   * The party picker's search (billing, payments) — active parties on one
   * SIDE, matched by name/phone. `side` matches `kind === side || kind ===
   * 'BOTH'` on the server (`kindsForSide`): a sale searches CUSTOMER, a
   * purchase document or an OUT payment searches SUPPLIER. This used to be a
   * second `partiesApi` in `features/billing/parties.api.ts`; merged here so
   * there is one client for `/partners/me/parties`.
   */
  search: (q: string, side: PartySide = 'CUSTOMER', limit = 15) =>
    apiClient
      .get<PartyListResponse>('/partners/me/parties', { params: { side, q, limit, isActive: 'true' } })
      .then((r) => r.data.data),

  list: (query: PartyListQuery) =>
    apiClient
      .get<PartyListResponse>('/partners/me/parties', { params: query })
      .then((r) => r.data),

  getOne: (id: string) =>
    apiClient.get<ApiEnvelope<PartnerParty>>(`/partners/me/parties/${id}`).then((r) => unwrap(r.data)),

  create: (payload: CreatePartyPayload) =>
    apiClient
      .post<ApiEnvelope<PartnerParty>>('/partners/me/parties', payload)
      .then((r) => unwrap(r.data)),

  update: (id: string, payload: UpdatePartyPayload) =>
    apiClient
      .put<ApiEnvelope<PartnerParty>>(`/partners/me/parties/${id}`, payload)
      .then((r) => unwrap(r.data)),

  /** Hides the party. Refused server-side while `outstandingPaise !== 0` — surface that message verbatim. */
  remove: (id: string) =>
    apiClient.delete<ApiEnvelope<unknown>>(`/partners/me/parties/${id}`).then((r) => r.data),

  ledger: (id: string, range?: { from?: string; to?: string }) =>
    apiClient
      .get<ApiEnvelope<PartyLedger>>(`/partners/me/parties/${id}/ledger`, { params: range })
      .then((r) => unwrap(r.data)),

  /** Rebuild the cached balance from the ledger. Needs `CUSTOMERS` at FULL. */
  recompute: (id: string) =>
    apiClient
      .post<ApiEnvelope<PartyRecomputeResult>>(`/partners/me/parties/${id}/recompute`, {})
      .then((r) => unwrap(r.data)),
};
