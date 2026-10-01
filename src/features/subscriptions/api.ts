import axios from 'axios';
import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';
import type {
  AttendanceMonth, AttendanceSheet, AttendanceStatus, BillOutcome, BillPreview, BillRowData, BillStatus,
  CreateSubscriptionBody, DeliveryRoute, DeliverySheet, EditBody, MarkEntry, MarkResult, Paged, Pause, Plan, PlanBody,
  ReviseBody, RouteKind, RouteStop, Subscription, SubscriptionDetail, SubscriptionKind, SubscriptionRow, SubscriptionStatus,
} from './types';

/**
 * `/api/v1/partners/me/subscriptions` (CONTRACT-partner-P2 §8, verified against
 * `backend/src/routes/subscription.routes.ts`). Every answer is `{success, data}`
 * except the list (`{success, data, page, limit, total}`).
 */
const BASE = '/partners/me/subscriptions';

export const subKeys = {
  all: () => ['p2', 'subscriptions'] as const,
  list: (q: object) => ['p2', 'subscriptions', 'list', q] as const,
  detail: (id: string, month: string) => ['p2', 'subscriptions', 'detail', id, month] as const,
  attendanceMonth: (id: string, month: string) => ['p2', 'subscriptions', 'attendance-month', id, month] as const,
  preview: (id: string, period: string) => ['p2', 'subscriptions', 'preview', id, period] as const,
  plans: () => ['p2', 'subscriptions', 'plans'] as const,
  routes: () => ['p2', 'subscriptions', 'routes'] as const,
  holidays: () => ['p2', 'subscriptions', 'holidays'] as const,
  sheet: (day: string, routeId: string) => ['p2', 'subscriptions', 'sheet', day, routeId] as const,
  attendance: (day: string, batchId: string) => ['p2', 'subscriptions', 'attendance', day, batchId] as const,
  bills: (period: string, status: string) => ['p2', 'subscriptions', 'bills', period, status] as const,
};

export interface ListQuery { status?: SubscriptionStatus; kind?: SubscriptionKind; routeId?: string; q?: string; page?: number; limit?: number }

