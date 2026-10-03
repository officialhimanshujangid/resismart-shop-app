/**
 * Which sentence a partner reads when the server refuses (src/lib/apiErrorText.ts
 * through apiErrorMessage in src/api/axios.ts), and the `errors.<CODE>`
 * catalogue held to the backend's partner + marketplace code lists.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import i18n from 'i18next';

import { apiErrorMessage } from '../api/axios';
import { COMMERCE_EXTRA, codedText, commerceExtraText, resolveApiErrorText, slotsOf, type Translator } from '../lib/apiErrorText';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const refusal = (status: number, data: object) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true, response: { status, data },
  });

const noResponse = (code?: string) =>
  Object.assign(new Error('Network Error'), { isAxiosError: true, code });

const tr: Translator = { t: (k, o) => String(i18n.t(k, o)), exists: (k) => i18n.exists(k) };

// ─────────────────────────────────────────────────────────── the rules
describe('apiErrorMessage — which sentence is shown', () => {
  it('a coded refusal is our English sentence, not the server line', () => {
    const e = refusal(404, { code: 'BOOKING_NOT_FOUND', error: 'server English' });
    expect(apiErrorMessage(e)).toBe(en.errors.BOOKING_NOT_FOUND);
  });

  it('a coded refusal is our Hindi sentence when the partner reads Hindi', async () => {
    await i18n.changeLanguage('hi');
    const e = refusal(404, { code: 'BOOKING_NOT_FOUND', error: 'server English' });
    expect(apiErrorMessage(e)).toBe(hi.errors.BOOKING_NOT_FOUND);
    expect(apiErrorMessage(e)).not.toMatch(/server English/);
  });

  it('params fill the {{slots}} in both languages', async () => {
    const e = refusal(400, { code: 'DOCUMENT_LINE_QTY_INVALID', params: { itemName: 'Rice 5kg' }, error: 'x' });
    expect(apiErrorMessage(e)).toBe(en.errors.DOCUMENT_LINE_QTY_INVALID.replace('{{itemName}}', 'Rice 5kg'));
    await i18n.changeLanguage('hi');
    expect(apiErrorMessage(e)).toBe(hi.errors.DOCUMENT_LINE_QTY_INVALID.replace('{{itemName}}', 'Rice 5kg'));
    expect(apiErrorMessage(e)).not.toMatch(/\{\{/);
  });

  it('a word param (`source`) is put into the reader\'s language', async () => {
    await i18n.changeLanguage('hi');
    const e = refusal(409, { code: 'DOCUMENT_SOURCE_ALREADY_BILLED', params: { source: 'booking' } });
    expect(apiErrorMessage(e)).toBe(
      hi.errors.DOCUMENT_SOURCE_ALREADY_BILLED.replace('{{source}}', hi.common.apiError.param.source.booking),
    );
  });

  it('a coded refusal whose params did not arrive falls back to the server sentence, never braces', () => {
    const e = refusal(400, { code: 'DOCUMENT_LINE_QTY_INVALID', error: '"Rice" needs a quantity greater than zero.' });
    expect(apiErrorMessage(e)).toBe('"Rice" needs a quantity greater than zero.');
  });

  it('an uncoded 4xx shows the server text as sent — even to a Hindi reader', async () => {
    await i18n.changeLanguage('hi');
    expect(apiErrorMessage(refusal(400, { error: 'GSTIN is not valid' }))).toBe('GSTIN is not valid');
    expect(apiErrorMessage(refusal(422, { code: 'SOMETHING_NEW', message: 'A new server sentence' })))
      .toBe('A new server sentence');
  });

  it('a 5xx is the generic line, whatever the server wrote', async () => {
    expect(apiErrorMessage(refusal(500, { error: 'TypeError: cannot read x of undefined' })))
      .toBe(en.common.somethingWentWrong);
    await i18n.changeLanguage('hi');
    expect(apiErrorMessage(refusal(503, { error: 'upstream down' }))).toBe(hi.common.somethingWentWrong);
  });

  it('no response: no-connection, or timeout when the request was aborted', async () => {
    expect(apiErrorMessage(noResponse())).toBe(en.common.apiError.noConnection);
    expect(apiErrorMessage(noResponse('ECONNABORTED'))).toBe(en.common.apiError.timeout);
    await i18n.changeLanguage('hi');
    expect(apiErrorMessage(noResponse())).toBe(hi.common.apiError.noConnection);
  });

  it('the caller\'s fallback wins over the generic line', () => {
    expect(apiErrorMessage(refusal(502, {}), 'Could not load reviews')).toBe('Could not load reviews');
  });
});

describe('resolveApiErrorText (pure)', () => {
  it('orders: coded → server 4xx → generic 5xx → timeout / no connection', () => {
    expect(resolveApiErrorText({ status: 404, code: 'BOOKING_NOT_FOUND', hasResponse: true, timedOut: false }, tr))
      .toEqual({ kind: 'text', text: en.errors.BOOKING_NOT_FOUND });
    expect(resolveApiErrorText({ status: 400, serverText: '  Fix this  ', hasResponse: true, timedOut: false }, tr))
      .toEqual({ kind: 'text', text: 'Fix this' });
    expect(resolveApiErrorText({ status: 400, hasResponse: true, timedOut: false }, tr)).toEqual({ kind: 'generic' });
    expect(resolveApiErrorText({ status: 500, serverText: 'stack', hasResponse: true, timedOut: false }, tr))
      .toEqual({ kind: 'generic' });
    expect(resolveApiErrorText({ hasResponse: false, timedOut: true }, tr)).toEqual({ kind: 'timeout' });
    expect(resolveApiErrorText({ hasResponse: false, timedOut: false }, tr)).toEqual({ kind: 'noConnection' });
  });

  it('a dotted code is never looked up in errors.*', () => {
    expect(codedText('visitors.alreadyLeft', undefined, tr)).toBeUndefined();
  });

  it('slotsOf reads {{slot}} names', () => {
    expect(slotsOf('A {{label}} can become: {{ allowed }}.')).toEqual(['label', 'allowed']);
  });
});

// ─────────────────────────────────────────────── catalogue ↔ backend
/**
 * The backend files are read as TEXT (as mobile-guard's tests do): the shop
 * app does not compile backend code. Comments are stripped first so a
 * `{placeholder}` in a JSDoc never counts.
 */
