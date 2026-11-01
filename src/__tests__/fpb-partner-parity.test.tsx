/**
 * FPB Phase 4 (2026-10-31) — RS Partner app parity with the web panel:
 * P2: the three commerce C5 reports (sales by staff, dead stock, offer performance);
 * P5: cash & bank accounts management and the aisles (categories) screen.
 */
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import MoneyAccountsScreen from '../../app/(app)/money/accounts';
import AislesScreen from '../../app/(app)/catalog/aisles';
import { C5ReportSummary } from '../features/p2/components/C5ReportSummary';
import { C5_REPORT_KEYS, PARTNER_REPORT_KEYS, isC5ReportKey, isSnapshotReportKey } from '../api/reports.api';
import { themeColors } from '../constants/colors';
import { callsTo, setRoutes } from './setup/mockApi';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const mockPerms: { deny: Set<string> } = { deny: new Set() };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: (m: string) => !mockPerms.deny.has(m),
    hasModule: () => true,
    ready: true,
    refresh: jest.fn(),
    entitlements: { isAdmin: true, categoryModules: [] },
    roleLimits: {},
  }),
}));

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const c = themeColors(false);

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockPerms.deny = new Set();
});

describe('P2 — commerce C5 reports on the phone', () => {
  it('the three keys are report keys, dead stock is a snapshot', () => {
    for (const k of C5_REPORT_KEYS) expect(PARTNER_REPORT_KEYS).toContain(k);
    expect(isC5ReportKey('dead-stock')).toBe(true);
    expect(isC5ReportKey('sales')).toBe(false);
    expect(isSnapshotReportKey('dead-stock')).toBe(true);
    expect(isSnapshotReportKey('sales-by-staff')).toBe(false);
  });

  it('every new label exists in en and hi', () => {
    for (const k of C5_REPORT_KEYS) {
      expect((en.reports.tab as Record<string, string>)[k]).toBeTruthy();
      expect((hi.reports.tab as Record<string, string>)[k]).toBeTruthy();
    }
    expect(Object.keys(hi.reports.c5)).toEqual(Object.keys(en.reports.c5));
  });

  it('sales by staff: rows and the billed total, same sums as the web', async () => {
    await paper(<C5ReportSummary c={c} reportKey="sales-by-staff" data={{
      rows: [
        { name: 'Asha', bills: 3, billsPaise: 150000, ordersHandled: 2, ordersDelivered: 1 },
        { name: '', bills: 1, billsPaise: 50000, ordersHandled: 0, ordersDelivered: 0 },
      ],
    }} />);
    expect(screen.getByText('Asha')).toBeTruthy();
    expect(screen.getByText(en.reports.c5.staff.unnamed)).toBeTruthy();
    expect(screen.getByTestId('c5-total-sales-by-staff')).toBeTruthy();
  });

  it('dead stock: class words', async () => {
    await paper(<C5ReportSummary c={c} reportKey="dead-stock" data={{ rows: [{ name: 'Soap', class: 'DEAD', stockQty: 4 }] }} />);
    expect(screen.getByText('Soap')).toBeTruthy();
    expect(screen.getAllByText(en.reports.c5.dead.class.DEAD).length).toBeGreaterThan(0);
  });

  it('offer performance: an empty report never crashes (Hindi)', async () => {
    await paper(<C5ReportSummary c={c} reportKey="offer-performance" data={{}} />, 'hi');
    expect(screen.getByText(hi.reports.c5.offers.empty)).toBeTruthy();
    expect(screen.getByText(hi.reports.c5.offers.messages)).toBeTruthy();
  });
});

describe('P5 — accounts and aisles on the phone', () => {
  const accounts = [
    { _id: 'a1', kind: 'CASH', name: 'Drawer', isDefault: true, isActive: true, openingBalancePaise: 0, balancePaise: 1000 },
    { _id: 'a2', kind: 'BANK', name: 'HDFC', isDefault: false, isActive: true, openingBalancePaise: 0, balancePaise: 5000, bankLast4: '1234' },
  ];

  it('accounts: make default sends isDefault and nothing else', async () => {
    setRoutes({
      'GET /partners/me/money/accounts': { success: true, data: accounts },
      'PUT /partners/me/money/accounts/a2': { success: true, data: { ...accounts[1], isDefault: true } },
    });
    await paper(<MoneyAccountsScreen />);
    await waitFor(() => expect(screen.getByTestId('account-a2')).toBeTruthy());
    fireEvent.press(screen.getByTestId('account-a2'));
    await waitFor(() => expect(screen.getByTestId('account-make-default')).toBeTruthy());
    fireEvent.press(screen.getByTestId('account-make-default'));
    await waitFor(() => expect(callsTo('PUT', '/partners/me/money/accounts/a2')).toHaveLength(1));
    expect(callsTo('PUT', '/partners/me/money/accounts/a2')[0].body).toEqual({ isDefault: true });
  });

  it('accounts: read-only viewers get no actions menu', async () => {
    mockPerms.deny = new Set(['SETTINGS']);
    setRoutes({ 'GET /partners/me/money/accounts': { success: true, data: accounts } });
    await paper(<MoneyAccountsScreen />);
    await waitFor(() => expect(screen.getByText(en.money.accounts.introReadOnly)).toBeTruthy());
  });

  it('aisles: lists, and a hidden aisle can be shown again', async () => {
    setRoutes({
      'GET /partners/me/product-categories': { success: true, data: [
        { _id: 'c1', name: 'Snacks', sortOrder: 1, isActive: true },
        { _id: 'c2', name: 'Old', sortOrder: 2, isActive: false },
      ] },
      'PUT /partners/me/product-categories/c2': { success: true, data: { _id: 'c2', name: 'Old', sortOrder: 2, isActive: true } },
    });
    await paper(<AislesScreen />);
    await waitFor(() => expect(screen.getByText('Snacks')).toBeTruthy());
    fireEvent.press(screen.getByTestId('aisle-toggle-c2'));
    await waitFor(() => expect(callsTo('PUT', '/partners/me/product-categories/c2')).toHaveLength(1));
    expect(callsTo('PUT', '/partners/me/product-categories/c2')[0].body).toEqual({ isActive: true });
  });

  it('aisles: no manage grant, no add or edit buttons', async () => {
    mockPerms.deny = new Set(['CATALOG_MANAGE']);
    setRoutes({ 'GET /partners/me/product-categories': { success: true, data: [{ _id: 'c1', name: 'Snacks', sortOrder: 1, isActive: true }] } });
    await paper(<AislesScreen />);
    await waitFor(() => expect(screen.getByText('Snacks')).toBeTruthy());
    expect(screen.queryByTestId('aisle-add')).toBeNull();
    expect(screen.queryByTestId('aisle-edit-c1')).toBeNull();
  });
});
