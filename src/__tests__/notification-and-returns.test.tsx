/**
 * Two small pieces of wiring:
 *  - a notification's web link is mapped to this app's screen and its `?id=`
 *    is KEPT, so a tap opens the item and not just its list;
 *  - an order's return eligibility asks the server for documents sourced FROM
 *    that order (`sourceType=ORDER&sourceId=<id>`), not a scan of recent bills.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { idFromLink, notificationDestination } from '../api/notification.api';
import { hasReturnableItems, remainingQty, useOrderReturnEligibility } from '../features/orders/returnEligibility';
import type { PartnerOrder } from '../features/orders/types';
import { callsTo, setRoutes, type Call } from './setup/mockApi';

// ─────────────────────────────────────────────────── notification links
describe('notificationDestination keeps ?id=', () => {
  it.each([
    ['/dashboard/partner/bookings?id=bk_1', '/(app)/(tabs)/bookings?id=bk_1', 'BOOKINGS'],
    ['/dashboard/partner/orders?id=ord-42', '/(app)/(tabs)/orders?id=ord-42', 'ORDERS'],
    ['/dashboard/partner/promotion?id=b1', '/promotion?id=b1', undefined],
    ['/dashboard/partner/reviews?id=rv9', '/reviews?id=rv9', undefined],
  ])('%s → %s', (link, href, requires) => {
    expect(notificationDestination({ link })).toEqual(requires ? { href, requires } : { href });
  });

  it('a link without an id opens the list', () => {
    expect(notificationDestination({ link: '/dashboard/partner/orders' })).toEqual({ href: '/(app)/(tabs)/orders', requires: 'ORDERS' });
  });

  it('single-page destinations take no id', () => {
    expect(notificationDestination({ link: '/dashboard/partner/settings/invoice?id=x' })).toEqual({ href: '/settings/invoice' });
    expect(notificationDestination({ link: '/dashboard/billing?id=x' })).toEqual({ href: '/settings/plan' });
  });

  it('id among other params is found; a malformed id is dropped', () => {
    expect(idFromLink('/dashboard/partner/orders?tab=open&id=abc123')).toBe('abc123');
    expect(idFromLink('/dashboard/partner/orders?id=../../etc')).toBeUndefined();
    expect(idFromLink('/dashboard/partner/orders?id=%E0%A4')).toBeUndefined();
    expect(idFromLink(undefined)).toBeUndefined();
    expect(notificationDestination({ link: '/dashboard/partner/orders?id=a%20b' }))
      .toEqual({ href: '/(app)/(tabs)/orders', requires: 'ORDERS' });
  });

  it('no link → routed by kind prefix, without an id', () => {
    expect(notificationDestination({ kind: 'PARTNER_BOOKING_NEW' })).toEqual({ href: '/(app)/(tabs)/bookings', requires: 'BOOKINGS' });
    expect(notificationDestination({ kind: 'PARTNER_REVIEW' })).toEqual({ href: '/reviews' });
    expect(notificationDestination({ kind: 'SOMETHING_ELSE' })).toBeUndefined();
  });
});

// ───────────────────────────────────────────────── return eligibility
const order = (over: Partial<PartnerOrder> = {}): PartnerOrder => ({
  id: 'ord-1',
  status: 'DELIVERED',
  items: [
    { productId: 'p1', qty: 3 },
    { productId: 'p2', qty: 1 },
  ],
  ...over,
} as unknown as PartnerOrder);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useOrderReturnEligibility', () => {
  it('asks for documents sourced from THIS order and sums non-cancelled credit notes', async () => {
    setRoutes({
      'GET /partners/me/documents': (c: Call) => {
        const p = c.params as { type: string };
        if (p.type === 'TAX_INVOICE') return { data: [{ id: 'inv-1', status: 'ISSUED', lines: [] }] };
        return {
          data: [
            { id: 'cn-1', status: 'ISSUED', lines: [{ itemId: 'p1', qty: 1 }, { itemId: 'p2', qty: 1 }] },
            { id: 'cn-2', status: 'CANCELLED', lines: [{ itemId: 'p1', qty: 2 }] },
            { id: 'cn-3', status: 'ISSUED', lines: [{ itemId: 'p1', qty: 1 }, { qty: 5 }] },
          ],
        };
      },
    });

    const { result } = await renderHook(() => useOrderReturnEligibility(order()), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const sent = callsTo('GET', '/partners/me/documents').map((c) => c.params);
    expect(sent).toHaveLength(2);
    expect(sent).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'ORDER', sourceId: 'ord-1', type: 'TAX_INVOICE', status: 'ISSUED,PARTIALLY_PAID,PAID' }),
      expect.objectContaining({ sourceType: 'ORDER', sourceId: 'ord-1', type: 'CREDIT_NOTE' }),
    ]));

    const data = result.current.data!;
    expect(data.invoiceFound).toBe(true);
    expect(Object.fromEntries(data.returnedByItem)).toEqual({ p1: 2, p2: 1 });
    expect(remainingQty({ productId: 'p1', qty: 3 }, data.returnedByItem)).toBe(1);
    expect(remainingQty({ productId: 'p2', qty: 1 }, data.returnedByItem)).toBe(0);
    expect(hasReturnableItems(order(), data.returnedByItem)).toBe(true);
  });

  it('no invoice sourced from the order → not eligible', async () => {
    setRoutes({ 'GET /partners/me/documents': { data: [] } });
    const { result } = await renderHook(() => useOrderReturnEligibility(order()), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.invoiceFound).toBe(false);
  });

  it('an order not yet delivered asks nothing', async () => {
    const { result } = await renderHook(() => useOrderReturnEligibility(order({ status: 'PLACED' as PartnerOrder['status'] })), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(callsTo('GET', '/partners/me/documents')).toHaveLength(0);
  });

  it('remaining never goes below zero', () => {
    expect(remainingQty({ productId: 'p1', qty: 1 }, new Map([['p1', 4]]))).toBe(0);
    expect(hasReturnableItems(order(), new Map([['p1', 3], ['p2', 1]]))).toBe(false);
  });
});
