/**
 * What the partner reviews screen reads off the wire.
 *
 * `ReviewPublicView` is `serializeReviewPublic` in
 * `backend/src/services/partner-review.service.ts`, field for field — the
 * mobile twin of `frontend/src/app/(dashboard)/dashboard/partner/reviews/shared.ts`.
 * There is no `residentUserId` here and `authorName` arrives masked ("Priya
 * N."), because this screen reads the SAME public list a resident sees on the
 * partner's profile — see `api.ts`'s header for why there is no partner-scoped
 * review list on the server to call instead.
 */
export interface ReviewPublicView {
  _id: string;
  partnerId: string;
  bookingId?: string;
  orderId?: string;
  /** Masked to "First L." for every reader but the author themselves. */
  authorName: string;
  rating: number;
  text?: string;
  photos?: string[];
  moderationStatus: 'PUBLISHED' | 'HELD' | 'REMOVED';
  partnerReply?: { text: string; at: string; byName?: string };
  createdAt: string;
  updatedAt: string;
}

/**
 * The window `replyToReview` enforces server-side (`REPLY_EDIT_WINDOW_MS` in
 * `partner-review.service.ts`).
 *
 * Restated here so the screen can grey the Edit action out BEFORE the tap
 * rather than after the 403 — a hint, never a check. The server owns the rule;
 * a clock skew between the phone and the server must not let an edit through
 * or block one the server would allow.
 */
export const REPLY_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export const replyStillEditable = (at: string): boolean =>
  Date.now() - new Date(at).getTime() <= REPLY_EDIT_WINDOW_MS;

export const fmtReviewDate = (value?: string): string =>
  value
    ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
