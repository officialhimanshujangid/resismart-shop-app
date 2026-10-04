import { apiClient, ApiEnvelope, unwrap } from './axios';
import { OtpDeliveredVia } from './auth.api';

/**
 * Deleting this PERSON's account — the in-app path Google Play requires.
 *
 * `/me/account/delete/**`, beside `/me/language`: scoped to `req.user`, not to
 * the business, so no partner permission or module gates it. What goes and what
 * stays is the server's decision; the screen only explains it
 * (`app/(app)/account/delete.tsx`).
 *
 * Two steps, because a tap on a till is not proof of anything: `request` sends
 * a code to the identity the account signs in with, and only `confirm` with
 * that code deletes. A 409 `DELETION_BLOCKED` on `request` means this person is
 * the only owner/admin of a business — its sentence says what to do, and the
 * screen prints it verbatim through `apiErrorMessage`.
 */

export interface AccountDeletionRequest {
  /** Which identity the code went to. */
  channel: 'PHONE' | 'EMAIL';
  deliveredVia: OtpDeliveredVia;
}

// >>> M01 audit — leave ONE place (BUG-019/026), parity with the web profile page
/** One flat of a place (`GET /me/account/places`). */
export interface PlaceFlat {
  flatId: string; label: string; relationship: string; isOwner: boolean; soleOwner: boolean; hasTenant: boolean;
}
/** One society or business this person is linked to, on any of their logins. */
export interface Place {
  kind: 'SOCIETY' | 'PARTNER';
  id: string;
  name: string;
  roles: string[];
  thisLogin: boolean;
  flats: PlaceFlat[];
  soleAdmin: boolean;
  canLeave: boolean;
  leaveBlock: 'LEAVE_SOLE_ADMIN' | 'LEAVE_SOLE_OWNER' | null;
}
export interface MyPlaces { places: Place[]; otherLogins: number }
// <<< M01 audit

export const accountApi = {
  requestDeletion: () =>
    apiClient
      .post<ApiEnvelope<AccountDeletionRequest>>('/me/account/delete/request', {})
      .then((r) => unwrap(r.data)),
  /**
   * Every session is revoked server-side the moment this answers 200 — the
   * caller must sign out locally straight after, and must not expect any later
   * authenticated request to succeed.
   *
   * M01 audit: `alsoOtherLogins` — the person's other phone/email login goes
   * too (the web and the society app offer the same tick-box).
   */
  confirmDeletion: (code: string, alsoOtherLogins = false) =>
    apiClient
      .post<ApiEnvelope<unknown>>('/me/account/delete/confirm', alsoOtherLogins ? { code, alsoOtherLogins: true } : { code })
      .then((r) => r.data),

  // >>> M01 audit
  /** GET /me/account/places — every place, and what leaving each would be refused for. */
  places: () =>
    apiClient.get<ApiEnvelope<MyPlaces>>('/me/account/places').then((r): MyPlaces => {
      const d = (unwrap(r.data) ?? {}) as Partial<MyPlaces>;
      return { places: Array.isArray(d.places) ? d.places : [], otherLogins: Number(d.otherLogins) || 0 };
    }),
  /** POST /me/account/leave — one society (no flatId) or one flat; every other place stays. */
  leave: (body: { societyId: string; flatId?: string }) =>
    apiClient
      .post<ApiEnvelope<{ stillMember?: boolean; places?: Place[] }>>('/me/account/leave', body)
      .then((r) => {
        const d = (unwrap(r.data) ?? {}) as { stillMember?: boolean; places?: Place[] };
        return { stillMember: d.stillMember === true, places: Array.isArray(d.places) ? d.places : [] };
      }),
  // <<< M01 audit
};
