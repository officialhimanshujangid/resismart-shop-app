/**
 * Pure rules for the APPOINTMENTS screens (unit-tested in
 * `src/__tests__/partner-p2-appointments-logic.test.ts`). No React, no network,
 * no device time zone: every day is an IST `YYYY-MM-DD`, every time `HH:mm`.
 *
 * THE GRID. There is no partner slots endpoint: `createPartnerBooking` refuses
 * a start that is not ON the business's grid (409 BOOKING_SLOT_NOT_OFFERED).
 * The grid is the weekly schedule (`GET /partners/me/availability/one`):
 * window start + k × slotMin while start + duration ≤ window end, a start whose
 * visit runs into a break skipped, nothing on a closed weekday, a blackout
 * date or a switched-off schedule — the same loop as the backend's
 * `booking-slots.service.ts` (candidate starts).
 */
import type { AvailabilityRow } from '../availability/types';
import type { BookingStatus } from '../bookings/booking.types';
import { istDayOf, istInstant, istMinutesOf, istTimeOf, weekdayOf } from '../p2/dates';
import type {
  BookingAddress, CalendarBooking, CalendarStaff, CalendarTimeOff, CalendarView, PackageBody, SeriesBody, TimeOffRow,
  WalkInBody,
} from './types';
import type { ServiceMode } from '../services/types';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const hhmmToMin = (s: string): number => {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + m;
};
export const minToHHmm = (n: number): string =>
  `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

type Schedule = Pick<AvailabilityRow, 'weekly' | 'breaks' | 'blackoutDates'> & { isActive?: boolean };

/** The weekday's step (`slotMin`), or `null` when the business does not open that day. */
export function slotMinOf(av: Schedule | null | undefined, day: string): number | null {
  if (!av || av.isActive === false || !DAY.test(day)) return null;
  if ((av.blackoutDates || []).some((d) => String(d).slice(0, 10) === day)) return null;
  const wd = weekdayOf(day);
  const d = (av.weekly || []).find((w) => w.day === wd);
  if (!d || d.isOpen === false || !d.windows?.length) return null;
  return d.slotMin > 0 ? d.slotMin : 30;
}

/**
 * The slot start times of `day`, sorted. `durationMin` is the service's length
 * (a 90-minute visit cannot start 30 minutes before closing); without it each
 * slot is one step long.
 */
export function gridSlots(av: Schedule | null | undefined, day: string, durationMin?: number): string[] {
  const step = slotMinOf(av, day);
  if (!step || !av) return [];
  const wd = weekdayOf(day);
  const d = av.weekly.find((w) => w.day === wd)!;
  const dur = durationMin && durationMin > 0 ? durationMin : step;
  const breaks = (av.breaks || []).filter((b) => b.day === wd && HHMM.test(b.from) && HHMM.test(b.to))
    .map((b) => ({ from: hhmmToMin(b.from), to: hhmmToMin(b.to) }));
  const out = new Set<string>();
  for (const w of d.windows) {
    if (!HHMM.test(w.from) || !HHMM.test(w.to)) continue;
    const open = hhmmToMin(w.from);
    const close = hhmmToMin(w.to);
    for (let s = open; s + dur <= close; s += step) {
      const e = s + dur;
      if (breaks.some((b) => s < b.to && e > b.from)) continue;
      out.add(minToHHmm(s));
    }
  }
  return [...out].sort();
}

/** The slot running at `now` (start ≤ now < start + slotMin), or `null` — the "Now" chip. */
export function currentSlot(av: Schedule | null | undefined, now: Date, durationMin?: number): string | null {
  const day = istDayOf(now);
  const step = slotMinOf(av, day);
  if (!step) return null;
  const at = istMinutesOf(now);
  const hit = gridSlots(av, day, durationMin).find((s) => {
    const m = hhmmToMin(s);
    return m <= at && at < m + step;
  });
  return hit ?? null;
}

/**
 * The chips to offer for `day`: every grid slot on a later day; today only the
 * running one and those still to come (a walk-in may take the slot running
 * NOW — Owner decision); nothing on a past day.
 */
export function pickableSlots(av: Schedule | null | undefined, day: string, now: Date, durationMin?: number): string[] {
  const today = istDayOf(now);
  if (day < today) return [];
  const all = gridSlots(av, day, durationMin);
  if (day > today) return all;
  const step = slotMinOf(av, day) ?? 0;
  const at = istMinutesOf(now);
  return all.filter((s) => hhmmToMin(s) + step > at);
}

// ───────────────────────────────────────────────────────── the calendar

export type StaffFilter = 'ALL' | 'NONE' | string;

export interface StaffSection {
  key: string;
  staffId: string | null;
  name: string;
  bookings: CalendarBooking[];
  timeOff: CalendarTimeOff[];
  /** Nothing booked, no time off — drawn as one "Free all day" line. */
  free: boolean;
}

/**
 * One section per person for `day`, in the calendar's staff order, bookings by
 * start time. The "Not assigned" section is drawn only when it holds a
 * booking or is the filter itself (an empty one is a gap, not information).
 */
export function staffSections(
  view: CalendarView | null | undefined, day: string, filter: StaffFilter, notAssignedLabel: string,
): StaffSection[] {
  if (!view) return [];
  const d = (view.days || []).find((x) => x.day === day);
  const byKey = new Map((d?.byStaff || []).map((s) => [s.staffId ?? '', s]));
  const make = (staffId: string | null, name: string): StaffSection => {
    const row = byKey.get(staffId ?? '');
    const bookings = [...(row?.bookings || [])].sort((a, b) => String(a.slotStart).localeCompare(String(b.slotStart)));
    const timeOff = [...(row?.timeOff || [])].sort((a, b) => String(a.from).localeCompare(String(b.from)));
    return { key: staffId ?? 'none', staffId, name, bookings, timeOff, free: !bookings.length && !timeOff.length };
  };
  const out: StaffSection[] = [];
  const none = make(null, notAssignedLabel);
  if (filter === 'NONE') return [none];
  if (filter === 'ALL' && none.bookings.length) out.push(none);
  for (const s of view.staff || []) {
    if (filter !== 'ALL' && filter !== s.id) continue;
    out.push(make(s.id, s.name));
  }
  return out;
}

/** The part of a time-off block that falls on `day`, as `HH:mm` (a block running past midnight ends at 24:00). */
export function blockRangeOn(block: { from: string; to: string }, day: string): { from: string; to: string } {
  const from = istDayOf(block.from) < day ? '00:00' : istTimeOf(block.from);
  const to = istDayOf(block.to) > day ? '24:00' : istTimeOf(block.to);
  return { from, to };
}

export function statusTone(status: BookingStatus | string): 'neutral' | 'good' | 'warn' | 'bad' | 'info' {
  switch (status) {
    case 'REQUESTED': return 'warn';
    case 'ACCEPTED': case 'SCHEDULED': case 'RESCHEDULED': case 'IN_PROGRESS': return 'info';
    case 'COMPLETED': case 'INVOICED': case 'PAID': return 'good';
    case 'NO_SHOW': return 'bad';
    default: return 'neutral';
  }
}

/**
 * The customer's packages worth offering for `serviceId`: those that cover it.
 * A package without `serviceIds` (an older backend) is always offered — the
 * server still refuses a mismatch (PACKAGE_SERVICE_MISMATCH).
 */
export function packagesForService<P extends { serviceIds?: string[] }>(packages: P[] | undefined, serviceId?: string): P[] {
  return (packages || []).filter((p) => !Array.isArray(p.serviceIds) || !serviceId || p.serviceIds.includes(serviceId));
}

/** Staff who may be given a booking. */
export const bookableStaff = (staff: CalendarStaff[] | undefined) => (staff || []).filter((s) => s.canTakeBookings);

// ─────────────────────────────────────────────────────────── bodies

export interface WalkInForm {
  partyId?: string;
  serviceId?: string;
  mode?: ServiceMode;
  day: string;
  time?: string;
  staffId?: string;
  addressLine1?: string;
  partyAddress?: BookingAddress;
  packagePurchaseId?: string;
  note?: string;
  notifyCustomer: boolean;
}

export type WalkInProblem = 'needCustomer' | 'needService' | 'needTime' | 'needAddress';

/** The first thing missing, or the body `POST /bookings` takes (strict: no stray keys). */
export function walkInBody(f: WalkInForm): { problem: WalkInProblem } | { body: WalkInBody } {
  if (!f.partyId) return { problem: 'needCustomer' };
  if (!f.serviceId || !f.mode) return { problem: 'needService' };
  if (!f.time || !HHMM.test(f.time) || !DAY.test(f.day)) return { problem: 'needTime' };
  let address: BookingAddress | undefined;
  if (f.mode === 'AT_CUSTOMER') {
    const typed = (f.addressLine1 ?? '').trim();
    if (typed.length >= 3) address = { line1: typed };
    else if (f.partyAddress?.line1 && f.partyAddress.line1.trim().length >= 3) address = cleanAddress(f.partyAddress);
    else return { problem: 'needAddress' };
  }
  const note = (f.note ?? '').trim();
  return {
    body: {
      partyId: f.partyId,
      serviceId: f.serviceId,
      ...(f.staffId ? { staffId: f.staffId } : {}),
      slotStart: istInstant(f.day, f.time),
      mode: f.mode,
      ...(address ? { address } : {}),
      ...(f.packagePurchaseId ? { packagePurchaseId: f.packagePurchaseId } : {}),
      ...(note ? { note: note.slice(0, 500) } : {}),
      notifyCustomer: f.notifyCustomer,
    },
  };
}

/** Only the keys `addressSchema` (strict) accepts, empty ones dropped, a bad pincode left out. */
export function cleanAddress(a: BookingAddress): BookingAddress {
  const out: BookingAddress = { line1: a.line1.trim().slice(0, 200) };
  if (a.line2?.trim()) out.line2 = a.line2.trim().slice(0, 200);
  if (a.city?.trim()) out.city = a.city.trim().slice(0, 80);
  if (a.state?.trim()) out.state = a.state.trim().slice(0, 80);
  if (a.pincode && /^\d{6}$/.test(a.pincode.trim())) out.pincode = a.pincode.trim();
  return out;
}

export type TimeOffProblem = 'needStaff' | 'badTime' | 'badRange' | 'tooLong';

export function timeOffBody(f: {
  staffId?: string; fromDay: string; fromTime: string; toDay: string; toTime: string; reason?: string;
}): { problem: TimeOffProblem } | { body: { staffId: string; from: string; to: string; reason?: string } } {
  if (!f.staffId) return { problem: 'needStaff' };
  if (!DAY.test(f.fromDay) || !DAY.test(f.toDay) || !HHMM.test(f.fromTime) || !HHMM.test(f.toTime)) return { problem: 'badTime' };
  const from = istInstant(f.fromDay, f.fromTime);
  const to = istInstant(f.toDay, f.toTime);
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!(ms > 0)) return { problem: 'badRange' };
  if (ms > 31 * 86_400_000) return { problem: 'tooLong' };
  const reason = (f.reason ?? '').trim().slice(0, 120);
  return { body: { staffId: f.staffId, from, to, ...(reason ? { reason } : {}) } };
}

/** Upcoming time off grouped by person, people in `staff` order (unknown ids last). */
export function timeOffByStaff(rows: TimeOffRow[], staff: CalendarStaff[]): { staffId: string; name: string; rows: TimeOffRow[] }[] {
  const order = new Map(staff.map((s, i) => [s.id, i]));
  const groups = new Map<string, TimeOffRow[]>();
  for (const r of rows) groups.set(r.staffId, [...(groups.get(r.staffId) || []), r]);
  return [...groups.entries()]
    .sort(([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999))
    .map(([staffId, list]) => ({
      staffId,
      name: staff.find((s) => s.id === staffId)?.name ?? '—',
      rows: list.sort((x, y) => String(x.from).localeCompare(String(y.from))),
    }));
}

type Tr = (key: string, opts?: Record<string, unknown>) => string;

/** "Every week on Mon, Thu at 10:00" in the reader's language (the server's `ruleText` is English only). */
export function ruleLabel(rule: { interval: number; weekdays: number[]; time: string }, t: Tr): string {
  const days = [...rule.weekdays].sort((a, b) => a - b).map((d) => t(`common.days.${d}`)).join(', ');
  return t('p2.appointments.series.rule', { count: rule.interval, days, time: rule.time });
}

export interface SeriesForm {
  partyId?: string;
  serviceId?: string;
  mode?: ServiceMode;
  staffId?: string;
  addressLine1?: string;
  weekdays: number[];
  time?: string;
  interval: number;
  startDate: string;
  endBy: 'DATE' | 'COUNT';
  endDate?: string;
  count?: number;
}

export type SeriesProblem =
  | 'needCustomer' | 'needService' | 'needWeekdays' | 'needTime' | 'needAddress' | 'needEndDate' | 'endBeforeStart' | 'countRange';

export const SERIES_MAX_VISITS = 52;

/** `seriesCreateSchema`: 1–3 unique weekdays, every 1–4 weeks, exactly one of endDate / count (2–52). */
export function seriesBody(f: SeriesForm): { problem: SeriesProblem } | { body: SeriesBody } {
  if (!f.partyId) return { problem: 'needCustomer' };
  if (!f.serviceId || !f.mode) return { problem: 'needService' };
  const weekdays = [...new Set(f.weekdays)].filter((w) => w >= 0 && w <= 6).sort((a, b) => a - b);
  if (!weekdays.length || weekdays.length > 3) return { problem: 'needWeekdays' };
  if (!f.time || !HHMM.test(f.time)) return { problem: 'needTime' };
  let address: BookingAddress | undefined;
  if (f.mode === 'AT_CUSTOMER') {
    const typed = (f.addressLine1 ?? '').trim();
    if (typed.length < 3) return { problem: 'needAddress' };
    address = { line1: typed.slice(0, 200) };
  }
  const interval = Math.min(4, Math.max(1, Math.round(f.interval || 1)));
  const base = {
    partyId: f.partyId,
    serviceId: f.serviceId,
    ...(f.staffId ? { staffId: f.staffId } : {}),
    mode: f.mode,
    ...(address ? { address } : {}),
    rule: { freq: 'WEEKLY' as const, interval, weekdays, time: f.time },
    startDate: f.startDate,
  };
  if (f.endBy === 'DATE') {
    if (!f.endDate || !DAY.test(f.endDate)) return { problem: 'needEndDate' };
    if (f.endDate < f.startDate) return { problem: 'endBeforeStart' };
    return { body: { ...base, endDate: f.endDate } };
  }
  const count = Math.round(Number(f.count));
  if (!Number.isFinite(count) || count < 2 || count > SERIES_MAX_VISITS) return { problem: 'countRange' };
  return { body: { ...base, count } };
}

export interface PackageForm {
  name: string;
  serviceIds: string[];
  sessions: number;
  pricePaise: number | null;
  validityDays: number;
  taxRatePercent: number;
  sac: string;
  isActive: boolean;
}

export type PackageProblem = 'name' | 'services' | 'sessions' | 'price' | 'validity' | 'tax' | 'sac';

/** `packageSchema`: name 2–80, 1–5 services, 2–100 sessions, 7–730 days, 0–40 %, SAC 4–8 digits. */
export function packageBody(f: PackageForm): { problem: PackageProblem } | { body: PackageBody } {
  const name = f.name.trim();
  if (name.length < 2 || name.length > 80) return { problem: 'name' };
  const serviceIds = [...new Set(f.serviceIds)];
  if (serviceIds.length < 1 || serviceIds.length > 5) return { problem: 'services' };
  if (!Number.isInteger(f.sessions) || f.sessions < 2 || f.sessions > 100) return { problem: 'sessions' };
  if (f.pricePaise === null || !Number.isInteger(f.pricePaise) || f.pricePaise < 0 || f.pricePaise > 100_000_000) return { problem: 'price' };
  if (!Number.isInteger(f.validityDays) || f.validityDays < 7 || f.validityDays > 730) return { problem: 'validity' };
  if (!(f.taxRatePercent >= 0 && f.taxRatePercent <= 40)) return { problem: 'tax' };
  const sac = f.sac.trim();
  if (sac && !/^\d{4,8}$/.test(sac)) return { problem: 'sac' };
  return {
    body: {
      name, serviceIds, sessions: f.sessions, pricePaise: f.pricePaise, validityDays: f.validityDays,
      taxRatePercent: f.taxRatePercent, ...(sac ? { sac } : {}), isActive: f.isActive,
    },
  };
}
