import { apiClient } from '../../api/axios';
import { PagedRows, TodayOrderRow, TodayProductRow } from './today.types';

/**
 * Read-only calls the Today screen needs from Orders and Catalogue.
 *
 * `limit: 100` on both — there is no partner-facing endpoint that returns a
 * single "today's sale" number (the closest, `GET /partners/me/reports/sales`,
 * sits behind the `INVOICING` module and is a register export, not a dashboard
 * tile: gating the Today screen's sale total on a module most partners on the
 * Bookings/Orders plan do not buy would blank the one number they open the app
 * to see). A shop doing more than 100 orders or bookings before the total is
 * checked is a real business the owner should be told about — see
 * `ownerDecisionsNeeded` for the dedicated aggregate endpoint this should
 * become.
 */
export const todayOrdersApi = {
  /** `PLACED` orders — the ones needing an accept/reject decision right now. */
  pending: () =>
    apiClient
      .get<{ success: boolean } & PagedRows<TodayOrderRow>>('/partners/me/orders', {
        params: { status: 'PLACED', limit: 100 },
      })
      .then((r) => r.data),

  /** Everything touched today, for the sale total — `from`/`to` filter on `createdAt` server-side. */
  today: (civilDate: string) =>
    apiClient
      .get<{ success: boolean } & PagedRows<TodayOrderRow>>('/partners/me/orders', {
        params: { from: civilDate, to: civilDate, limit: 100 },
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
