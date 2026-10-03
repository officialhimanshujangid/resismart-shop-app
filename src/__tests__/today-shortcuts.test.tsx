// >>> SHORTCUTS
/**
 * The Shortcuts grid on Today: each tile gated exactly like its destination,
 * nothing that leads to a refused screen, the section gone when nothing
 * qualifies, and the labels in English and Hindi.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen } from '@testing-library/react-native';

import { shortcutTilesFor, TodayShortcutGrid } from '../features/today/ShortcutGrid';
import { commerceAccessOf } from '../features/commerce/access';
import { themeColors } from '../constants/colors';
import { router } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

type Level = 'READ' | 'FULL';
const mockState: {
  ready: boolean; isAdmin: boolean; perms: Record<string, Level>; modules: string[]; features: string[];
} = { ready: true, isAdmin: true, perms: {}, modules: [], features: [] };

const allows = (perms: Record<string, Level>, isAdmin: boolean) => (m: string, level: Level = 'FULL') => {
  if (isAdmin) return true;
  const have = perms[m];
  if (!have) return false;
  return level === 'READ' ? true : have === 'FULL';
};

jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    ready: mockState.ready,
    can: (m: string, level?: 'READ' | 'FULL') => mockState.ready && allows(mockState.perms, mockState.isAdmin)(m, level),
    hasModule: (m: string) => mockState.ready && mockState.modules.includes(m),
    refresh: jest.fn(),
    entitlements: {
      isAdmin: mockState.isAdmin,
      permissions: mockState.perms,
      commerceFeatures: mockState.features,
    },
  }),
}));

const ALL_MODULES = ['BOOKINGS', 'ORDERS', 'INVOICING', 'CATALOG', 'PROMOTION'];

/** The pure gate, fed the way the component feeds it. */
function tilesFor(o: { ready?: boolean; isAdmin?: boolean; perms?: Record<string, Level>; modules?: string[]; features?: string[] }) {
  const ready = o.ready ?? true;
  const isAdmin = o.isAdmin ?? false;
  const perms = o.perms ?? {};
  const modules = o.modules ?? ALL_MODULES;
  const can = (m: string, level?: Level) => ready && allows(perms, isAdmin)(m, level);
  const hasModule = (m: string) => ready && modules.includes(m);
  const commerce = commerceAccessOf({ ready, isAdmin, permissions: perms, features: o.features ?? [], can, hasModule });
  return shortcutTilesFor({ ready, can, hasModule, commerce }).map((t) => t.key);
}

const c = themeColors(false);
const paper = (lang?: 'en' | 'hi') => renderScreen(<PaperProvider><TodayShortcutGrid c={c} /></PaperProvider>, { lang });

beforeEach(() => {
  mockState.ready = true;
  mockState.isAdmin = true;
  mockState.perms = {};
  mockState.modules = ALL_MODULES;
  mockState.features = [];
});

