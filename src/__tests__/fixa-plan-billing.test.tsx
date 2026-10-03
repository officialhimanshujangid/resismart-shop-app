// >>> FIXA
/**
 * FIXA (MP-3 final wave), shop app — "Plan & billing" parity with the web and
 * the society app:
 *  - the screen and its settings row are named "Plan & billing" (en + hi);
 *  - a refunded invoice offers its GST credit note, opened through the tenant
 *    route (`/billing/invoices/:id/credit-note/pdf`); a refusal is worded from
 *    its code, in Hindi too;
 *  - the proprietor (isAdmin — PARTNER_ADMIN or PARTNER_OWNER) reads the money.
 */
import React from 'react';
import { Alert, Linking } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { act, fireEvent, screen } from '@testing-library/react-native';

import PlanScreen from '../../app/(app)/settings/plan';
import { callsTo, fail, setRoutes } from './setup/mockApi';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

jest.mock('../hooks', () => ({
  ...jest.requireActual('../hooks'),
  usePartnerEntitlements: () => ({
    entitlements: {
      isAdmin: true,
      plan: { name: 'Shop Pro', status: 'active', isTrial: false, isFreeTier: false, trialEndsAt: null },
    },
    ready: true,
    moduleState: () => 'ON',
    refresh: jest.fn(),
  }),
  usePlanUsage: () => ({ rows: [], capacity: () => ({ included: false }) }),
}));

const INVOICES = {
  success: true,
  invoices: [
    { _id: 'inv-r', invoiceType: 'ONLINE_RAZORPAY', amount: 59000, currency: 'INR', status: 'REFUNDED', paidAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', customInvoiceNumber: 'INV/2026-27/00021', customPdfUrl: 'x', razorpayInvoiceUrl: null, planId: { _id: 'p', name: 'Shop Pro' }, tenure: 'monthly', creditNoteNumber: 'CN/2026-27/00009' },
    { _id: 'inv-p', invoiceType: 'ONLINE_RAZORPAY', amount: 59000, currency: 'INR', status: 'PAID', paidAt: '2026-08-01T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z', customInvoiceNumber: 'INV/2026-27/00020', customPdfUrl: 'y', razorpayInvoiceUrl: null, planId: { _id: 'p', name: 'Shop Pro' }, tenure: 'monthly' },
  ],
};
const MY_SUB = {
  success: true, subscription: null, upcoming: [], capabilities: {},
  planStatus: { planName: 'Shop Pro', status: 'active', isFreeTier: false }, nextAmountPaise: 0,
};
const fill = (s: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(v), s);
const paper = (lang?: 'en' | 'hi') => renderScreen(<PaperProvider><PlanScreen /></PaperProvider>, { lang });

let openUrl: jest.SpyInstance;
beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('Plan & billing (shop)', () => {
  it('is named "Plan & billing" in both languages, like the web and the society app', () => {
    expect(en.settings.plan.title).toBe('Plan & billing');
    expect(en.settings.hub.plan).toBe('Plan & billing');
    expect(en.settings.hub.planSection).toBe('Plan & billing');
    expect(hi.settings.plan.title).toBe('प्लान और बिलिंग');
    expect(hi.settings.hub.plan).toBe('प्लान और बिलिंग');
  });

  it('a refunded invoice (only) offers its credit note, opened through the tenant route', async () => {
    setRoutes({
      'GET /billing/my-subscription': MY_SUB,
      'GET /billing/invoices': INVOICES,
      'GET /billing/invoices/inv-r/credit-note/pdf': { success: true, url: 'https://signed.test/cn9.pdf', creditNoteNumber: 'CN/2026-27/00009' },
    });
    await paper();
    const label = fill(en.settings.plan.creditNote, { number: 'CN/2026-27/00009' });
    const row = await screen.findByText(label);
    expect(screen.queryAllByText(/CN\//)).toHaveLength(1);
    await act(async () => { fireEvent.press(row); });
    expect(callsTo('GET', '/billing/invoices/inv-r/credit-note/pdf')).toHaveLength(1);
    expect(openUrl).toHaveBeenCalledWith('https://signed.test/cn9.pdf');
  });

  it('no credit note yet: the coded sentence, in Hindi', async () => {
    setRoutes({
      'GET /billing/my-subscription': MY_SUB,
      'GET /billing/invoices': INVOICES,
      'GET /billing/invoices/inv-r/credit-note/pdf': fail(404, { code: 'CREDIT_NOTE_NOT_ISSUED', message: 'server words' }),
    });
    await paper('hi');
    const row = await screen.findByText(fill(hi.settings.plan.creditNote, { number: 'CN/2026-27/00009' }));
    await act(async () => { fireEvent.press(row); });
    expect(Alert.alert).toHaveBeenCalledWith(hi.settings.plan.creditNoteFailedTitle, hi.settings.plan.creditNoteErrors.CREDIT_NOTE_NOT_ISSUED);
    expect(openUrl).not.toHaveBeenCalled();
  });
});
// <<< FIXA
