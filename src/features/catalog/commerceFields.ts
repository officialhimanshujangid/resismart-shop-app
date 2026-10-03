// >>> MP1-COMPLETE — P1: the product's online-shop page fields (C1) on catalog create / [id].
/**
 * PURE rules for the five product commerce fields the server takes on create and
 * update — `productCommerceFieldsSchema` in `backend/src/validators/commerce.validator.ts`:
 *
 *   qtyStep / minQty / maxQty   number > 0, at most 3 decimals, ≤ 100000, nullable
 *   description                 trimmed string ≤ 2000, nullable ('' clears)
 *   highlights                  ≤ 6 trimmed lines of 1–120 letters, nullable ([] clears)
 *
 * plus `commerceProductProblem` (services/commerce/quantity-rules.ts): a counted
 * unit (PCS BOX PKT DOZ) steps in whole numbers, min / max are multiples of the
 * step, min ≤ max. The server checks all of it again and answers
 * COMMERCE_FIELD_INVALID {field}; these checks only say it sooner, on the field.
 *
 * WHEN THE EDITOR SHOWS (the same rule the web ProductDialog follows): the shop
 * sells online (ORDERS module) or has any commerce feature switched on — or the
 * product already carries one of these fields, so a stored value is never hidden.
 */
import type { CommerceAccess } from '../commerce/access';
import type { Product, ProductFormInput } from './types';

export const SHOP_FIELD_KEYS = ['description', 'highlights', 'qtyStep', 'minQty', 'maxQty'] as const;
export type ShopFieldKey = typeof SHOP_FIELD_KEYS[number];

export const DESCRIPTION_MAX = 2000;
export const HIGHLIGHTS_MAX = 6;
export const HIGHLIGHT_MAX = 120;
export const QTY_MAX = 100000;

/** What the form holds — every field as typed (highlights: one per line). */
export interface ShopFieldsForm {
  description: string;
  highlights: string;
  qtyStep: string;
  minQty: string;
  maxQty: string;
}

export const EMPTY_SHOP_FIELDS: ShopFieldsForm = { description: '', highlights: '', qtyStep: '', minQty: '', maxQty: '' };

const COUNTED = ['PCS', 'BOX', 'PKT', 'DOZ'];

const numText = (n?: number | null): string => (typeof n === 'number' && n > 0 ? String(n) : '');

/** The form, filled from a stored product (or empty). */
export function shopFieldsFormOf(p?: Partial<Product> | null): ShopFieldsForm {
  if (!p) return { ...EMPTY_SHOP_FIELDS };
  return {
    description: p.description ?? '',
    highlights: (p.highlights ?? []).join('\n'),
    qtyStep: numText(p.qtyStep),
    minQty: numText(p.minQty),
    maxQty: numText(p.maxQty),
  };
}

/** Does this product already carry any of the five fields? */
export function hasShopFields(p?: Partial<Product> | null): boolean {
  if (!p) return false;
  return !!(p.description?.trim() || p.highlights?.length || p.qtyStep || p.minQty || p.maxQty);
}

/** Show the editor? See the header. */
export function shopFieldsOn(
  access: Pick<CommerceAccess, 'anyOn' | 'settings'>,
  product?: Partial<Product> | null,
): boolean {
  return access.settings.visible.online || access.anyOn || hasShopFields(product);
}

/** Thousandths, or NaN when there are more than three decimals. Mirrors the server's `toMilli`. */
function toMilli(q: number): number {
  if (!Number.isFinite(q)) return NaN;
  const scaled = q * 1000;
  const rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) < 1e-6 ? rounded : NaN;
}

/** "0,5" and " 0.5 " both read 0.5; '' reads undefined; anything else NaN. */
export function parseQty(s: string): number | undefined {
  const v = s.trim().replace(',', '.');
  if (!v) return undefined;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(v)) return NaN;
  return Number(v);
}

