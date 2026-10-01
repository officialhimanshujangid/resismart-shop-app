/**
 * Partner P2 foundation in the shop app (CONTRACT-partner-P2 §2.2, §5, §13, §14 S):
 *  - the business-type module switches + settings (Settings → Business type modules);
 *  - the nine P2 notification kinds and their links route to the P2 screens, each
 *    behind its base AND category module;
 *  - HARD RULE: nothing new appears for a business that never switched one on.
 */
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import BusinessTypesScreen from '../../app/(app)/settings/business-types';
import { notificationDestination } from '../api/notification.api';
import {
  MODULE_SETTINGS_DEFAULTS, categoryModulesOf, normaliseSettings, normaliseView,
} from '../features/p2/modules';
import { P2TodayShortcuts } from '../features/p2/P2Shortcuts';
import { P2ReportSummary } from '../features/p2/components/P2ReportSummary';
import { addDays, istDayOf, istInstant, istTimeOf, monthDays, weekdayOf } from '../features/p2/dates';
import { themeColors } from '../constants/colors';
import { callsTo, fail, setRoutes } from './setup/mockApi';
import { router } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const mockPerms: { deny: Set<string>; modules: string[] } = { deny: new Set(), modules: [] };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: (m: string) => !mockPerms.deny.has(m),
    hasModule: () => true,
    ready: true,
    refresh: jest.fn(),
    entitlements: { isAdmin: true, categoryModules: mockPerms.modules },
    roleLimits: {},
  }),
}));

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(String(v)), s);

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockPerms.deny = new Set();
  mockPerms.modules = [];
});

const view = (over: Partial<Record<string, { on: boolean; effective: boolean; missingBase?: string[] }>> = {}) => ({
  modules: ['PHARMACY', 'SUBSCRIPTIONS', 'APPOINTMENTS', 'JOBS'].map((key) => ({
    key,
    on: over[key]?.on ?? false,
    effective: over[key]?.effective ?? false,
    requires: key === 'JOBS' ? ['BOOKINGS', 'INVOICING'] : ['CATALOG'],
    missingBase: over[key]?.missingBase ?? [],
  })),
  settings: MODULE_SETTINGS_DEFAULTS,
});

// ───────────────────────────────────────────────────────────── pure rules
describe('P2 modules — pure', () => {
  it('absent or garbage categoryModules reads as none (HARD RULE direction)', () => {
    expect(categoryModulesOf(undefined)).toEqual([]);
    expect(categoryModulesOf({})).toEqual([]);
    expect(categoryModulesOf({ categoryModules: ['PHARMACY', 'NOPE', 7] })).toEqual(['PHARMACY']);
  });

  it('settings: garbage → default, near-expiry sorted high to low, no window when absent', () => {
    const s = normaliseSettings({ pharmacy: { nearExpiryDays: [7, 90, 30], enforceMrp: 'yes' }, appointments: {} });
    expect(s.pharmacy.nearExpiryDays).toEqual([90, 30, 7]);
    expect(s.pharmacy.enforceMrp).toBe(true);
    expect(s.appointments.customerChangeCutoffMin).toBeUndefined();
    expect(normaliseSettings({ appointments: { customerChangeCutoffMin: 120 } }).appointments.customerChangeCutoffMin).toBe(120);
  });

  it('the view always has the four modules in order', () => {
    expect(normaliseView({ modules: [{ key: 'JOBS', on: true, effective: true }] }).modules.map((m) => m.key))
      .toEqual(['PHARMACY', 'SUBSCRIPTIONS', 'APPOINTMENTS', 'JOBS']);
  });

  it('IST days do not depend on the phone clock zone', () => {
    // 20:00 UTC is already the next day in India.
    expect(istDayOf(new Date('2026-10-01T20:00:00Z'))).toBe('2026-10-02');
    expect(istTimeOf('2026-10-01T04:30:00Z')).toBe('10:00');
    expect(istInstant('2026-10-02', '09:30')).toBe('2026-10-02T09:30:00+05:30');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(weekdayOf('2026-10-04')).toBe(0);
    expect(monthDays('2026-02')).toHaveLength(28);
  });
});

