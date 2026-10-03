/**
 * WHICH SENTENCE A REFUSAL IS SHOWN IN — the pure half of `apiErrorMessage`.
 *
 * The backend sends every partner and marketplace refusal with a `code` (and,
 * where the sentence names a number, `params`). The words for those codes live
 * in this app's own catalogue under `errors.<CODE>`, seeded from
 * `backend/src/constants/partner-error-codes.ts` and
 * `marketplace-error-codes.ts`, so a Hindi reader gets Hindi. The order:
 *
 *   1. a code we have words for, with every `{{slot}}` filled → OUR sentence,
 *      in the current language;
 *   2. a 4xx with no code we know → the SERVER's sentence (it is written for a
 *      shop owner and names the thing to fix);
 *   3. a 5xx → the generic "something went wrong" — a server's crash text is
 *      not something to show a partner;
 *   4. no response → timeout / no-connection, as before.
 *
 * Why "every slot filled": i18next leaves an unfilled `{{slot}}` in the text,
 * so a code whose params did not arrive would print braces at the partner. The
 * server's English is whole and specific, so it is the better fallback there.
 *
 * No React, no axios, no i18next import — the translator is passed in, which
 * keeps this checkable with `tsc` alone.
 */

export interface ApiErrorFacts {
  /** HTTP status, when there was a response. */
  status?: number;
  code?: string;
  params?: Record<string, unknown>;
  /** `error ?? message` from the body. */
  serverText?: string;
  /** False when nothing came back at all (network down, timeout). */
  hasResponse: boolean;
  timedOut: boolean;
}

export interface Translator {
  t: (key: string, options?: Record<string, unknown>) => string;
  exists: (key: string) => boolean;
}

const SLOT = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** The `{{slot}}` names a catalogue sentence needs. */
export function slotsOf(template: string): string[] {
  return [...template.matchAll(SLOT)].map((m) => m[1]);
}

/**
 * Params as strings, with the few WORD params the backend sends in English
 * (`source: 'booking' | 'order'`) put into the reader's language.
 */
export function localiseParams(params: Record<string, unknown> | undefined, tr: Translator): Record<string, string> {
  const out: Record<string, string> = {};
  if (!params) return out;
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || typeof v === 'object') continue;
    const s = String(v);
    const wordKey = `common.apiError.param.${k}.${s}`;
    out[k] = tr.exists(wordKey) ? tr.t(wordKey) : s;
  }
  return out;
}

/**
 * MP-1 wording parity — the number a commerce refusal carries, said as a short
 * SECOND sentence after the coded one, exactly like the web
 * (`frontend/src/lib/commerce-error-codes.ts` COMMERCE_EXTRA →
 * `marketplaceErrors.extra.<key>`). Same codes, same param names (checked
 * against `backend/src/services/commerce/*`), same words
 * (`common.apiError.extra.<key>`, `{{value}}`). Money params arrive as rupee
 * strings already ("1,250.00"); counts as digit strings.
 *
 * DELIVERY_OTP_WRONG is in the web list too; the hand-over sheet still says
 * its own "N tries left" line, so the sentence here only shows where the
 * generic message is used.
 */
export const COMMERCE_EXTRA: Readonly<Record<string, { key: string; param: string }>> = {
  ORDER_BELOW_MINIMUM: { key: 'shortBy', param: 'shortBy' },
  OFFER_BELOW_MINIMUM: { key: 'minimum', param: 'minimum' },
  WALLET_CREDIT_SHORT: { key: 'creditBalance', param: 'balance' },
  POINTS_SHORT: { key: 'pointsBalance', param: 'points' },
  POINTS_BELOW_MINIMUM: { key: 'pointsMin', param: 'min' },
  POINTS_ABOVE_LIMIT: { key: 'pointsMax', param: 'max' },
  OFFER_DISCOUNT_ABOVE_ROLE_CAP: { key: 'percentCap', param: 'max' },
  HOLD_LIMIT_REACHED: { key: 'holdsMax', param: 'max' },
  VARIANT_LIMIT_REACHED: { key: 'variantsMax', param: 'max' },
  DELIVERY_OTP_WRONG: { key: 'attemptsLeft', param: 'attemptsLeft' },
  WALLET_CREDIT_ALREADY_SPENT: { key: 'creditSpent', param: 'spent' },
  WALLET_TOPUP_ALREADY_SPENT: { key: 'creditSpent', param: 'spent' },
  SPLIT_TENDER_MISMATCH: { key: 'billTotal', param: 'total' },
  BUNDLE_COMPONENT_IN_USE: { key: 'bundleName', param: 'bundleName' },
  BUNDLE_SHORT: { key: 'shortItem', param: 'itemName' },
};

/** The second "number" sentence for a commerce refusal, or `''` when the code has none or the value did not arrive. */
export function commerceExtraText(code: string | undefined, params: Record<string, unknown> | undefined, tr: Translator): string {
  const extra = code ? COMMERCE_EXTRA[code] : undefined;
  if (!extra) return '';
  const raw = params?.[extra.param];
  if (raw === null || raw === undefined || typeof raw === 'object') return '';
  const value = String(raw).trim();
  if (!value) return '';
  const key = `common.apiError.extra.${extra.key}`;
  return tr.exists(key) ? tr.t(key, { value }) : '';
}

/** Our sentence for a code, or `undefined` when we have none or cannot fill it. */
export function codedText(code: string | undefined, params: Record<string, unknown> | undefined, tr: Translator): string | undefined {
  if (!code || code.includes('.')) return undefined;
  const key = `errors.${code}`;
  if (!tr.exists(key)) return undefined;
  const values = localiseParams(params, tr);
  // The English template decides which slots are needed; the two catalogues
  // carry the same slots (`npm run i18n:check`).
  const template = tr.t(key, { lng: 'en', skipInterpolation: true });
  const missing = slotsOf(template).filter((s) => !(s in values));
  if (missing.length) return undefined;
  const text = tr.t(key, values);
  const extra = commerceExtraText(code, params, tr);
  return extra ? `${text} ${extra}` : text;
}

export type ResolvedErrorText =
  | { kind: 'text'; text: string }
  | { kind: 'generic' }
  | { kind: 'timeout' }
  | { kind: 'noConnection' };

export function resolveApiErrorText(f: ApiErrorFacts, tr: Translator): ResolvedErrorText {
  const ours = codedText(f.code, f.params, tr);
  if (ours) return { kind: 'text', text: ours };

  if (!f.hasResponse) return f.timedOut ? { kind: 'timeout' } : { kind: 'noConnection' };

  const status = f.status ?? 0;
  if (status >= 500) return { kind: 'generic' };

  const server = f.serverText?.trim();
  if (server) return { kind: 'text', text: server };
  return { kind: 'generic' };
}
