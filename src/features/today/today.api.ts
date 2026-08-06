import { apiClient } from '../../api/axios';
import { PagedRows, TodayOrderRow, TodayProductRow } from './today.types';

/**
 * Read-only calls the Today screen needs from Orders and Catalogue, for the
 * ROW-LEVEL strips (which orders, which products) — the headline numbers
 * (today's sale, order count, pending decisions, low-stock count, the 14-day
 * sparkline) come from `GET /analytics/partner/today`
 * (`src/api/analytics.api.ts`, `useTodayAnalytics` in `./hooks`) instead.
 *
 * This file used to ALSO carry a `today(civilDate)` call that fetched
 * `limit: 100` orders just to sum them client-side into a sale total — the
 * compromise `partner-today.service.ts` on the backend now documents and
 * replaces (there was no aggregate endpoint yet, and the closest one,
 * `GET /partners/me/reports/sales`, sits behind the `INVOICING` module most
 * partners on the Bookings/Orders plan do not buy). With the aggregate board
 * in place that call and its `useTodaySale`/`useTodayOrdersForSale` hooks are
 * gone — `pending` below stays, because it feeds the actual ROW LIST shown in
 * the pending-orders strip, which the aggregate board (a count, not rows)
 * cannot replace.
 */
export const todayOrdersApi = {
  /** `PLACED` orders — the ones needing an accept/reject decision right now. */
  pending: () =>
    apiClient
      .get<{ success: boolean } & PagedRows<TodayOrderRow>>('/partners/me/orders', {
        params: { status: 'PLACED', limit: 100 },
      })
      .then((r) => r.data),
};

export const todayProductsApi = {
  lowStock: () =>
    apiClient
      .get<{ success: boolean } & PagedRows<TodayProductRow>>('/partners/me/products', {
        params: { lowStock: 'true', limit: 100 },
      })
      .then((r) => r.data),
};