const BACKEND = resolve(__dirname, '../../../backend/src/constants');
const read = (f: string) => readFileSync(resolve(BACKEND, f), 'utf8');

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const block = (src: string, start: string) => {
  const i = src.indexOf(start);
  if (i < 0) throw new Error(`"${start}" not found in the backend file — has it been renamed?`);
  const j = src.indexOf('\n}', i);
  return stripComments(src.slice(i + start.length, j));
};
/** `CODE: …` at two-space indent → the text up to the next such key. */
function entries(body: string): Map<string, string> {
  const out = new Map<string, string>();
  const keys = [...body.matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)];
  keys.forEach((m, i) => out.set(m[1], body.slice(m.index! + m[0].length, keys[i + 1]?.index ?? body.length)));
  return out;
}
const STRING = /(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/;
const firstString = (s: string) => s.match(STRING)?.[2] ?? '';
const field = (seg: string, name: 'en' | 'hi') => {
  const at = seg.search(new RegExp(`\\b${name}:`));
  return at < 0 ? undefined : firstString(seg.slice(at));
};
const backendSlots = (s: string) => [...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
const appSlots = (s: string) => slotsOf(s).sort();

const partner = read('partner-error-codes.ts');
const market = read('marketplace-error-codes.ts');
const catalogue = entries(block(read('error-codes.ts'), 'export const ERROR_CATALOGUE = {'));

const PARTNER_HI = entries(block(partner, 'export const PARTNER_ERROR_HI = {'));
const PARTNER_WIRE = entries(block(partner, 'export const PARTNER_WIRE_CODES = {'));
const MARKET = entries(block(market, 'export const MARKETPLACE_ERROR_CODES = {'));

/** code → the backend's { en, hi } with `{x}` placeholders. */
const backend = new Map<string, { en: string; hi: string }>();
for (const [code, seg] of PARTNER_HI) {
  const enSeg = catalogue.get(code);
  backend.set(code, { en: enSeg ? field(enSeg, 'en') ?? '' : '', hi: firstString(seg) });
}
for (const [code, seg] of [...PARTNER_WIRE, ...MARKET]) {
  backend.set(code, { en: field(seg, 'en') ?? '', hi: field(seg, 'hi') ?? '' });
}
/** Sign-in / session refusals (auth contract 2026-09-29). Seeded verbatim. */
const AUTH = entries(block(read('auth-error-codes.ts'), 'export const AUTH_ERROR_CODES = {'));
for (const [code, seg] of AUTH) {
  backend.set(code, { en: field(seg, 'en') ?? '', hi: field(seg, 'hi') ?? '' });
}
/**
 * P4 "My shop rent" (CONTRACT-partner-P4 §4 / §10.8): only the codes the SHOP
 * can receive — `LEASE_PARTNER_CODES`. The office codes belong to the society
 * clients and are not in this catalogue.
 */
const leaseSrc = read('lease-error-codes.ts');
const LEASE = entries(block(leaseSrc, 'export const LEASE_ERROR_CODES = {'));
const LEASE_PARTNER = [...(leaseSrc.match(/LEASE_PARTNER_CODES = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
for (const code of LEASE_PARTNER) {
  const seg = LEASE.get(code);
  if (seg) backend.set(code, { en: field(seg, 'en') ?? '', hi: field(seg, 'hi') ?? '' });
}

/**
 * Commerce (CONTRACT-commerce §4): BOTH audiences. The shop meets the resident
 * codes as well — a counter coupon refused with OFFER_BELOW_MINIMUM, points
 * short at the till, a variant parent on a bill — so the shop app carries every
 * code in `commerce-error-codes.ts`. Whole sentences, no placeholders; seeded
 * verbatim.
 */
const commerceSrc = read('commerce-error-codes.ts');
const COMMERCE = new Map([
  ...entries(block(commerceSrc, 'export const COMMERCE_ORDER_ERROR_CODES = {')),
  ...entries(block(commerceSrc, 'export const COMMERCE_PARTNER_ERROR_CODES = {')),
]);
for (const [code, seg] of COMMERCE) {
  backend.set(code, { en: field(seg, 'en') ?? '', hi: field(seg, 'hi') ?? '' });
}

describe('errors.<CODE> catalogue matches the backend', () => {
  it('every commerce code (resident + partner) is in both catalogues, word for word', () => {
    expect(COMMERCE.size).toBeGreaterThan(80);
    expect(COMMERCE.has('OFFER_LOCKED_AFTER_USE')).toBe(true);
    expect(COMMERCE.has('WALLET_TOPUP_ALREADY_SPENT')).toBe(true);
    const enErr = en.errors as Record<string, string>;
    const hiErr = hi.errors as Record<string, string>;
    for (const code of COMMERCE.keys()) {
      const want = backend.get(code)!;
      expect(want.en && want.hi).toBeTruthy();
      expect({ code, en: enErr[code], hi: hiErr[code] }).toEqual({ code, en: want.en, hi: want.hi });
    }
  });

  it('a commerce refusal reads in the partner\'s language', async () => {
    const e = refusal(409, { code: 'HOLD_LIMIT_REACHED', params: { max: '20' }, error: 'server English' });
    // MP-1 (b): the number the refusal carries follows as a second sentence, as on the web.
    expect(apiErrorMessage(e)).toBe(`${(en.errors as Record<string, string>).HOLD_LIMIT_REACHED} ${en.common.apiError.extra.holdsMax.replace('{{value}}', '20')}`);
    expect(apiErrorMessage(e)).not.toMatch(/server English/);
    await i18n.changeLanguage('hi');
    expect(apiErrorMessage(e)).toBe(`${(hi.errors as Record<string, string>).HOLD_LIMIT_REACHED} ${hi.common.apiError.extra.holdsMax.replace('{{value}}', '20')}`);
  });

  // ── MP-1 (b): the web's COMMERCE_EXTRA, held to the web file — same codes, same params, same words.
  it('the second "number" sentence uses the same codes and params as the web, and web words', () => {
    const webSrc = readFileSync(resolve(__dirname, '../../../frontend/src/lib/commerce-error-codes.ts'), 'utf8');
    const block = webSrc.slice(webSrc.indexOf('export const COMMERCE_EXTRA'));
    const web = new Map([...block.matchAll(/^\s+([A-Z_]+): \{ key: '([a-zA-Z]+)', param: '([a-zA-Z]+)' \}/gm)].map((m) => [m[1], { key: m[2], param: m[3] }]));
    expect(web.size).toBeGreaterThan(10);
    expect(Object.fromEntries(web)).toEqual(COMMERCE_EXTRA);
    const webEn = JSON.parse(readFileSync(resolve(__dirname, '../../../frontend/src/i18n/messages/en.json'), 'utf8')).marketplaceErrors.extra as Record<string, string>;
    const webHi = JSON.parse(readFileSync(resolve(__dirname, '../../../frontend/src/i18n/messages/hi.json'), 'utf8')).marketplaceErrors.extra as Record<string, string>;
    const ourEn = en.common.apiError.extra as Record<string, string>;
    const ourHi = hi.common.apiError.extra as Record<string, string>;
    for (const { key } of web.values()) {
      expect({ key, en: ourEn[key] }).toEqual({ key, en: webEn[key].replace('{value}', '{{value}}') });
      expect({ key, hi: ourHi[key] }).toEqual({ key, hi: webHi[key].replace('{value}', '{{value}}') });
    }
  });

  it('the extra sentence: combo name, bill total, role cap — and none when the value did not arrive', () => {
    const extra = en.common.apiError.extra;
    const msg = (code: string, params?: Record<string, unknown>) => apiErrorMessage(refusal(409, { code, ...(params ? { params } : {}), error: 'x' }));
    const ERR = en.errors as Record<string, string>;
    expect(msg('BUNDLE_COMPONENT_IN_USE', { bundleName: 'Gift pack' })).toBe(`${ERR.BUNDLE_COMPONENT_IN_USE} ${extra.bundleName.replace('{{value}}', 'Gift pack')}`);
    expect(msg('BUNDLE_COMPONENT_IN_USE', { bundleName: 'Gift pack' })).toBe('This item is part of a combo. Remove it from the combo first. Combo: Gift pack.');
    expect(msg('SPLIT_TENDER_MISMATCH', { total: '1,250.00', sum: '1,200.00' })).toBe(`${ERR.SPLIT_TENDER_MISMATCH} Bill total: ₹1,250.00.`);
    expect(msg('OFFER_DISCOUNT_ABOVE_ROLE_CAP', { max: '15' })).toBe(`${ERR.OFFER_DISCOUNT_ABOVE_ROLE_CAP} Your role allows up to 15% off.`);
    expect(msg('WALLET_TOPUP_ALREADY_SPENT', { spent: '300.00' })).toBe(`${ERR.WALLET_TOPUP_ALREADY_SPENT} Already spent: ₹300.00.`);
    expect(msg('VARIANT_LIMIT_REACHED')).toBe(ERR.VARIANT_LIMIT_REACHED);
    expect(msg('HOLD_NOT_FOUND', { max: '20' })).toBe(ERR.HOLD_NOT_FOUND);
    expect(commerceExtraText('BUNDLE_SHORT', { itemName: '  ' }, tr)).toBe('');
  });

  it('read a plausible number of codes from each backend file', () => {
    expect(PARTNER_HI.size).toBeGreaterThan(50);
    expect(PARTNER_WIRE.size).toBeGreaterThan(0);
    expect(MARKET.size).toBeGreaterThan(30);
    // The parser really sees placeholders (English from ERROR_CATALOGUE, Hindi from PARTNER_ERROR_HI).
    expect(backendSlots(backend.get('DOCUMENT_LINE_RATE_INVALID')!.en)).toEqual(['itemName', 'ratePaise']);
    expect(backendSlots(backend.get('DOCUMENT_LINE_RATE_INVALID')!.hi)).toEqual(['itemName', 'ratePaise']);
    for (const [code, t] of backend) {
      expect({ code, en: !!t.en, hi: !!t.hi }).toEqual({ code, en: true, hi: true });
    }
  });

  it('every auth code is in both catalogues, word for word as the backend seeds it', () => {
    expect(AUTH.size).toBeGreaterThan(40);
    const enErr = en.errors as Record<string, string>;
    const hiErr = hi.errors as Record<string, string>;
    for (const code of AUTH.keys()) {
      const want = backend.get(code)!;
      expect({ code, en: enErr[code], hi: hiErr[code] }).toEqual({ code, en: want.en, hi: want.hi });
    }
  });

  it('every shop-side lease code (RENT_*) is in both catalogues, word for word', () => {
    expect(LEASE_PARTNER).toEqual(['RENT_BILL_NOT_FOUND', 'RENT_NOTHING_DUE', 'RENT_PAID_NOTE_LIMIT', 'RENT_FIELD_INVALID']);
    const enErr = en.errors as Record<string, string>;
    const hiErr = hi.errors as Record<string, string>;
    for (const code of LEASE_PARTNER) {
      const want = backend.get(code)!;
      expect(want.en && want.hi).toBeTruthy();
      expect({ code, en: enErr[code], hi: hiErr[code] }).toEqual({ code, en: want.en, hi: want.hi });
    }
  });

  it('en and hi carry exactly the backend\'s partner + marketplace + auth + shop-lease codes', () => {
    const want = [...backend.keys()].sort();
    expect(Object.keys(en.errors).sort()).toEqual(want);
    expect(Object.keys(hi.errors).sort()).toEqual(want);
  });

  it('every sentence uses the backend\'s placeholders, {x} ↔ {{x}}', () => {
    const enErr = en.errors as Record<string, string>;
    const hiErr = hi.errors as Record<string, string>;
    const mismatches: string[] = [];
    for (const [code, t] of backend) {
      if (enErr[code] === undefined) continue; // reported by the test above
      const want = backendSlots(t.en).join(',');
      if (appSlots(enErr[code]).join(',') !== want) mismatches.push(`en ${code}: ${appSlots(enErr[code])} vs {${want}}`);
      const wantHi = backendSlots(t.hi).join(',');
      if (appSlots(hiErr[code]).join(',') !== wantHi) mismatches.push(`hi ${code}: ${appSlots(hiErr[code])} vs {${wantHi}}`);
      // No single-brace leftovers from a copy of the backend's `{x}`.
      if (/(^|[^{])\{[a-zA-Z0-9_]+\}(?!\})/.test(enErr[code])) mismatches.push(`en ${code}: single-brace {x}`);
      if (/(^|[^{])\{[a-zA-Z0-9_]+\}(?!\})/.test(hiErr[code])) mismatches.push(`hi ${code}: single-brace {x}`);
    }
    expect(mismatches).toEqual([]);
  });
});
