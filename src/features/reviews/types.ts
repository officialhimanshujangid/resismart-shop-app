/**
 * What the partner reviews screen reads off the wire.
 *
 * Read from `GET /reviews/mine` (`serializeReviewsForPartner`), which is the
 * same shape plus `bookingId`/`orderId` and includes HELD reviews.
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

/**
 * `fmtReviewDate` used to live here as
 * `toLocaleDateString('en-IN', { month: 'short' })` and is gone.
 *
 * A date contains a WORD, and both halves of that call were wrong once this app
 * had a second language: the locale was pinned to `en-IN` regardless of what the
 * partner chose, and `Intl`'s month names are not something Hermes on Android
 * can be relied on to have at all — `src/i18n/index.ts#formatI18nDate` sets out
 * why, and is what both review call sites now use. It needs `t`, so it is called
 * from the component rather than from a module-level helper.
 */
