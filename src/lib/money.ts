/**
 * Money is an integer number of PAISE everywhere it is stored, sent or summed.
 * It becomes a string with a decimal point exactly once, at render.
 *
 * The rule exists because rupees-as-float is not a stylistic choice: `0.1 + 0.2`
 * is `0.30000000000000004` in every JS engine, and a bill of forty items adds up
 * to a total the customer can see is a paisa out. Sum paise, divide once.
 */

/** A branded alias, so a signature can say what unit it wants. */
export type Paise = number;

/**
 * `12345` → `"₹123.45"`.
 *
 * `Intl.NumberFormat` with 'en-IN' gives the Indian digit grouping a shop owner
 * expects (`₹12,34,567.00`, not `₹1,234,567.00`) and is available in Hermes on
 * both platforms in SDK 54. Non-finite input renders as a dash rather than
 * "NaN" — a field that has not loaded yet must not look like a broken total.
 *
 * ── 'en-IN' STAYS, even in Hindi, and this is a decision rather than an
 * oversight ────────────────────────────────────────────────────────────────
 *
 * Dates in this app go through the catalogue instead of `Intl` (see
 * `formatI18nDate` in `src/i18n/index.ts`) because a date contains a WORD — the
 * month — and Android's ICU coverage under Hermes is not reliable enough to
 * trust with it silently.
 *
 * A rupee amount contains no words. `hi-IN` and `en-IN` produce the identical
 * string here: the same ₹, the same 2-2-3 grouping, and the same Latin digits
 * (CLDR's default numbering system for `hi` is `latn`, not `deva`). So passing
 * the reader's locale would buy nothing — and it would risk the exact failure
 * the date note describes, a device whose ICU lacks `hi-IN` falling back to a
 * root locale that groups `₹1,234,567.00`. A shopkeeper misreading a total by a
 * factor of ten on an invoice is not a cosmetic bug. One fixed locale is the
 * safer answer for a value that is already language-neutral.
 */
export function formatPaise(paise: Paise | null | undefined, options?: { showDecimals?: boolean }): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return '—';
  const decimals = options?.showDecimals === false ? 0 : 2;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(paise / 100);
}

/**
 * What a partner typed → paise.
 *
 * `Math.round`, not `Math.trunc`: `parseFloat('1.15') * 100` is `114.99999...`,
 * so truncating turns ₹1.15 into 114 paise and every such line is a paisa light.
 * Returns `null` for anything unparseable so the caller can show a field error
 * instead of silently billing zero.
 */
export function parseRupeesToPaise(input: string): Paise | null {
  const cleaned = input.replace(/[₹,\s]/g, '').trim();
  if (!cleaned) return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const rupees = Number(cleaned);
  if (!Number.isFinite(rupees)) return null;
  return Math.round(rupees * 100);
}

/** `12345` → `"123.45"`, for prefilling an editable amount field. */
export function paiseToInput(paise: Paise | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return '';
  return (paise / 100).toFixed(2);
}
