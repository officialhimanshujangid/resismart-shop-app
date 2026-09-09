import { BookingStatus } from './booking.types';
import { durationLabel, Translate } from '../services/duration';

export type { Translate };

/**
 * Display-only helpers for booking dates, times and statuses.
 *
 * Nothing here parses a date from a `YYYY-MM-DD` string for a REQUEST — that
 * trap is documented in `booking.service.ts`'s `dayStart`/`dayEnd` and belongs
 * server-side. These functions only ever format an already-correct `Date` or
 * ISO instant for a screen, never reconstruct one from a calendar string.
 */

/** `YYYY-MM-DD` for the device's own "today" — what the Today screen's `from`/`to` send. */
export function todayCivilDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `civilDate(new Date())` — the same day, from an already-parsed instant. */
export function civilDateOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * A CLOCK TIME, in the reader's language.
 *
 * `t` is handed in — these are plain functions, not components, and every caller
 * already holds one. The meridiem comes from `common.am`/`common.pm` and the
 * weekday and month from `common.days`/`common.months`, NOT from
 * `toLocaleTimeString`/`toLocaleDateString`: those are the two `Intl` calls
 * `src/i18n/index.ts#formatI18nDate` rules out at length, because this app runs
 * on Hermes and Android's ICU coverage cannot be relied on — and the failure is
 * silent, a Hindi screen quietly rendering English weekdays with nothing to
 * reveal it. The digits stay Latin, which is what an Indian reader expects on a
 * job card.
 */
export function formatTime(iso: string, t: Translate): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const meridiem = t(h >= 12 ? 'common.pm' : 'common.am');
  h = h % 12; if (h === 0) h = 12;
  return t('components.date.time', { hour: h, minute: m, meridiem });
}

export function formatDayLabel(iso: string, t: Translate): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (civilDateOf(d) === civilDateOf(today)) return t('bookings.format.today');
  if (civilDateOf(d) === civilDateOf(tomorrow)) return t('bookings.format.tomorrow');
  return t('bookings.format.dayLabel', {
    weekday: t(`common.days.${d.getDay()}`),
    day: d.getDate(),
    month: t(`common.months.${d.getMonth() + 1}`),
  });
}

export function formatDateTime(iso: string, t: Translate): string {
  return t('bookings.format.dateTime', { day: formatDayLabel(iso, t), time: formatTime(iso, t) });
}

/**
 * A count of minutes, said the way a shop says it: "20 min", "1 hr 35 min".
 *
 * Rounded to whole minutes, because every duration in this vertical already is
 * — `actual.durationMin`, `runningOverMin` and `canExtendByMin` are all whole
 * numbers on the server, and showing "19.6 min over" for a clock a partner is
 * reading between customers is precision nobody asked for.
 *
 * The wording itself now lives in `features/services/duration.ts`, which this
 * re-exports: it was TWO copies of `hr${h === 1 ? '' : 's'}` (here and
 * `ServiceCard`/`ServiceForm`), and Hindi has no suffix that turns "1 घंटा" into
 * "2 घंटे". See that file's header.
 */
export function formatMinutes(total: number, t: Translate): string {
  return durationLabel(total, t);
}

/** Whole minutes from one ISO instant to another. Negative when `to` is earlier. */
export function minutesBetween(fromIso: string, to: string | number): number {
  const a = new Date(fromIso).getTime();
  const b = typeof to === 'number' ? to : new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 60_000);
}

/**
 * The word a partner reads for each status — a catalogue key per status. Same
 * vocabulary as `VERB_LABEL_KEYS`.
 *
 * `BookingStatus` stays the wire value: it is what the server sends, what
 * `STATUS_TONE` and `LIVE_STATUSES` below are keyed by, and what a filter posts
 * back.
 */
export const STATUS_LABEL_KEYS: Record<BookingStatus, string> = {
  REQUESTED: 'bookings.status.REQUESTED',
  ACCEPTED: 'bookings.status.ACCEPTED',
  SCHEDULED: 'bookings.status.SCHEDULED',
  RESCHEDULED: 'bookings.status.RESCHEDULED',
  IN_PROGRESS: 'bookings.status.IN_PROGRESS',
  COMPLETED: 'bookings.status.COMPLETED',
  INVOICED: 'bookings.status.INVOICED',
  PAID: 'bookings.status.PAID',
  REJECTED: 'bookings.status.REJECTED',
  CANCELLED: 'bookings.status.CANCELLED',
  NO_SHOW: 'bookings.status.NO_SHOW',
};

/** Semantic bucket, so a status chip's colour comes from one place. */
export type StatusTone = 'attention' | 'active' | 'success' | 'neutral' | 'danger';

export const STATUS_TONE: Record<BookingStatus, StatusTone> = {
  REQUESTED: 'attention',
  ACCEPTED: 'active',
  SCHEDULED: 'active',
  RESCHEDULED: 'active',
  IN_PROGRESS: 'active',
  COMPLETED: 'success',
  INVOICED: 'success',
  PAID: 'success',
  REJECTED: 'neutral',
  CANCELLED: 'neutral',
  NO_SHOW: 'danger',
};

/** The statuses that still occupy a slot on today's diary — see `SLOT_OCCUPYING_STATUSES`. */
export const LIVE_STATUSES: BookingStatus[] = [
  'REQUESTED', 'ACCEPTED', 'SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS',
];
