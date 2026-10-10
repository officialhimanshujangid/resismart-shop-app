import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
import { ReviewPublicView } from './types';

/**
 * Reviews, read and replied to — C7.
 *
 * `POST /api/v1/reviews/:id/reply` (`partner-review.routes.ts`) was built and
 * mounted with no caller anywhere in this app: the partner had no way to
 * answer a customer's review from the phone, only from the web panel.
 *
 * THE PARTNER'S OWN LIST — `GET /reviews/mine`
 *
 * This business's reviews INCLUDING the ones a moderator has HELD (the public
 * list hides those, and a business that cannot see why its count moved cannot
 * answer for it). Default PUBLISHED + HELD; `?status=` narrows. Needs
 * `BOOKINGS_VIEW` or `ORDERS_VIEW` at READ. Names still arrive masked.
 *
 * Replying (`POST /reviews/:id/reply`) needs `BOOKINGS_MANAGE` or
 * `ORDERS_MANAGE` at FULL (or the owner); anyone else gets 403
 * `REVIEW_REPLY_NOT_ALLOWED` (or `ACCESS_NOT_ASSIGNED` while awaiting a role).
 */
export interface ReviewListPage {
  data: ReviewPublicView[];
  total: number;
  page: number;
  limit: number;
}

/** Longest reply the server takes (`REVIEW_REPLY_TOO_LONG` past it). */
export const REPLY_MAX_LENGTH = 2000;

/** The web panel's filter strip (`partner/reviews/shared.ts` REVIEW_FILTERS), same keys. */
export const REVIEW_FILTERS = ['all', 'PUBLISHED', 'HELD', 'REMOVED'] as const;
export type ReviewFilter = typeof REVIEW_FILTERS[number];

export const reviewsApi = {
  /** The signed-in business's own reviews — the server reads the business off the session. */
  /** M19 parity with web: `status` narrows the list (All = published + held, the server default). */
  list: (page: number, limit: number, status?: ReviewFilter) =>
    apiClient
      .get<ReviewListPage>('/reviews/mine', { params: { page, limit, ...(status && status !== 'all' ? { status } : {}) } })
      .then((r) => r.data),

  reply: (reviewId: string, text: string) =>
    apiClient
      .post<ApiEnvelope<ReviewPublicView>>(`/reviews/${reviewId}/reply`, { text })
      .then((r) => unwrap(r.data)),
};