/** The key points as sent: trimmed, blank lines dropped. */
export function highlightLines(s: string): string[] {
  return s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/** One problem per field: an i18n key and its params. */
export type ShopFieldProblems = Partial<Record<ShopFieldKey, { key: string; params?: Record<string, string | number> }>>;

export function shopFieldsProblems(form: ShopFieldsForm, unit: string): ShopFieldProblems {
  const out: ShopFieldProblems = {};
  const E = 'catalog.shopPage.err.';

  if (form.description.trim().length > DESCRIPTION_MAX) out.description = { key: `${E}descriptionTooLong`, params: { max: DESCRIPTION_MAX } };
  const lines = highlightLines(form.highlights);
  if (lines.length > HIGHLIGHTS_MAX) out.highlights = { key: `${E}tooManyPoints`, params: { max: HIGHLIGHTS_MAX } };
  else if (lines.some((l) => l.length > HIGHLIGHT_MAX)) out.highlights = { key: `${E}pointTooLong`, params: { max: HIGHLIGHT_MAX } };

  const nums: Partial<Record<'qtyStep' | 'minQty' | 'maxQty', number>> = {};
  for (const k of ['qtyStep', 'minQty', 'maxQty'] as const) {
    const n = parseQty(form[k]);
    if (n === undefined) continue;
    if (Number.isNaN(n) || n <= 0 || Number.isNaN(toMilli(n))) { out[k] = { key: `${E}qtyInvalid` }; continue; }
    if (n > QTY_MAX) { out[k] = { key: `${E}qtyTooBig` }; continue; }
    nums[k] = n;
  }
  const step = nums.qtyStep;
  if (step !== undefined && COUNTED.includes(unit) && !Number.isInteger(step)) out.qtyStep = { key: `${E}stepWhole` };
  if (step !== undefined && !out.qtyStep) {
    for (const k of ['minQty', 'maxQty'] as const) {
      const v = nums[k];
      if (v !== undefined && toMilli(v) % toMilli(step) !== 0) out[k] = { key: `${E}notMultiple`, params: { step: String(step) } };
    }
  }
  // The server names the MINIMUM for this one (`problemField`), so the app does too.
  if (nums.minQty !== undefined && nums.maxQty !== undefined && nums.minQty > nums.maxQty && !out.minQty) {
    out.minQty = { key: `${E}minAboveMax` };
  }
  return out;
}

type ShopFieldsBody = Pick<ProductFormInput, ShopFieldKey>;

/**
 * The body keys to send.
 *  - create (`current` absent): only what was filled in — an empty box sends nothing.
 *  - update: only what CHANGED from the stored product; a box emptied → `null` (clears).
 * Call only after `shopFieldsProblems` came back empty.
 */
export function shopFieldsBody(form: ShopFieldsForm, current?: Partial<Product> | null): ShopFieldsBody {
  const description = form.description.trim() || undefined;
  const lines = highlightLines(form.highlights);
  const highlights = lines.length ? lines : undefined;
  const qty = (s: string): number | undefined => {
    const n = parseQty(s);
    return n === undefined || Number.isNaN(n) ? undefined : n;
  };
  const next: Record<ShopFieldKey, unknown> = {
    description, highlights, qtyStep: qty(form.qtyStep), minQty: qty(form.minQty), maxQty: qty(form.maxQty),
  };
  const out: Record<string, unknown> = {};
  if (!current) {
    for (const k of SHOP_FIELD_KEYS) if (next[k] !== undefined) out[k] = next[k];
    return out as ShopFieldsBody;
  }
  const was: Record<ShopFieldKey, unknown> = {
    description: current.description?.trim() || undefined,
    highlights: current.highlights?.length ? current.highlights : undefined,
    qtyStep: current.qtyStep || undefined,
    minQty: current.minQty || undefined,
    maxQty: current.maxQty || undefined,
  };
  const same = (a: unknown, b: unknown) =>
    (Array.isArray(a) || Array.isArray(b)) ? JSON.stringify(a ?? null) === JSON.stringify(b ?? null) : a === b;
  for (const k of SHOP_FIELD_KEYS) {
    if (same(next[k], was[k])) continue;
    out[k] = next[k] === undefined ? null : next[k];
  }
  return out as ShopFieldsBody;
}

/** COMMERCE_FIELD_INVALID's `{field}`, when it is one of the five (the screen marks that box). */
export function shopFieldOfError(code: string | undefined, params: Record<string, unknown> | undefined): ShopFieldKey | null {
  if (code !== 'COMMERCE_FIELD_INVALID') return null;
  const f = String(params?.field ?? '');
  return (SHOP_FIELD_KEYS as readonly string[]).includes(f) ? (f as ShopFieldKey) : null;
}
// <<< MP1-COMPLETE
