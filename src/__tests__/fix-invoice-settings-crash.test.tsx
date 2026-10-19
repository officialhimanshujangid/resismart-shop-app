/**
 * FIX 2026-10-15 — the Invoice settings screen crashed on open for a shop that
 * never filled bank details: the server (Mongoose) dropped the empty
 * `bankDetails` sub-document from JSON and the screen read `bankDetails.name`
 * off undefined. Older rows could miss `thermal` the same way.
 */
import React from 'react';
import { waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { renderScreen } from './setup/harness';
import { ToastProvider } from '../components/ui';

jest.mock('../context/AuthContext', () => {
  const state: Record<string, unknown> = {
    isAuthenticated: true,
    isLoading: false,
    token: 't',
    user: { _id: 'u1', name: 'Ravi' },
    profile: { role: 'PARTNER_ADMIN', tenantType: 'PARTNER', tenantId: 'p1', contextId: 'partner:p1', tenantName: 'Sharma Kirana' },
    availableContexts: [],
  };
  const auth = new Proxy(state, { get: (t, k: string) => (k in t ? t[k] : jest.fn(async () => undefined)) });
  return { useAuth: () => auth, AuthProvider: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('../hooks', () => {
  const actual = jest.requireActual('../hooks');
  const full = {
    entitlements: actual.CLOSED_ENTITLEMENTS, loading: false, ready: true, failed: false,
    can: () => true, hasModule: () => true, moduleState: () => 'ON', menu: [], roleLimits: {}, refresh: () => {},
  };
  return { ...actual, usePartnerEntitlements: () => full };
});
jest.mock('../api/settings.api', () => {
  const actual = jest.requireActual('../api/settings.api');
  return {
    ...actual,
    settingsApi: {
      ...actual.settingsApi,
      invoice: {
        ...actual.settingsApi.invoice,
        // What a shop with no bank details actually gets: no `bankDetails`, no `thermal`.
        get: jest.fn(async () => ({ theme: 'CLASSIC', accentColor: '#0E7C43', showHsn: true })),
      },
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const InvoiceSettings = require('../../app/(app)/settings/invoice').default;

describe('Invoice settings — missing bankDetails / thermal', () => {
  it('opens without crashing and shows the form', async () => {
    const screen = await renderScreen(
      <PaperProvider><ToastProvider><InvoiceSettings /></ToastProvider></PaperProvider>,
    );
    await waitFor(() => expect(screen.getByText('Save changes')).toBeTruthy());
  });
});
