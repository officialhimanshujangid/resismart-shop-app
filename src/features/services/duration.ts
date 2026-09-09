/**
 * A count of minutes, said the way a shop says it: "20 min", "1 hr 35 min".
 *
 * ── Why this is a catalogue lookup and not `hr${h === 1 ? '' : 's'}` ───────
 *
 * That is the shape this file replaces, and it was in two places at once —
 * here and `features/bookings/format.ts#formatMinutes` — which is the other
 * half of the reason it now lives in one. An English `-s` suffix is not a
 * pluralisation rule Hindi has: "1 घंटा" and "2 घंटे" differ in the WORD, not
 * in a letter that can be appended to it, so no amount of conditional
 * suffixing produces the second from the first.
 *
 * So the count drives i18next's own plural resolution (`_one` / `_other`) and
 * each language writes both forms out. CLDR puts BOTH 0 and 1 in Hindi's `one`
 * category where English puts only 1 — `scripts/i18n-check.mjs` documents that
 * exemption in full, and it is why the Hindi `_one` form is allowed to
 * interpolate `{{count}}` when the English one need not.
 *
 * `t` is handed in rather than read from a hook: this is a plain function used
 * by several components, and every caller already holds one.
 */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function durationLabel(totalMin: number, t: Translate): string {
  const mins = Math.max(0, Math.round(totalMin));
  if (mins < 60) return t('common.duration.min', { count: mins });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m
    ? t('common.duration.hoursMinutes', { count: h, minutes: m })
    : t('common.duration.hours', { count: h });
}
