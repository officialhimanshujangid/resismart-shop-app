import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';
import type {
  JobCloseResult, JobDetail, JobGateView, JobInvoiceBody, JobInvoiceResult, JobListQuery, JobListResult,
  JobQuoteBody, JobQuoteResult, JobVisitBody, JobVisitResult,
} from './types';

/**
 * `/api/v1/partners/me/jobs` (`backend/src/routes/job.routes.ts`). Gates on the
 * server: BOOKINGS + INVOICING + the JOBS business-type module; per route
 * BOOKINGS_VIEW / BOOKINGS_MANAGE / JOBS_QUOTE + INVOICING_MANAGE.
 *
 * The three creating calls take an Idempotency-Key the SCREEN mints once, when
 * the person taps — and re-sends on a retry of the same tap.
 */
const BASE = '/partners/me/jobs';

export const jobsApi = {
  /** The list envelope is `{success, data, page, limit, total}` — not unwrapped. */
  list: (q: JobListQuery = {}) =>
    apiClient.get<ApiEnvelope<JobListResult['data']> & JobListResult>(BASE, {
      params: {
        ...(q.stage ? { stage: q.stage } : {}),
        ...(q.q && q.q.trim() ? { q: q.q.trim() } : {}),
        page: q.page ?? 1,
        limit: q.limit ?? 50,
      },
    }).then((r): JobListResult => ({
      data: Array.isArray(r.data?.data) ? r.data.data : [],
      page: Number(r.data?.page) || 1,
      limit: Number(r.data?.limit) || 50,
      total: Number(r.data?.total) || 0,
    })),

  get: (id: string) =>
    apiClient.get<ApiEnvelope<JobDetail>>(`${BASE}/${id}`).then((r) => unwrap(r.data)),

  /** Opens the job on the first quote. 400 JOB_QUOTE_EMPTY · 409 JOB_QUOTE_NOT_ALLOWED_NOW {stage} · 404 BOOKING_NOT_FOUND. */
  quote: (bookingId: string, body: JobQuoteBody, key: string) =>
    apiClient.post<ApiEnvelope<JobQuoteResult>>(`${BASE}/by-booking/${bookingId}/quotes`, body, withIdempotency(key))
      .then((r) => unwrap(r.data)),

  /** 409 JOB_VISIT_NOT_ALLOWED {stage}, and the booking slot codes. */
  visit: (id: string, body: JobVisitBody, key: string) =>
    apiClient.post<ApiEnvelope<JobVisitResult>>(`${BASE}/${id}/visits`, body, withIdempotency(key))
      .then((r) => unwrap(r.data)),

  refreshGate: (id: string) =>
    apiClient.post<ApiEnvelope<{ gate: JobGateView }>>(`${BASE}/${id}/gate-pass/refresh`, {})
      .then((r) => unwrap(r.data).gate),

  /** 409 JOB_NOT_COMPLETED · JOB_ALREADY_INVOICED {number} · JOB_NO_APPROVED_QUOTE · JOB_ALREADY_CLOSED. */
  invoice: (id: string, body: JobInvoiceBody, key: string) =>
    apiClient.post<ApiEnvelope<JobInvoiceResult>>(`${BASE}/${id}/invoice`, body, withIdempotency(key))
      .then((r) => unwrap(r.data)),

  /** 409 JOB_ALREADY_CLOSED. */
  close: (id: string, reason: string) =>
    apiClient.post<ApiEnvelope<JobCloseResult>>(`${BASE}/${id}/close`, { reason })
      .then((r) => unwrap(r.data)),
};

/** Under the `['p2']` prefix, so a live P2 event refreshes these too. */
export const jobKeys = {
  all: () => ['p2', 'jobs'] as const,
  list: (stage: string, q: string) => ['p2', 'jobs', 'list', stage, q] as const,
  detail: (id: string) => ['p2', 'jobs', 'detail', id] as const,
  pickBookings: () => ['p2', 'jobs', 'pick-bookings'] as const,
};
