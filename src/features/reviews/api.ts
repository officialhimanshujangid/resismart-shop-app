import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
import { ReviewPublicView } from './types';

/**
 * Reviews, read and replied to — C7.
 *
 * `POST /api/v1/reviews/:id/reply` (`partner-review.routes.ts`) was built and
 * mounted with no caller anywhere in this app: the partner had no way to
 * answer a customer's review from the phone, only from the web panel.
 *
 * WHY THIS READS THE **PUBLIC** LIST
 *
 * There is no partner-scoped review list on the server — see
 * `backend/src/routes/partner-review.routes.ts`'s own header: the four
 * routers it mounts are resident-create, partner-reply, public-list and
 * owner-moderate. So this calls `GET /partners/:partnerId/reviews` with the
 * signed-in partner's own id, exactly as the web screen does
 * (`frontend/.../partner/reviews/page.tsx`), and that is the honest behaviour
 * rather than a workaround: the partner sees precisely the list a resident
 * browsing their profile sees, masked names and all. A HELD review is not in
 * it — releasing one is the owner console's job, not this screen's.
 */
export interface ReviewListPage {
  data: ReviewPublicView[];
  total: number;
  page: number;
  limit: number;
}

export const reviewsApi = {
  /** `partnerId` is the signed-in partner's own tenant id — never a query string a screen invents. */
  list: (partnerId: string, page: number, limit: number) =>
    apiClient
      .get<ReviewListPage>(`/partners/${partnerId}/reviews`, { params: { page, limit } })
      .then((r) => r.data),

  reply: (reviewId: string, text: string) =>
    apiClient
      .post<ApiEnvelope<ReviewPublicView>>(`/reviews/${reviewId}/reply`, { text })
      .then((r) => unwrap(r.data)),
};
