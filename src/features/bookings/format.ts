import { BookingStatus } from './booking.types';

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

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (civilDateOf(d) === civilDateOf(today)) return 'Today';
  if (civilDateOf(d) === civilDateOf(tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDateTime(iso: string): string {
  return `${formatDayLabel(iso)}, ${formatTime(iso)}`;
}

/**
 * A count of minutes, said the way a shop says it: "20 min", "1 hr 35 min".
 *
 * Rounded to whole minutes, because every duration in this vertical already is
 * — `actual.durationMin`, `runningOverMin` and `canExtendByMin` are all whole
 * numbers on the server, and showing "19.6 min over" for a clock a partner is
 * reading between customers is precision nobody asked for.
 */
export function formatMinutes(total: number): string {
  const mins = Math.max(0, Math.round(total));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} hr${h === 1 ? '' : 's'}${m ? ` ${m} min` : ''}`;
}

/** Whole minutes from one ISO instant to another. Negative when `to` is earlier. */
export function minutesBetween(fromIso: string, to: string | number): number {
  const a = new Date(fromIso).getTime();
  const b = typeof to === 'number' ? to : new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 60_000);
}

/** The word a partner reads for each status. Same vocabulary as `VERB_LABELS`. */
export const STATUS_LABELS: Record<BookingStatus, string> = {
  REQUESTED: 'New request',
  ACCEPTED: 'Accepted',
  SCHEDULED: 'Scheduled',
  RESCHEDULED: 'Rescheduled',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
  REJECTED: 'Turned down',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
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