// ─────────────────────────────────────────────────────── notification routing
describe('P2 notifications route to the P2 screens', () => {
  it.each([
    [{ kind: 'PARTNER_NEAR_EXPIRY', link: '/dashboard/partner/pharmacy/near-expiry' }, '/pharmacy/near-expiry', 'PHARMACY'],
    [{ kind: 'PARTNER_NEAR_EXPIRY' }, '/pharmacy/near-expiry', 'PHARMACY'],
    [{ kind: 'SUBSCRIPTION_PAUSE', link: '/dashboard/partner/subscriptions/sub1' }, '/subscriptions/sub1', 'SUBSCRIPTIONS'],
    [{ kind: 'SUBSCRIPTION_BILL', link: '/dashboard/partner/subscriptions/bills?period=2026-09&status=FAILED' }, '/subscriptions/bills?period=2026-09&status=FAILED', 'SUBSCRIPTIONS'],
    [{ kind: 'SUBSCRIPTION_BILL' }, '/subscriptions/bills', 'SUBSCRIPTIONS'],
    [{ kind: 'APPOINTMENT_SERIES', link: '/dashboard/partner/appointments/series/s1' }, '/appointments/series/s1', 'APPOINTMENTS'],
    [{ kind: 'APPOINTMENT_REMINDER' }, '/appointments', 'APPOINTMENTS'],
    [{ kind: 'PACKAGE_UPDATE' }, '/appointments/packages', 'APPOINTMENTS'],
    [{ kind: 'JOB_QUOTE_DECISION', link: '/dashboard/partner/jobs/j1' }, '/jobs/j1', 'JOBS'],
    [{ kind: 'JOB_GATE_PASS', link: '/dashboard/partner/jobs/j2' }, '/jobs/j2', 'JOBS'],
    [{ kind: 'JOB_QUOTE' }, '/jobs', 'JOBS'],
  ])('%j → %s behind %s', (frame, href, category) => {
    const dest = notificationDestination(frame);
    expect(dest?.href).toBe(href);
    expect(dest?.requiresCategory).toBe(category);
    expect(dest?.requires).toBeTruthy();
  });

  it('a 2-hour reminder that links a booking still opens that booking', () => {
    const dest = notificationDestination({ kind: 'APPOINTMENT_REMINDER', link: '/dashboard/partner/bookings?id=b1' });
    expect(dest?.href).toBe('/(app)/(tabs)/bookings?id=b1');
    expect(dest?.requiresCategory).toBeUndefined();
  });

  it('a malformed id in a P2 link is not passed on', () => {
    expect(notificationDestination({ kind: 'JOB_QUOTE_DECISION', link: '/dashboard/partner/jobs/../../x' })?.href).toBe('/jobs');
  });
});

