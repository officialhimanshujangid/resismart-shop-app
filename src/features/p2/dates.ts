/**
 * Days, months and times the way P2 sends them (CONTRACT-partner-P2 header):
 * a "day" is an IST calendar day `YYYY-MM-DD`, a "period" is `YYYY-MM`, an
 * instant is ISO with an offset. Pure — no Intl, no device time zone: a phone
 * set to another zone must still mark TODAY's Indian delivery round.
 */

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** The IST calendar day of an instant. */
export function istDayOf(at: Date | string | number = new Date()): string {
  const d = at instanceof Date ? at : new Date(at);
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** Today in India. */
export const istToday = (now: Date = new Date()) => istDayOf(now);

/** `HH:mm` of an instant in IST. */
export function istTimeOf(at: Date | string | number): string {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + IST_MS).toISOString().slice(11, 16);
}

/** Minutes after IST midnight of an instant. */
export function istMinutesOf(at: Date | string | number): number {
  const [h, m] = istTimeOf(at).split(':').map(Number);
  return h * 60 + m;
}

const dayUtc = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));

export function addDays(day: string, n: number): string {
  return new Date(dayUtc(day) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dayUtc(to) - dayUtc(from)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (day: string) => new Date(dayUtc(day)).getUTCDay();

export const periodOf = (day: string) => day.slice(0, 7);

export function addMonths(period: string, n: number): string {
  const y = +period.slice(0, 4);
  const m = +period.slice(5, 7) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Every day of a month, `YYYY-MM-DD`. */
export function monthDays(period: string): string[] {
  const first = `${period}-01`;
  const out: string[] = [];
  for (let d = first; periodOf(d) === period; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The instant `HH:mm` on `day` in IST, as ISO with `+05:30` (what `p2Instant` wants). */
export function istInstant(day: string, hhmm: string): string {
  return `${day}T${hhmm}:00+05:30`;
}

type T = (key: string, opts?: Record<string, unknown>) => string;

/** "Today" / "Yesterday" / "Tomorrow", else "Tue 3 Oct" in the reader's language. */
export function dayLabel(day: string, t: T, today: string = istToday()): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return t('p2.common.today');
  if (diff === -1) return t('p2.common.yesterday');
  if (diff === 1) return t('p2.common.tomorrow');
  return shortDay(day, t);
}

/** "Tue 3 Oct". */
export function shortDay(day: string, t: T): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  return `${t(`common.days.${weekdayOf(day)}`)} ${+day.slice(8, 10)} ${t(`common.months.${+day.slice(5, 7)}`)}`;
}

/** "Oct 2026" / "अक्टूबर 2026". */
export function monthLabel(period: string, t: T): string {
  return `${t(`common.months.${+period.slice(5, 7)}`)} ${period.slice(0, 4)}`;
}

/** "3 Oct 2026, 10:30" — an instant in IST, for lists. */
export function dayTimeLabel(at: string | Date, t: T): string {
  const day = istDayOf(at);
  return `${shortDay(day, t)}, ${istTimeOf(at)}`;
}
