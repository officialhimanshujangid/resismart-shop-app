// >>> X2F
/**
 * X2F — one-factor partner plans in the shop app (Owner, 2026-10-04).
 *
 *  - The `errors.<CODE>` sentences for the catalogue-items codes are the
 *    backend's `plan-items-codes.ts`, word for word, in en + hi.
 *  - The catalogue-items 402 reads in our coded words plus a Play-neutral next
 *    step ("archive items"), never "Plan & billing" or a purchase pointer.
 *  - One meter: products and services read the catalogue-items row; every other
 *    old plan key is not limited (no meter, no locked button).
 *  - No module is plan-LOCKED any more.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import i18n from 'i18next';

import { apiErrorMessage } from '../api/axios';
import { capacityOf, CATALOG_ITEMS_KEY } from '../hooks/usePlanUsage';
import { moduleStateOf, moduleMenuEntries, CLOSED_ENTITLEMENTS } from '../hooks/usePartnerEntitlements';
import { PARTNER_MODULES } from '../types/api-contract.generated';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const SRC = readFileSync(resolve(__dirname, '../../../backend/src/constants/plan-items-codes.ts'), 'utf8');

/** `CODE: { … en: '…', hi: '…' }` → the two strings, `{x}` turned into `{{x}}`. */
function backendText(code: string): { en: string; hi: string } {
  const at = SRC.indexOf(`  ${code}: {`);
  if (at < 0) throw new Error(`${code} not in plan-items-codes.ts`);
  const seg = SRC.slice(at, SRC.indexOf('\n  },', at));
  const pick = (lang: 'en' | 'hi') => {
    const m = seg.match(new RegExp(`\\b${lang}: '((?:\\\\'|[^'])*)'`));
    return (m?.[1] ?? '').replace(/\\'/g, "'").replace(/\{(\w+)\}/g, '{{$1}}');
  };
  return { en: pick('en'), hi: pick('hi') };
}

const refusal = (status: number, data: object) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true, response: { status, data },
  });

describe('X2F — catalogue-items codes match the backend word for word', () => {
  it.each(['PLAN_TOO_FEW_ITEMS', 'CATALOG_ITEMS_LIMIT', 'CATALOG_ITEMS_LIMIT_BULK', 'ITEM_VIEW_ONLY', 'PARTNER_WHATSAPP_OFF'])(
    '%s',
    (code) => {
      const want = backendText(code);
      expect(want.en && want.hi).toBeTruthy();
      expect((en.errors as Record<string, string>)[code]).toBe(want.en);
      expect((hi.errors as Record<string, string>)[code]).toBe(want.hi);
    },
  );

  it('the archive hint is the backend NONE next step (Play-neutral)', () => {
    const at = SRC.indexOf('  NONE: {');
    const seg = SRC.slice(at, SRC.indexOf('\n  },', at));
    expect(seg).toContain(`en: '${en.planItems.archiveHint}'`);
    expect(seg).toContain(`hi: '${hi.planItems.archiveHint}'`);
  });
});

describe('X2F — the catalogue-items 402', () => {
  const body = {
    success: false, code: 'PLAN_LIMIT_REACHED', messageKey: 'CATALOG_ITEMS_LIMIT', upgradeRequired: true,
    message: 'server English … on the Plan & billing page', params: { limit: 25, used: 25, remaining: 0, requested: 1 },
  };

  it('reads as the coded sentence + archive hint, in English', () => {
    const text = apiErrorMessage(refusal(402, body));
    expect(text).toBe(`${en.errors.CATALOG_ITEMS_LIMIT.replace('{{limit}}', '25').replace('{{used}}', '25')} ${en.planItems.archiveHint}`);
    expect(text).not.toMatch(/Plan & billing|upgrade/i);
  });

  it('and in Hindi', async () => {
    await i18n.changeLanguage('hi');
    const text = apiErrorMessage(refusal(402, body));
    expect(text).toBe(`${hi.errors.CATALOG_ITEMS_LIMIT.replace('{{limit}}', '25').replace('{{used}}', '25')} ${hi.planItems.archiveHint}`);
  });

  it('the bulk sentence fills all four numbers', () => {
    const text = apiErrorMessage(refusal(402, { ...body, messageKey: 'CATALOG_ITEMS_LIMIT_BULK', params: { limit: 25, used: 20, remaining: 5, requested: 9 } }));
    expect(text).toContain('you can add 5 more, not 9');
    expect(text).not.toMatch(/\{\{/);
  });
});

describe('X2F — one meter', () => {
  const rows = [{ key: CATALOG_ITEMS_KEY, noun: 'catalogue items', kind: 'STOCK' as const, limit: 25, included: true, used: 25, overBy: 0 }];

  it('products and services read the one catalogue-items row', () => {
    for (const key of ['max_products', 'max_services', CATALOG_ITEMS_KEY]) {
      const cap = capacityOf(rows, key);
      expect(cap).toMatchObject({ used: 25, limit: 25, atLimit: true, included: true });
    }
  });

  it('a retired plan key (bills, customers, staff) is never limited', () => {
    for (const key of ['max_invoices_month', 'max_customers', 'max_partner_staff', 'max_bookings_month']) {
      const cap = capacityOf(rows, key);
      expect(cap).toMatchObject({ included: true, limit: null, atLimit: false, noun: '' });
    }
  });

  it('carries overBy (view-only items)', () => {
    expect(capacityOf([{ ...rows[0], used: 30, overBy: 5 }], 'max_products').overBy).toBe(5);
  });
});

describe('X2F — no plan-LOCKED modules', () => {
  it('a module the business has not switched on is OFF, never LOCKED, whatever the plan limits say', () => {
    const ent = { ...CLOSED_ENTITLEMENTS, modules: ['BOOKINGS' as const], plan: { ...CLOSED_ENTITLEMENTS.plan, limits: {} } };
    for (const m of PARTNER_MODULES) {
      expect(moduleStateOf(ent, m)).toBe(m === 'BOOKINGS' ? 'ON' : 'OFF');
    }
  });

  it('the More menu lists only switched-on modules (no LOCKED rows)', () => {
    const ent = {
      ...CLOSED_ENTITLEMENTS,
      isAdmin: true,
      awaitingRole: false,
      modules: ['CATALOG' as const],
      permissions: { CATALOG_VIEW: 'FULL', PROMOTION: 'FULL', SETTINGS: 'FULL' },
    } as unknown as typeof CLOSED_ENTITLEMENTS;
    const menu = moduleMenuEntries(ent, true);
    expect(menu.every((e) => e.state === 'ON')).toBe(true);
    expect(menu.map((e) => e.module)).not.toContain('PROMOTION');
  });
});
// <<< X2F
