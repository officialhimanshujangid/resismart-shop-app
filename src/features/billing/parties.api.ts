import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
import { PartnerPartyRecord, PartyAddress, PartyKind } from './types';

/** The two sides `GET /partners/me/parties?side=` accepts — never `BOTH`, which is a party's own kind, not a query filter. */
export type PartySearchSide = 'CUSTOMER' | 'SUPPLIER';

/** `/partners/me/parties` — read against `partner-party.controller.ts` / `partner-billing.validator.ts`. */

export interface PartyListResult {
  data: PartnerPartyRecord[];
  page: number;
  limit: number;
  total: number;
}

export interface CreatePartyPayload {
  kind?: PartyKind;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  billingAddress?: PartyAddress;
  isWalkIn?: boolean;
}

export const partiesApi = {
  /**
   * `side` matches `kind === side || kind === 'BOTH'` on the server
   * (`kindsForSide`). Defaults to `CUSTOMER` — the New Invoice screen's
   * original, sales-only use of this — but a purchase-side document (C5) or
   * an OUT payment (C1) needs the SUPPLIER half of the same search, which is
   * why this takes a side rather than hardcoding one.
   */
  search: (q: string, side: PartySearchSide = 'CUSTOMER', limit = 15) =>
    apiClient
      .get<PartyListResult>('/partners/me/parties', { params: { side, q, limit, isActive: 'true' } })
      .then((r) => r.data.data),

  create: (payload: CreatePartyPayload) =>
    apiClient
      .post<ApiEnvelope<PartnerPartyRecord>>('/partners/me/parties', payload)
      .then((r) => unwrap(r.data)),
};