// ─────────────────────────────────────────────────────────── Today shortcuts
describe('P2 Today shortcuts', () => {
  const c = themeColors(false);
  it('nothing for a business that never switched a module on', async () => {
    await paper(<P2TodayShortcuts c={c} />);
    expect(screen.queryByTestId('p2-today-DELIVERIES')).toBeNull();
    expect(screen.queryByTestId('p2-today-JOBS')).toBeNull();
  });

  it('a delivery boy (DELIVERIES_MARK only) gets Today\'s deliveries and nothing else of subscriptions', async () => {
    mockPerms.modules = ['SUBSCRIPTIONS'];
    mockPerms.deny = new Set(['SUBSCRIPTIONS_VIEW', 'ATTENDANCE_MARK']);
    await paper(<P2TodayShortcuts c={c} />);
    await fireEvent.press(screen.getByTestId('p2-today-DELIVERIES'));
    expect(router.push).toHaveBeenCalledWith('/subscriptions/deliveries');
    expect(screen.queryByTestId('p2-today-ATTENDANCE')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────── business-type screen
describe('Settings → Business type modules', () => {
  it('switching Pharmacy on is one tap and one PUT', async () => {
    setRoutes({
      'GET /partners/me/category-modules': { success: true, data: view() },
      'PUT /partners/me/category-modules/PHARMACY': { success: true, data: view({ PHARMACY: { on: true, effective: true } }) },
    });
    await paper(<BusinessTypesScreen />);
    await waitFor(() => expect(screen.getByTestId('p2-switch-PHARMACY')).toBeTruthy());
    await act(async () => { fireEvent(screen.getByTestId('p2-switch-PHARMACY'), 'valueChange', true); });
    await waitFor(() => expect(callsTo('PUT', '/partners/me/category-modules/PHARMACY')).toHaveLength(1));
    expect(callsTo('PUT', '/partners/me/category-modules/PHARMACY')[0].body).toEqual({ on: true });
  });

  it('the NEEDS_BASE refusal is read in Hindi with its params', async () => {
    const params = { module: 'Jobs', needs: 'Bookings and Invoicing' };
    setRoutes({
      'GET /partners/me/category-modules': { success: true, data: view() },
      'PUT /partners/me/category-modules/JOBS': fail(409, { code: 'CATEGORY_MODULE_NEEDS_BASE', params }),
    });
    await paper(<BusinessTypesScreen />, 'hi');
    await waitFor(() => expect(screen.getByTestId('p2-switch-JOBS')).toBeTruthy());
    await act(async () => { fireEvent(screen.getByTestId('p2-switch-JOBS'), 'valueChange', true); });
    await waitFor(() => expect(screen.getByText(fill(hi.errors.CATEGORY_MODULE_NEEDS_BASE, params))).toBeTruthy());
  });

  it('switching off asks first and says nothing is deleted', async () => {
    setRoutes({ 'GET /partners/me/category-modules': { success: true, data: view({ JOBS: { on: true, effective: true } }) } });
    await paper(<BusinessTypesScreen />);
    await waitFor(() => expect(screen.getByTestId('p2-switch-JOBS')).toBeTruthy());
    await act(async () => { fireEvent(screen.getByTestId('p2-switch-JOBS'), 'valueChange', false); });
    const [, body] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(body).toBe(en.p2.settings.offBody);
    expect(callsTo('PUT', '/partners/me/category-modules/JOBS')).toHaveLength(0);
  });

  it('module settings save the whole key (jobs)', async () => {
    setRoutes({
      'GET /partners/me/category-modules': { success: true, data: view() },
      'PUT /partners/me/category-modules/settings/jobs': { success: true, data: { settings: MODULE_SETTINGS_DEFAULTS } },
    });
    await paper(<BusinessTypesScreen />);
    await waitFor(() => expect(screen.getByTestId('p2-settings-JOBS')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('p2-settings-JOBS'));
    await fireEvent.press(screen.getByLabelText(`+ ${en.p2.settings.jobs.maxUses}`));
    await fireEvent.press(screen.getByTestId('p2-settings-save'));
    await waitFor(() => expect(callsTo('PUT', '/partners/me/category-modules/settings/jobs')).toHaveLength(1));
    expect(callsTo('PUT', '/partners/me/category-modules/settings/jobs')[0].body).toMatchObject({ gatePassMaxUses: 3, quoteValidityDays: 7 });
  });

  it('without SETTINGS FULL the switches are view only', async () => {
    mockPerms.deny = new Set(['SETTINGS']);
    setRoutes({ 'GET /partners/me/category-modules': { success: true, data: view() } });
    await paper(<BusinessTypesScreen />);
    await waitFor(() => expect(screen.getByTestId('p2-switch-PHARMACY')).toBeTruthy());
    expect(screen.getByTestId('p2-switch-PHARMACY')).toBeDisabled();
    expect(screen.getByText(en.p2.common.viewOnly)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────── P2 report summaries
describe('P2 report summaries (B5)', () => {
  const c = themeColors(false);
  it('job conversion shows the funnel and the open pipeline', async () => {
    await paper(<P2ReportSummary c={c} reportKey="job-conversion" data={{
      funnel: { jobs: 12, quoted: 10, approved: 6, conversionBasisPoints: 6000 },
      money: { invoicedPaise: 250000 },
      openPipeline: [{ stage: 'QUOTED', jobs: 3, pendingQuotePaise: 90000 }],
    }} />);
    expect(screen.getByText('60.0%')).toBeTruthy();
    expect(screen.getByText('QUOTED')).toBeTruthy();
  });
  it('a report missing blocks still renders (Hindi labels)', async () => {
    await paper(<P2ReportSummary c={c} reportKey="subscription-collections" data={{}} />, 'hi');
    expect(screen.getByText(hi.reports.p2.billed)).toBeTruthy();
  });
});