describe('Today shortcuts — gates', () => {
  it('the proprietor gets every tile, most-used first (Offers only once the feature is on)', () => {
    expect(tilesFor({ isAdmin: true, features: ['OFFERS', 'STOREFRONT'] })).toEqual([
      'NEW_BILL', 'RECORD_PAYMENT', 'ADD_PRODUCT', 'KHATA', 'ADD_EXPENSE', 'STOCK', 'PARTIES',
      'OFFERS', 'DAY_CLOSE', 'REPORTS', 'ONLINE_SHOP',
    ]);
    expect(tilesFor({ isAdmin: true })).not.toContain('OFFERS');
  });

  it('nothing at all until the entitlements answer lands (fail closed)', () => {
    expect(tilesFor({ ready: false, isAdmin: true })).toEqual([]);
  });

  it('a cashier (bills only) gets New invoice and Record a payment — plus the counter settings More already offers them', () => {
    // INVOICING_MANAGE FULL may change the counter section of the online-shop
    // settings, so More's "Online shop settings" door is theirs too.
    expect(tilesFor({ perms: { INVOICING_VIEW: 'READ', INVOICING_MANAGE: 'FULL' } })).toEqual(['NEW_BILL', 'RECORD_PAYMENT', 'ONLINE_SHOP']);
  });

  it('read-only billing is not offered the screens that would refuse it', () => {
    const keys = tilesFor({ perms: { INVOICING_VIEW: 'READ', INVOICING_MANAGE: 'READ', ACCOUNTS: 'READ' } });
    expect(keys).not.toContain('NEW_BILL');
    expect(keys).not.toContain('RECORD_PAYMENT');
    expect(keys).not.toContain('DAY_CLOSE');
  });

  it('a module that is off hides its tiles even for the proprietor; Parties needs no module', () => {
    const keys = tilesFor({ isAdmin: true, modules: ['BOOKINGS'] });
    expect(keys).toEqual(['PARTIES', 'REPORTS']);
  });

  it('catalogue: Add product needs CATALOG_MANAGE FULL; Stock needs STOCK_VIEW', () => {
    expect(tilesFor({ perms: { CATALOG_VIEW: 'READ' } })).toEqual([]);
    // (A catalogue manager may change the catalogue section of the online-shop settings.)
    expect(tilesFor({ perms: { CATALOG_VIEW: 'FULL', CATALOG_MANAGE: 'FULL', STOCK_VIEW: 'READ' } })).toEqual(['ADD_PRODUCT', 'STOCK', 'ONLINE_SHOP']);
    // A count-only role has no stock levels to open.
    expect(tilesFor({ perms: { STOCK_COUNT: 'FULL' } })).not.toContain('STOCK');
  });

  it('Khata needs INVOICING + CUSTOMERS; Parties needs CUSTOMERS alone', () => {
    expect(tilesFor({ perms: { CUSTOMERS: 'READ' } })).toEqual(['KHATA', 'PARTIES']);
    expect(tilesFor({ perms: { CUSTOMERS: 'READ' }, modules: ['ORDERS'] })).toEqual(['PARTIES']);
  });

  it('Add expense needs EXPENSES_MANAGE FULL and EXPENSES_VIEW', () => {
    expect(tilesFor({ perms: { EXPENSES_MANAGE: 'FULL' } })).not.toContain('ADD_EXPENSE');
    expect(tilesFor({ perms: { EXPENSES_VIEW: 'READ', EXPENSES_MANAGE: 'FULL' } })).toEqual(['ADD_EXPENSE']);
  });

  it('Offers follows the More door: feature on, CATALOG on, OFFERS_VIEW', () => {
    expect(tilesFor({ perms: { OFFERS_VIEW: 'READ' } })).not.toContain('OFFERS');
    expect(tilesFor({ perms: { OFFERS_VIEW: 'READ' }, features: ['OFFERS'] })).toEqual(['OFFERS']);
    expect(tilesFor({ perms: { OFFERS_VIEW: 'READ' }, features: ['OFFERS'], modules: ['ORDERS'] })).toEqual([]);
  });

  it('Online shop settings only for somebody who may open AND change a section', () => {
    // Can open the screen (ORDERS_VIEW) but change nothing → no tile.
    expect(tilesFor({ perms: { ORDERS_VIEW: 'READ' } })).not.toContain('ONLINE_SHOP');
    expect(tilesFor({ perms: { ORDERS_VIEW: 'READ', STOREFRONT_MANAGE: 'FULL' } })).toContain('ONLINE_SHOP');
  });

  it('every tile leads to a screen that exists in this app', () => {
    const tiles = (() => {
      const can = () => true;
      const hasModule = () => true;
      const commerce = commerceAccessOf({ ready: true, isAdmin: true, permissions: {}, features: ['OFFERS'], can, hasModule });
      return shortcutTilesFor({ ready: true, can, hasModule, commerce });
    })();
    const appDir = resolve(__dirname, '../../app/(app)');
    for (const t of tiles) {
      const path = String(t.href);
      const file = existsSync(resolve(appDir, `.${path}.tsx`)) || existsSync(resolve(appDir, `.${path}/index.tsx`));
      expect([path, file]).toEqual([path, true]);
    }
  });

  it('every label is in both catalogues, never empty', () => {
    const get = (o: unknown, k: string) => k.split('.').reduce<unknown>((a, p) => (a as Record<string, unknown> | undefined)?.[p], o);
    const can = () => true;
    const hasModule = () => true;
    const commerce = commerceAccessOf({ ready: true, isAdmin: true, permissions: {}, features: ['OFFERS'], can, hasModule });
    for (const k of [...shortcutTilesFor({ ready: true, can, hasModule, commerce }).map((t) => t.labelKey), 'today.shortcuts']) {
      expect(typeof get(en, k)).toBe('string');
      expect(typeof get(hi, k)).toBe('string');
      expect((get(hi, k) as string).length).toBeGreaterThan(0);
    }
  });
});

describe('Today shortcuts — the grid', () => {
  it('draws the heading and the tiles; a tap opens the destination', async () => {
    await paper();
    expect(screen.getByText('Shortcuts')).toBeTruthy();
    expect(screen.getByText(en.billing.list.newInvoice)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('today-shortcut-NEW_BILL'));
    expect(router.push).toHaveBeenCalledWith('/billing/new');
    await fireEvent.press(screen.getByTestId('today-shortcut-ADD_PRODUCT'));
    expect(router.push).toHaveBeenCalledWith('/catalog/create');
  });

  it('only the permitted tiles are drawn', async () => {
    mockState.isAdmin = false;
    mockState.perms = { INVOICING_VIEW: 'READ', INVOICING_MANAGE: 'FULL' };
    await paper();
    expect(screen.getByTestId('today-shortcut-NEW_BILL')).toBeTruthy();
    expect(screen.getByTestId('today-shortcut-RECORD_PAYMENT')).toBeTruthy();
    expect(screen.queryByTestId('today-shortcut-ADD_PRODUCT')).toBeNull();
    expect(screen.queryByTestId('today-shortcut-KHATA')).toBeNull();
    expect(screen.queryByTestId('today-shortcut-REPORTS')).toBeNull();
  });

  it('the whole section disappears when nothing qualifies', async () => {
    mockState.isAdmin = false;
    mockState.perms = { BOOKINGS_VIEW: 'READ' };
    await paper();
    expect(screen.queryByTestId('today-shortcuts')).toBeNull();
    expect(screen.queryByText('Shortcuts')).toBeNull();
  });

  it('and while entitlements are still loading', async () => {
    mockState.ready = false;
    await paper();
    expect(screen.queryByTestId('today-shortcuts')).toBeNull();
  });

  it('reads in Hindi', async () => {
    await paper('hi');
    expect(screen.getByText(hi.today.shortcuts)).toBeTruthy();
    expect(screen.getByText(hi.billing.list.newInvoice)).toBeTruthy();
    expect(screen.getByText(hi.money.dayClose)).toBeTruthy();
  });
});
// <<< SHORTCUTS
