import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
import { PartnerPartyRecord, PartyAddress, PartyKind } from './types';

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
   * `side: 'CUSTOMER'` matches `kind === 'CUSTOMER' || kind === 'BOTH'` on the
   * server (`kindsForSide`) — this screen only ever bills a customer, never a
   * supplier, so it always asks for that side.
   */
  search: (q: string, limit = 15) =>
    apiClient
      .get<PartyListResult>('/partners/me/parties', { params: { side: 'CUSTOMER', q, limit, isActive: 'true' } })
      .then((r) => r.data.data),

  create: (payload: CreatePartyPayload) =>
    apiClient
      .post<ApiEnvelope<PartnerPartyRecord>>('/partners/me/parties', payload)
      .then((r) => unwrap(r.data)),
};
