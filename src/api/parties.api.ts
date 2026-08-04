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
}

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
}

export type UpdatePartyPayload = Partial<Omit<CreatePartyPayload, 'openingBalancePaise' | 'isWalkIn'>> & {
  isActive?: boolean;
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
