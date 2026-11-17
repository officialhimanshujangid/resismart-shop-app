/**
 * PAY-D (P1-22, Owner D4a) — "Pay on web" in the shop app: the hosted link, else the web
 * billing page; the same words as the society and corporate apps.
 */
import fs from 'fs';
import path from 'path';
import { payOnWebUrl } from '../features/billing/PayOnWeb';
import { WEB_BILLING_URL } from '../constants/app';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

describe('Pay on web', () => {
  it('opens the hosted link when the server has one, else the web billing page', async () => {
    expect(await payOnWebUrl(async () => ({ data: { url: 'https://rzp.io/l/abc' } }))).toBe('https://rzp.io/l/abc');
    expect(await payOnWebUrl(async () => ({ data: { url: 'intent://x' } }))).toBe(WEB_BILLING_URL);
    expect(await payOnWebUrl(async () => { throw new Error('offline'); })).toBe(WEB_BILLING_URL);
  });
  it('the same words in every app', () => {
    const b = (j: unknown) => (j as { billing: Record<string, string> }).billing;
    expect(b(en).payOnWeb).toBe('Pay on web');
    expect(b(en).payOnWebHelp).toBe('Plans are bought on the website. Tap to open your billing page.');
    expect(b(hi).payOnWeb).toBe('वेबसाइट पर भुगतान करें');
    expect(b(hi).payOnWebHelp).toBe('प्लान वेबसाइट पर खरीदे जाते हैं। अपना बिलिंग पेज खोलने के लिए टैप करें।');
  });
  it('the plan screen shows it to admins', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../app/(app)/settings/plan.tsx'), 'utf8');
    expect(src).toMatch(/isAdmin \? <PayOnWebRow c=\{c\} \/> : null/);
  });
});
