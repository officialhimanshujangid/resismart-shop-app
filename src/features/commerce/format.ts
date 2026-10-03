import { formatI18nDate } from '../../i18n';

/**
 * Commerce display helpers that need the catalogue (`formatI18nDate` reads
 * month names from it). Kept out of `logic.ts`, which stays free of i18n.
 */

type T = (key: string) => string;
const pad = (n: number) => String(n).padStart(2, '0');

/** "12 Oct 2026, 18:30" in the reader's language. Empty for no date. */
export function whenText(iso: string | Date | undefined, t: T): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatI18nDate(d, t)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A delivery slot (`{date, from, to}`) → "Today 18:00–19:00", "Tomorrow …" or "12 Oct 2026 …". */
export function slotText(slot: { date: string; from: string; to: string }, t: T, now = new Date()): string {
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const tm = new Date(now.getTime() + 86_400_000);
  const tomorrow = `${tm.getFullYear()}-${pad(tm.getMonth() + 1)}-${pad(tm.getDate())}`;
  const day = slot.date === today ? t('commerce.common.today')
    : slot.date === tomorrow ? t('commerce.common.tomorrow')
      : formatI18nDate(`${slot.date}T12:00:00`, t);
  return `${day} ${slot.from}–${slot.to}`;
}

/** 0–23 → "6 pm" / "6 am" with the catalogue's am/pm words. */
export function hourText(hour: number, t: T): string {
  const h = ((hour % 24) + 24) % 24;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${t(h >= 12 ? 'common.pm' : 'common.am')}`;
}
