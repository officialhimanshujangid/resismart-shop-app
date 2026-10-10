/**
 * APPOINTMENTS (partner suite P2, B3) — the wire shapes of
 * `/partners/me/appointments/**`, verified against the built backend:
 * `routes/appointment.routes.ts`, `validators/appointment.validator.ts`,
 * `services/appointment.service.ts` (calendar, customer card),
 * `services/appointment-series.service.ts` (SeriesView),
 * `services/appointment-package.service.ts` (PackageView / PurchaseView) and
 * `services/staff-time-off.service.ts` (TimeOffView). Instants arrive as ISO
 * strings; days are IST `YYYY-MM-DD`.
 */
import type { BookingStatus } from '../bookings/booking.types';
import type { ServiceMode } from '../services/types';

export interface CalendarStaff { id: string; name: string; canTakeBookings: boolean }

export interface CalendarBooking {
  id: string;
  code: string;
  slotStart: string;
  slotEnd: string;
  occupiesUntil: string;
  status: BookingStatus;
  serviceName?: string;
  customerName: string;
  seriesId?: string;
  packagePurchaseId?: string;
  jobId?: string;
}

export interface CalendarTimeOff { id: string; from: string; to: string; reason?: string }

export interface CalendarStaffDay {
  /** `null` = bookings nobody has been given yet (never carries time off). */
  staffId: string | null;
  bookings: CalendarBooking[];
  timeOff: CalendarTimeOff[];
}

export interface CalendarDay { day: string; byStaff: CalendarStaffDay[] }

export interface CalendarView { timezone: string; staff: CalendarStaff[]; days: CalendarDay[] }

export interface ActivePackage {
  id: string;
  name: string;
  remaining: number;
  expiresAt: string;
  /** Services the package covers (newer backends); absent = unknown, offer it for any service. */
  serviceIds?: string[];
}

/** `GET /customers/:partyId/summary` — the customer card. */
export interface CustomerSummary {
  visits: number;
  /** In the last 12 months. */
  noShows: number;
  lastVisit?: string;
  upcoming: number;
  activePackages: ActivePackage[];
}

export interface BookingAddress { line1: string; line2?: string; city?: string; state?: string; pincode?: string }

/** `POST /bookings` (`partnerBookingCreateSchema`, strict). */
export interface WalkInBody {
  partyId: string;
  serviceId: string;
  staffId?: string;
  slotStart: string;
  mode: ServiceMode;
  address?: BookingAddress;
  packagePurchaseId?: string;
  note?: string;
  notifyCustomer: boolean;
}

/** TimeOffView. */
export interface TimeOffRow {
  id: string;
  staffId: string;
  from: string;
  to: string;
  reason?: string;
  createdByName: string;
  createdAt: string;
}

export interface TimeOffBody { staffId: string; from: string; to: string; reason?: string; confirmOverlaps?: boolean }

export const SERIES_STATUSES = ['ACTIVE', 'ENDED'] as const;
export type SeriesStatus = typeof SERIES_STATUSES[number];

export interface SeriesRule { freq: 'WEEKLY'; interval: number; weekdays: number[]; time: string; timezone?: string }

/** SeriesView. */
export interface SeriesRow {
  id: string;
  code: string;
  partyId: string;
  customerName: string;
  serviceId: string;
  serviceName: string;
  staffId?: string;
  mode: ServiceMode;
  rule: SeriesRule;
  ruleText: string;
  startDate: string;
  endDate?: string;
  count?: number;
  generatedUntil: string;
  generatedCount: number;
  status: SeriesStatus;
  skipped: SkippedDate[];
  endedAt?: string;
  endedReason?: string;
  createdAt: string;
  /** List rows only (M22): the next open visit. */
  nextVisitAt?: string;
}

export interface SkippedDate { date: string; reason: string }

export interface SeriesVisit { id: string; code: string; slotStart: string; slotEnd: string; status: BookingStatus; staffId?: string }

export interface SeriesDetail { series: SeriesRow; visits: SeriesVisit[] }

/** `seriesCreateSchema` — exactly one of `endDate` / `count`. */
export interface SeriesBody {
  partyId: string;
  serviceId: string;
  staffId?: string;
  mode: ServiceMode;
  address?: BookingAddress;
  rule: { freq: 'WEEKLY'; interval: number; weekdays: number[]; time: string };
  startDate: string;
  endDate?: string;
  count?: number;
}

export interface SeriesCreated { series: SeriesRow; created: string[]; skipped: SkippedDate[] }

export interface SeriesEndBody { fromDate: string; cancelFuture: boolean; reason?: string }

/** PackageView. */
export interface PackageRow {
  id: string;
  name: string;
  serviceIds: string[];
  sessions: number;
  pricePaise: number;
  validityDays: number;
  taxRatePercent: number;
  sac?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PackageBody {
  name: string;
  serviceIds: string[];
  sessions: number;
  pricePaise: number;
  validityDays: number;
  taxRatePercent: number;
  sac?: string;
  isActive: boolean;
}

export const PURCHASE_STATUSES = ['ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED'] as const;
export type PurchaseStatus = typeof PURCHASE_STATUSES[number];

/** PurchaseView. */
export interface PurchaseRow {
  id: string;
  packageId: string;
  name: string;
  serviceIds: string[];
  partyId: string;
  customerName?: string;
  documentId: string;
  sessionsTotal: number;
  sessionsUsed: number;
  sessionsReserved: number;
  remaining: number;
  purchasedAt: string;
  expiresAt: string;
  status: PurchaseStatus;
}

/** The invoice a sale made — only the fields this app reads. */
export interface SoldDocument { _id: string; number?: string; status?: string }

export interface SellResult { purchase: PurchaseRow; document: SoldDocument }
