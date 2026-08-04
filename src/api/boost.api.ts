import { apiClient } from './axios';
import type { PartnerBoostStatus } from '../types/api-contract.generated';

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
  _id: string;
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
  | { success: true; free: true; boostId: string; message: string }
  | {
      success: true;
      keyId: string;
      orderId: string;
      amountPaise: number;
      currency: string;
      boostId: string;
      packageLabel: string;
    };

export interface VerifyBoostPayload {
  boostId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export const boostApi = {
  packages: () => apiClient.get<BoostPackagesResponse>('/partners/me/promotion/packages').then((r) => r.data),

  myBoosts: () => apiClient.get<MyBoostsResponse>('/partners/me/promotion/boosts').then((r) => r.data),

  status: (boostId: string) =>
    apiClient
      .get<{ success: boolean; boost: PartnerBoostView }>(`/partners/me/promotion/boosts/${boostId}`)
      .then((r) => r.data.boost),

  checkout: (packageId: string) =>
    apiClient
      .post<CheckoutBoostResponse>('/partners/me/promotion/checkout', { packageId })
      .then((r) => r.data),

  verify: (payload: VerifyBoostPayload) =>
    apiClient
      .post<{ success: boolean; boost: PartnerBoostView }>('/partners/me/promotion/verify', payload)
      .then((r) => r.data.boost),
};