export const subscriptionsApi = {
  // plans
  plans: () => apiClient.get<ApiEnvelope<Plan[]>>(`${BASE}/plans`).then((r) => unwrap(r.data) ?? []),
  createPlan: (body: PlanBody) => apiClient.post<ApiEnvelope<Plan>>(`${BASE}/plans`, body).then((r) => unwrap(r.data)),
  updatePlan: (id: string, body: Partial<PlanBody>) =>
    apiClient.put<ApiEnvelope<Plan>>(`${BASE}/plans/${id}`, body).then((r) => unwrap(r.data)),

  // subscriptions
  list: (q: ListQuery) =>
    apiClient.get<Paged<SubscriptionRow>>(BASE, { params: q }).then((r) => {
      const d = r.data as Partial<Paged<SubscriptionRow>> | undefined;
      return { data: Array.isArray(d?.data) ? d!.data : [], page: d?.page ?? 1, limit: d?.limit ?? 50, total: d?.total ?? 0 };
    }),
  detail: (id: string, month?: string) =>
    apiClient.get<ApiEnvelope<SubscriptionDetail>>(`${BASE}/${id}`, { params: month ? { month } : {} }).then((r) => unwrap(r.data)),
  /** 400 SUBSCRIPTION_PARTY_NOT_CUSTOMER / SUBSCRIPTION_SCHEDULE_INVALID; 404 PARTY_NOT_FOUND. */
  create: (body: CreateSubscriptionBody, key: string) =>
    apiClient.post<ApiEnvelope<Subscription>>(BASE, body, withIdempotency(key)).then((r) => unwrap(r.data)),
  /** 409 SUBSCRIPTION_PERIOD_BILLED {period, number} when `effectiveFrom` is inside a billed month. */
  revise: (id: string, body: ReviseBody) =>
    apiClient.post<ApiEnvelope<Subscription>>(`${BASE}/${id}/revise`, body).then((r) => unwrap(r.data)),
  edit: (id: string, body: EditBody) =>
    apiClient.put<ApiEnvelope<Subscription>>(`${BASE}/${id}`, body).then((r) => unwrap(r.data)),
  end: (id: string, body: { endDate: string; reason: string }) =>
    apiClient.post<ApiEnvelope<Subscription>>(`${BASE}/${id}/end`, body).then((r) => unwrap(r.data)),
  /** Restart an ENDED one: the stopped days become a shop pause (server). */
  resume: (id: string) => apiClient.post<ApiEnvelope<Subscription>>(`${BASE}/${id}/resume`, {}).then((r) => unwrap(r.data)),

  // pauses
  addPause: (id: string, body: { from: string; to: string; reason?: string }, key: string) =>
    apiClient.post<ApiEnvelope<Pause>>(`${BASE}/${id}/pauses`, body, withIdempotency(key)).then((r) => unwrap(r.data)),
  /** Only before it starts (409 SUBSCRIPTION_PAUSE_ALREADY_STARTED). */
  removePause: (id: string, pauseId: string) =>
    apiClient.delete<ApiEnvelope<Pause>>(`${BASE}/${id}/pauses/${pauseId}`).then((r) => unwrap(r.data)),
  /** "Restart deliveries" from `resumeFrom`. */
  endPause: (id: string, pauseId: string, resumeFrom: string) =>
    apiClient.post<ApiEnvelope<Pause>>(`${BASE}/${id}/pauses/${pauseId}/end`, { resumeFrom }).then((r) => unwrap(r.data)),

  // holidays (SHOP pauses)
  holidays: () => apiClient.get<ApiEnvelope<Pause[]>>(`${BASE}/holidays`).then((r) => unwrap(r.data) ?? []),
  addHoliday: (body: { from: string; to: string; routeId?: string; reason?: string }, key: string) =>
    apiClient.post<ApiEnvelope<Pause>>(`${BASE}/holidays`, body, withIdempotency(key)).then((r) => unwrap(r.data)),
  removeHoliday: (holidayId: string) =>
    apiClient.delete<ApiEnvelope<Pause>>(`${BASE}/holidays/${holidayId}`).then((r) => unwrap(r.data)),

  // routes / classes (GET accepts SUBSCRIPTIONS_VIEW or DELIVERIES_MARK)
  routes: () => apiClient.get<ApiEnvelope<DeliveryRoute[]>>(`${BASE}/routes`).then((r) => unwrap(r.data) ?? []),
  createRoute: (body: { kind: RouteKind; name: string; timeText?: string; isActive?: boolean }) =>
    apiClient.post<ApiEnvelope<DeliveryRoute>>(`${BASE}/routes`, body).then((r) => unwrap(r.data)),
  updateRoute: (id: string, body: { name?: string; timeText?: string; isActive?: boolean }) =>
    apiClient.put<ApiEnvelope<DeliveryRoute>>(`${BASE}/routes/${id}`, body).then((r) => unwrap(r.data)),
  deleteRoute: (id: string) => apiClient.delete<ApiEnvelope<{ id: string }>>(`${BASE}/routes/${id}`).then((r) => unwrap(r.data)),
  /**
   * A route's stops in walking order (0-based `order`; DELIVERIES_MARK may read it).
   * `null` on a server that predates it (404) — the sheet then falls back to today's order.
   */
  routeStops: (id: string) =>
    apiClient.get<ApiEnvelope<{ route: unknown; stops: RouteStop[] }>>(`${BASE}/routes/${id}/stops`)
      .then((r) => unwrap(r.data)?.stops ?? [])
      .catch((e: unknown) => {
        if (axios.isAxiosError(e) && e.response?.status === 404 && (e.response.data as { code?: string } | undefined)?.code !== 'SUBSCRIPTION_ROUTE_NOT_FOUND') return null;
        throw e;
      }),
  /** The walking order: `routeSeq` = position in `subscriptionIds` (≤500). */
  orderRoute: (id: string, subscriptionIds: string[]) =>
    apiClient.put<ApiEnvelope<{ updated: number }>>(`${BASE}/routes/${id}/order`, { subscriptionIds }).then((r) => unwrap(r.data)),

  // deliveries
  sheet: (day: string, routeId?: string) =>
    apiClient.get<ApiEnvelope<DeliverySheet>>(`${BASE}/deliveries`, { params: routeId ? { day, routeId } : { day } })
      .then((r) => unwrap(r.data)),
  /**
   * ≤500 entries. The server applies the good entries and lists the refused ones
   * (`refused[]`); when every entry is refused it answers the coded 409 with the
   * same list under `data`. An older server answers `{saved}` only.
   */
  mark: (day: string, entries: MarkEntry[], key: string) =>
    apiClient.post<ApiEnvelope<MarkResult>>(`${BASE}/deliveries/mark`, { day, entries }, withIdempotency(key))
      .then((r) => unwrap(r.data)),
  /** Fills only DUE rows without a mark. */
  markAll: (day: string, routeId: string, key: string) =>
    apiClient.post<ApiEnvelope<{ saved: number }>>(`${BASE}/deliveries/mark-all`, { day, routeId }, withIdempotency(key))
      .then((r) => unwrap(r.data)),

  // attendance
  attendanceSheet: (day: string, batchId?: string) =>
    apiClient.get<ApiEnvelope<AttendanceSheet>>(`${BASE}/attendance`, { params: batchId ? { day, batchId } : { day } })
      .then((r) => unwrap(r.data)),
  markAttendance: (body: { day: string; batchId?: string; entries: { subscriptionId: string; status: AttendanceStatus }[] }, key: string) =>
    apiClient.post<ApiEnvelope<{ saved: number }>>(`${BASE}/attendance/mark`, body, withIdempotency(key)).then((r) => unwrap(r.data)),
  attendanceMonth: (id: string, month: string) =>
    apiClient.get<ApiEnvelope<AttendanceMonth>>(`${BASE}/${id}/attendance`, { params: { month } }).then((r) => unwrap(r.data)),

  // bills
  preview: (id: string, period: string) =>
    apiClient.get<ApiEnvelope<BillPreview>>(`${BASE}/${id}/bill-preview`, { params: { period } }).then((r) => unwrap(r.data)),
  bills: (q: { period?: string; status?: BillStatus }) =>
    apiClient.get<ApiEnvelope<BillRowData[]>>(`${BASE}/bills`, { params: q }).then((r) => unwrap(r.data) ?? []),
  runBills: (period: string, key: string) =>
    apiClient.post<ApiEnvelope<{ results: BillOutcome[] }>>(`${BASE}/bills/run`, { period }, withIdempotency(key))
      .then((r) => unwrap(r.data)),
  retryBill: (billId: string, key: string) =>
    apiClient.post<ApiEnvelope<{ results: BillOutcome[] }>>(`${BASE}/bills/${billId}/retry`, {}, withIdempotency(key))
      .then((r) => unwrap(r.data)),
};
