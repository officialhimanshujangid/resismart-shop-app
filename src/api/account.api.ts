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

export const accountApi = {
  requestDeletion: () =>
    apiClient
      .post<ApiEnvelope<AccountDeletionRequest>>('/me/account/delete/request', {})
      .then((r) => unwrap(r.data)),
  /**
   * Every session is revoked server-side the moment this answers 200 — the
   * caller must sign out locally straight after, and must not expect any later
   * authenticated request to succeed.
   */
  confirmDeletion: (code: string) =>
    apiClient
      .post<ApiEnvelope<unknown>>('/me/account/delete/confirm', { code })
      .then((r) => r.data),
};
