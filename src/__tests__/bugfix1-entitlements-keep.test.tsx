/**
 * BUG-043 (shop app) — a failed RE-read of `/partners/me/entitlements` keeps the
 * last good answer instead of emptying the menu; with no good answer at all it
 * still fails closed and says so (`failed`).
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockEntitlements = jest.fn();
jest.mock('../api/partner.api', () => {
  const actual = jest.requireActual('../api/partner.api');
  return { ...actual, partnerApi: { ...actual.partnerApi, entitlements: () => mockEntitlements() } };
});

// eslint-disable-next-line import/first
import { usePartnerEntitlements } from '../hooks/usePartnerEntitlements';

const GOOD = { isAdmin: true, modules: [], permissions: {}, plan: { name: 'Growth', isFreeTier: false, limits: {} } };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

describe('BUG-043 — shop entitlements', () => {
  beforeEach(() => mockEntitlements.mockReset());

  it('a failed RE-read keeps the good answer (ready, not failed)', async () => {
    mockEntitlements.mockResolvedValueOnce(GOOD).mockRejectedValueOnce(Object.assign(new Error('HTTP 502'), { response: { status: 502 } }));
    const { client, wrapper } = setup();
    const { result, unmount } = await renderHook(() => usePartnerEntitlements(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.entitlements.isAdmin).toBe(true);
    await act(async () => { await client.refetchQueries(); });
    await waitFor(() => expect(mockEntitlements).toHaveBeenCalledTimes(2));
    expect(result.current.ready).toBe(true);
    expect(result.current.failed).toBe(false);
    expect(result.current.entitlements.isAdmin).toBe(true);
    unmount();
    client.clear();
  });

  it('with no good answer it still fails closed and says so', async () => {
    mockEntitlements.mockRejectedValue(Object.assign(new Error('HTTP 502'), { response: { status: 502 } }));
    const { client, wrapper } = setup();
    const { result, unmount } = await renderHook(() => usePartnerEntitlements(), { wrapper });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.ready).toBe(false);
    expect(result.current.entitlements.isAdmin).toBe(false);
    unmount();
    client.clear();
  });
});
