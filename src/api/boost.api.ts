import { apiClient } from './axios';
import type { PartnerBoostStatus } from '../types/api-contract.generated';
import type { BoostTax } from '../lib/boostTax';

/**
 * `/partners/me/promotion` — buy and track boosts, mirroring
 * `backend/src/controllers/partner-boost.controller.ts`.
 *
 * Not wrapped in `{ success, data }` — this controller answers with its own
 * flat shapes (`packages`/`boostAvailable`, `current`/`history`), so `unwrap`
 * would strip nothing and is skipped rather than called for cosmetic
 * consistency.
 *
 * `requirePartnerModule('PROMOTION')` is deliberately absent server-side on
 * this router (see the route file), so `getBoostPackages` answers even for a
 * plan that does not sell boost — `boostAvailable: false` IS the upgrade
 * prompt, not a 404 hiding the feature. `checkoutBoost` answers a 402 for the
 * same partner, which `isUpgradeRequired()` in `axios.ts` already recognises.
 */

export interface BoostPackage {
  /**
   * `id`, NOT `_id`. `sellablePackages()` in `partner-ad-setting.service.ts`
   * serializes the subdocument id as `id`, so the `_id` this used to declare
   * never existed on the wire: every checkout posted `{ packageId: undefined }`
   * and the server's `packageId: objectId` validator answered 400 before a
   * boost — free or paid — was ever created. The web client hit the identical
   * bug and named it in `promotion/shared.ts`; this matches the wire shape, not
   * the Mongoose convention the rest of this file's own documents use.
   */
  id: string;
  label: string;
  pricePaise: number;
  durationDays: number;
  radiusKm: number;
  topPlacement: boolean;
}

export interface BoostPackagesResponse {
  success: boolean;
  partnersEnabled: boolean;
  currency: string;
  packages: BoostPackage[];
  boostAvailable: boolean;
  upgradeRequired: boolean;
  planName: string;
  isFreeTier: boolean;
  message?: string;
}

export interface PartnerBoostView {
  id: string;
  package: { label: string; pricePaise: number; durationDays: number; radiusKm: number; topPlacement: boolean };
  amountPaise: number;
  currency: string;
  status: PartnerBoostStatus;
  startAt: string | null;
  endAt: string | null;
  daysRemaining: number;
  purchasedByName: string;
  purchasedAt: string;
  /** GST split of a PAID boost (tax-inclusive price); `null` for free or older boosts. */
  tax?: BoostTax | null;
}

export interface MyBoostsResponse {
  success: boolean;
  current: PartnerBoostView | null;
  history: PartnerBoostView[];
}

/**
 * A free package (owner-configured launch offer) applies with no gateway at
 * all — `free: true` and nothing else to do. A paid one returns a Razorpay
 * order for `checkoutBoost.startCheckout` to open.
 */
export type CheckoutBoostResponse =
  | { success: true; free: true; boostId: string; message: string; boost?: PartnerBoostView }
  | {
      success: true;
      keyId: string;
      orderId: string;
      amountPaise: number;
      currency: string;
      boostId: string;
      packageLabel: string;
      tax?: BoostTax | null;
    };

/**
 * What a radius actually buys, from `GET /partners/me/promotion/reach`.
 *
 * `effectiveRadiusKm` is the number a resident's default search really reaches
 * — `visibilityCeilingKm` clamps the asked-for radius by the partner's own
 * service modes and radius, so a 10 km package on a business that only serves
 * 3 km reaches 3 km. Kept and shown, because a partner reading "8 societies"
 * beside "10 km" deserves to know when the 10 is not the number that counted.
 */
export interface BoostReach {
  radiusKm: number;
  effectiveRadiusKm: number;
  societyCount: number;
  residentCount: number;
}

export interface VerifyBoostPayload {
  boostId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export const boostApi = {
  packages: () => apiClient.get<BoostPackagesResponse>('/partners/me/promotion/packages').then((r) => r.data),

  myBoosts: () => apiClient.get<MyBoostsResponse>('/partners/me/promotion/boosts').then((r) => r.data),

  /**
   * How many societies and residents this radius reaches from the shop's own
   * pin. Answered by `partner-browse.controller.ts#promotionReach` — the same
   * geo pipeline resident discovery runs, which is the whole point: a reach
   * number computed a second way would promise a reach the boost does not
   * deliver.
   *
   * There is deliberately no partner id to pass — the server reads it off the
   * signed session, so this can only ever report the caller's own reach. Errors
   * are left to the caller: a 409 `PARTNER_LOCATION_MISSING` (no map pin yet)
   * has a next step, and a zero drawn in its place would read as "this package
   * reaches nobody".
   *
   * Wrapped in `{ success, data }`, unlike the rest of this file — it lives on
   * the browse controller, which uses the app-wide envelope.
   */
  reach: (radiusKm: number) =>
    apiClient
      .get<{ success: boolean; data: BoostReach }>('/partners/me/promotion/reach', { params: { radiusKm } })
      .then((r) => r.data.data),

  status: (boostId: string) =>
    apiClient
      .get<{ success: boolean; boost: PartnerBoostView }>(`/partners/me/promotion/boosts/${boostId}`)
      .then((r) => r.data.boost),

  checkout: (packageId: string) =>
    apiClient
      .post<CheckoutBoostResponse>('/partners/me/promotion/checkout', { packageId })
      .then((r) => r.data),

  /**
   * Answers with the boost as re-read AFTER activation (`status: 'ACTIVE'`,
   * `endAt`, `daysRemaining`) — the fresh state, not the PENDING copy. A
   * caller should also invalidate `qk.promotion()` so the lists agree.
   */
  verify: (payload: VerifyBoostPayload) =>
    apiClient
      .post<{ success: boolean; boost: PartnerBoostView }>('/partners/me/promotion/verify', payload)
      .then((r) => r.data.boost),
};
