import { useQuery } from '@tanstack/react-query';

import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';
import { availabilityApi } from '../availability/api';
import { servicesApi } from '../services/api';
import { istToday } from '../p2/dates';
import type {
  CalendarView, CustomerSummary, PackageBody, PackageRow, PurchaseRow, PurchaseStatus, SellResult, SeriesBody,
  SeriesCreated, SeriesDetail, SeriesEndBody, SeriesRow, SeriesStatus, TimeOffBody, TimeOffRow, WalkInBody,
} from './types';

/**
 * `/partners/me/appointments/**` (routes/appointment.routes.ts). The router is
 * gated on BOOKINGS ∩ APPOINTMENTS; each call's own permission is noted.
 * Creates that make money or bookings carry an Idempotency-Key minted by the
 * caller ONCE per decision and reused on a retry.
 */
const BASE = '/partners/me/appointments';

export const apptKeys = {
  all: ['p2', 'appointments'] as const,
  calendar: (day: string, staffIds?: string) => ['p2', 'appointments', 'calendar', day, staffIds ?? ''] as const,
  staff: () => ['p2', 'appointments', 'staff'] as const,
  availability: () => ['p2', 'appointments', 'availability'] as const,
  services: () => ['p2', 'appointments', 'services'] as const,
  summary: (partyId: string) => ['p2', 'appointments', 'summary', partyId] as const,
  timeOff: () => ['p2', 'appointments', 'timeOff'] as const,
  series: (status?: SeriesStatus) => ['p2', 'appointments', 'series', status ?? 'ALL'] as const,
  seriesOne: (id: string) => ['p2', 'appointments', 'seriesOne', id] as const,
  packages: () => ['p2', 'appointments', 'packages'] as const,
  purchases: (status?: PurchaseStatus) => ['p2', 'appointments', 'purchases', status ?? 'ALL'] as const,
};

export const appointmentsApi = {
  /** BOOKINGS_VIEW. `staffIds` is a comma-separated list; at most 31 days. */
  calendar: (from: string, to: string, staffIds?: string) =>
    apiClient.get<ApiEnvelope<CalendarView>>(`${BASE}/calendar`, { params: { from, to, ...(staffIds ? { staffIds } : {}) } })
      .then((r) => unwrap(r.data)),

  /** BOOKINGS_MANAGE — a walk-in / phone booking (origin PARTNER, ACCEPTED). */
  book: (body: WalkInBody, key: string) =>
    apiClient.post<ApiEnvelope<{ _id?: string; id?: string }>>(`${BASE}/bookings`, body, withIdempotency(key))
      .then((r) => unwrap(r.data)),

  /** BOOKINGS_VIEW — visits, no-shows (12 months), last visit, active packages. */
  customerSummary: (partyId: string) =>
    apiClient.get<ApiEnvelope<CustomerSummary>>(`${BASE}/customers/${partyId}/summary`).then((r) => unwrap(r.data)),

  timeOff: (q: { staffId?: string; from?: string; to?: string } = {}) =>
    apiClient.get<ApiEnvelope<TimeOffRow[]>>(`${BASE}/time-off`, { params: q }).then((r) => unwrap(r.data) ?? []),
  /** 409 STAFF_TIME_OFF_OVERLAPS_BOOKINGS {count} → send again with `confirmOverlaps: true`. */
  addTimeOff: (body: TimeOffBody) =>
    apiClient.post<ApiEnvelope<TimeOffRow>>(`${BASE}/time-off`, body).then((r) => unwrap(r.data)),
  removeTimeOff: (id: string) =>
    apiClient.delete<ApiEnvelope<TimeOffRow>>(`${BASE}/time-off/${id}`).then((r) => unwrap(r.data)),

  series: (status?: SeriesStatus) =>
    apiClient.get<ApiEnvelope<SeriesRow[]>>(`${BASE}/series`, { params: status ? { status } : {} })
      .then((r) => unwrap(r.data) ?? []),
  seriesOne: (id: string) =>
    apiClient.get<ApiEnvelope<SeriesDetail>>(`${BASE}/series/${id}`).then((r) => unwrap(r.data)),
  createSeries: (body: SeriesBody, key: string) =>
    apiClient.post<ApiEnvelope<SeriesCreated>>(`${BASE}/series`, body, withIdempotency(key)).then((r) => unwrap(r.data)),
  endSeries: (id: string, body: SeriesEndBody) =>
    apiClient.post<ApiEnvelope<{ series: SeriesRow; cancelled: number }>>(`${BASE}/series/${id}/end`, body)
      .then((r) => unwrap(r.data)),

  packages: () =>
    apiClient.get<ApiEnvelope<PackageRow[]>>(`${BASE}/packages`).then((r) => unwrap(r.data) ?? []),
  createPackage: (body: PackageBody) =>
    apiClient.post<ApiEnvelope<PackageRow>>(`${BASE}/packages`, body).then((r) => unwrap(r.data)),
  updatePackage: (id: string, body: Partial<PackageBody>) =>
    apiClient.put<ApiEnvelope<PackageRow>>(`${BASE}/packages/${id}`, body).then((r) => unwrap(r.data)),
  /** PACKAGES_MANAGE + INVOICING_MANAGE; counts toward `max_invoices_month` (402). */
  sellPackage: (id: string, body: { partyId: string; issue: boolean }, key: string) =>
    apiClient.post<ApiEnvelope<SellResult>>(`${BASE}/packages/${id}/sell`, body, withIdempotency(key))
      .then((r) => unwrap(r.data)),

  purchases: (status?: PurchaseStatus) =>
    apiClient.get<ApiEnvelope<PurchaseRow[]>>(`${BASE}/package-purchases`, { params: status ? { status } : {} })
      .then((r) => unwrap(r.data) ?? []),
  /** PACKAGES_MANAGE + DOCUMENTS_VOID; 409 PACKAGE_HAS_REDEMPTIONS once a session is used or held. */
  cancelPurchase: (id: string, reason: string) =>
    apiClient.post<ApiEnvelope<PurchaseRow>>(`${BASE}/package-purchases/${id}/cancel`, { reason }).then((r) => unwrap(r.data)),
};

// ─────────────────────────────────────────────── shared queries

/** Who works here (from today's calendar — BOOKINGS_VIEW is enough, unlike `/staff`). */
export function useApptStaff() {
  return useQuery({
    queryKey: apptKeys.staff(),
    queryFn: async () => {
      const today = istToday();
      const v = await appointmentsApi.calendar(today, today);
      return v?.staff ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

/** The business's own schedule — the grid every slot chip is drawn from. `null` = never set up. */
export function useApptAvailability() {
  return useQuery({
    queryKey: apptKeys.availability(),
    queryFn: async () => (await availabilityApi.get()) ?? null,
    staleTime: 5 * 60_000,
  });
}

/** Active services only (the ones a booking can be made for). */
export function useApptServices() {
  return useQuery({
    queryKey: apptKeys.services(),
    queryFn: async () => {
      const rows = await servicesApi.list({ isActive: 'true' });
      return (Array.isArray(rows) ? rows : []).filter((s) => s.isActive !== false);
    },
    staleTime: 5 * 60_000,
  });
}
