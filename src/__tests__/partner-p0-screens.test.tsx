/**
 * Partner P0 screens with the api mocked (CONTRACT-partner-P0):
 *  - Team → Owners: owners, waiting invitations, handover history, last-owner
 *    guard, cancel, invite a co-owner → share link, handover warnings, coded refusals;
 *  - accepting an invitation by link (signed out) and by id (signed in);
 *  - Archive business: type-the-name, open work counts, then leave the business;
 *  - Stock history: signed rows, reversal chip, type filter, and paging.
 */
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import OwnersScreen from '../../app/(app)/owners/index';
import PartnerInviteLinkScreen from '../../app/partner-invite/[token]';
import MyInviteScreen from '../../app/(app)/invites/[id]';
import ArchiveBusinessScreen from '../../app/(app)/settings/archive';
import ProductStockHistoryScreen from '../../app/(app)/catalog/history/[id]';
import { useStockMovements } from '../features/catalog/stockMovements';
import { callsTo, fail, setRoutes } from './setup/mockApi';
import { router, setParams } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

// ── the signed-in person, as the screens read it
const mockAuth = {
  isAuthenticated: true,
  user: { name: 'Ravi', phone: '9876543210', email: 'ravi@shop.in' },
  profile: { role: 'PARTNER_ADMIN', tenantType: 'PARTNER', tenantId: 'p1', contextId: 'partner:p1', tenantName: 'Sharma Kirana' },
  availableContexts: [],
  leaveBusiness: jest.fn(async () => 'ended'),
  switchToContext: jest.fn(async () => undefined),
  logout: jest.fn(async () => undefined),
};
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({ can: () => true, hasModule: () => true }),
}));

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
/** Paper's outlined inputs, in screen order (the same helper auth-security.test uses). */
const field = (i: number) => screen.getAllByTestId('text-input-outlined')[i];
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(String(v)), s);
/** Paper buttons carry an icon glyph in their accessible name, so match the label inside it. */
const named = (label: string) => new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const pressAlertButton = async (label: string) => {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const buttons = calls[calls.length - 1][2] as { text: string; onPress?: () => void }[];
  await act(async () => { buttons.find((b) => b.text === label)!.onPress!(); });
};

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockAuth.isAuthenticated = true;
  mockAuth.profile.role = 'PARTNER_ADMIN';
});

// ───────────────────────────────────────────────────────── Team → Owners
const owner = (over: object = {}) => ({
  userId: 'u1', name: 'Ravi Sharma', phone: '9876543210', email: 'ravi@shop.in', isActive: true, isPrimary: true,
  since: '2026-01-10T00:00:00.000Z', ...over,
});
const invite = (over: object = {}) => ({
  id: 'inv1', partnerId: 'p1', kind: 'CO_ADMIN', status: 'PENDING', origin: 'PARTNER', toName: 'Asha Verma',
  toPhone: '9123456780', channel: 'PHONE', expiresAt: '2099-10-07T00:00:00.000Z', invitedByName: 'Ravi Sharma',
  createdAt: '2026-09-30T00:00:00.000Z', revokedCount: 0, ...over,
});
const teamRoutes = (admins: object[], invites: object[]) => ({
  'GET /partners/me/team': { success: true, data: { admins, invites } },
  'GET /partners/me/partner': { partner: { _id: 'p1', name: 'Sharma Kirana', adminEmail: 'ravi@shop.in', kind: 'SHOP', status: 'ACTIVE' } },
});

describe('Team → Owners', () => {
  it('lists owners, waiting invitations and the handover history with its cut-over', async () => {
    setRoutes(teamRoutes(
      [owner(), owner({ userId: 'u2', name: 'Meena Sharma', phone: '9000000001', email: 'meena@shop.in', isPrimary: false })],
      [
        invite(),
        invite({
          id: 'inv2', kind: 'TRANSFER', status: 'ACCEPTED', toName: 'Old Owner Handover', acceptedAt: '2026-05-01T00:00:00.000Z',
          revokedCount: 2,
          cutover: { at: '2026-05-01T00:00:00.000Z', gstinAtCutover: '08ABCDE1234F1Z5', note: 'Cut-over', lastNumbers: [{ series: 'INV', financialYear: '2026-27', number: 'INV/26-27/0042' }] },
        }),
      ],
    ));
    await paper(<OwnersScreen />);
    await waitFor(() => expect(screen.getByText('Meena Sharma')).toBeTruthy());
    expect(screen.getByText('Ravi Sharma')).toBeTruthy();
    expect(screen.getByText(en.owners.primary)).toBeTruthy();
    expect(screen.getByText(en.owners.you)).toBeTruthy();
    expect(screen.getByText('Asha Verma')).toBeTruthy();
    expect(screen.getByText(fill(en.owners.history.to, { name: 'Old Owner Handover' }))).toBeTruthy();
    expect(screen.getByText('08ABCDE1234F1Z5')).toBeTruthy();
    expect(screen.getByText('INV/26-27/0042')).toBeTruthy();
    // The admin email is read-only contact info, not an input.
    expect(screen.getByText(en.owners.contact.label)).toBeTruthy();
    expect(screen.getAllByText('ravi@shop.in').length).toBeGreaterThan(0);
    // The re-rented-shop sentence sits next to the handover button.
    expect(screen.getByText(en.owners.actions.rerent)).toBeTruthy();
  });

  it('the only owner gets the last-owner hint and no remove / leave button', async () => {
    setRoutes(teamRoutes([owner()], []));
    await paper(<OwnersScreen />);
    await waitFor(() => expect(screen.getByText(en.owners.lastOwnerHint)).toBeTruthy());
    expect(screen.queryByLabelText(en.owners.leave)).toBeNull();
  });

  it('a login that is not an owner reads PARTNER_OWNER_ONLY — in Hindi too', async () => {
    setRoutes({ 'GET /partners/me/team': fail(403, { code: 'PARTNER_OWNER_ONLY', error: 'server words' }) });
    await paper(<OwnersScreen />, 'hi');
    await waitFor(() => expect(screen.getByText(hi.errors.PARTNER_OWNER_ONLY)).toBeTruthy());
  });

  it('cancel an invitation after confirming', async () => {
    setRoutes({ ...teamRoutes([owner()], [invite()]), 'POST /partners/me/team/invites/inv1/cancel': { success: true, data: invite({ status: 'CANCELLED' }) } });
    await paper(<OwnersScreen />);
    await waitFor(() => expect(screen.getByText('Asha Verma')).toBeTruthy());
    await fireEvent.press(screen.getByText(en.owners.cancelInvite));
    await pressAlertButton(en.owners.cancelInvite);
    await waitFor(() => expect(callsTo('POST', '/partners/me/team/invites/inv1/cancel')).toHaveLength(1));
  });

  it('invite a co-owner: contact required, then the link is shown once to share', async () => {
    setRoutes({
      ...teamRoutes([owner()], []),
      'POST /partners/me/team/invites': { success: true, data: { invite: invite(), token: 'TOKEN123', invitePath: '/partner-invite/TOKEN123' } },
    });
    await paper(<OwnersScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: named(en.owners.actions.invite) })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.actions.invite) }));
    await fireEvent.changeText(field(0), 'Asha Verma');
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.form.sendInvite) }));
    expect(screen.getByText(en.errors.PARTNER_INVITE_CONTACT_REQUIRED)).toBeTruthy();
    expect(callsTo('POST', '/partners/me/team/invites')).toHaveLength(0);

    await fireEvent.changeText(field(2), '9123456780');
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.form.sendInvite) }));
    await waitFor(() => expect(screen.getByTestId('invite-link')).toBeTruthy());
    expect(callsTo('POST', '/partners/me/team/invites')[0].body).toEqual({ kind: 'CO_ADMIN', name: 'Asha Verma', phone: '9123456780' });
    expect(screen.getByTestId('invite-link')).toHaveTextContent(/partner-invite\/TOKEN123$/);
    expect(screen.getByText(en.owners.share.onceOnly)).toBeTruthy();
  });

  it('hand over: the warnings are shown, email is required, a server refusal is said in place', async () => {
    setRoutes({
      ...teamRoutes([owner()], []),
      'POST /partners/me/team/invites': fail(409, { code: 'PARTNER_TRANSFER_ALREADY_PENDING', error: 'server words' }),
    });
    await paper(<OwnersScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: named(en.owners.actions.transfer) })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.actions.transfer) }));
    expect(screen.getByText(en.owners.form.transferWarnAccess)).toBeTruthy();
    expect(screen.getByText(en.owners.form.transferWarnRerent)).toBeTruthy();
    expect(screen.getByText(en.owners.form.transferWarnGstin)).toBeTruthy();

    await fireEvent.changeText(field(0), 'New Owner');
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.form.sendTransfer) }));
    expect(screen.getByText(en.errors.PARTNER_INVITE_EMAIL_REQUIRED_FOR_TRANSFER)).toBeTruthy();

    await fireEvent.changeText(field(1), 'new@owner.in');
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.form.sendTransfer) }));
    await waitFor(() => expect(screen.getByText(en.errors.PARTNER_TRANSFER_ALREADY_PENDING)).toBeTruthy());
    expect(callsTo('POST', '/partners/me/team/invites')[0].body).toEqual({ kind: 'TRANSFER', name: 'New Owner', email: 'new@owner.in' });
  });
});

// ─────────────────────────────────────────────────── accept an invitation
const preview = (over: object = {}) => ({
  success: true,
  data: {
    id: 'inv1', kind: 'CO_ADMIN', status: 'PENDING', toName: 'Asha Verma', channel: 'PHONE', maskedContact: '+91 •••• ••780',
    invitedByName: 'Ravi Sharma', expiresAt: '2099-10-07T00:00:00.000Z', partner: { name: 'Sharma Kirana', slug: 'sharma', status: 'ACTIVE' },
    ...over,
  },
});
const accepted = { success: true, data: { invite: invite({ status: 'ACCEPTED' }), partnerId: 'p9', partnerName: 'Sharma Kirana', userId: 'u5', revokedCount: 0 } };

describe('Accept an owner invitation', () => {
  it('by link, signed out: preview → send code → accept → sign in', async () => {
    mockAuth.isAuthenticated = false;
    setParams({ token: 'TOK' });
    setRoutes({
      'GET /partner-invites/by-token/TOK': preview(),
      'POST /partner-invites/by-token/TOK/send-code': { success: true, data: { expiresInSec: 600, deliveredVia: 'whatsapp', maskedContact: '+91 •••• ••780' } },
      'POST /partner-invites/by-token/TOK/accept': accepted,
    });
    await paper(<PartnerInviteLinkScreen />);
    await waitFor(() => expect(screen.getByText(fill(en.owners.accept.headCoOwner, { business: 'Sharma Kirana' }))).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.accept.sendCode) }));
    await waitFor(() => expect(field(0)).toBeTruthy());
    expect(screen.getByText(fill(en.owners.accept.codeSentVia, { contact: '+91 •••• ••780', via: en.owners.accept.via.whatsapp }))).toBeTruthy();

    await fireEvent.changeText(field(0), '123456');
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.accept.accept) }));
    await waitFor(() => expect(screen.getByText(fill(en.owners.accept.doneCoOwner, { business: 'Sharma Kirana' }))).toBeTruthy());
    expect(callsTo('POST', '/partner-invites/by-token/TOK/accept')[0].body).toEqual({ code: '123456' });

    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.accept.signIn) }));
    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('a wrong code is said with the server\'s reason (PARTNER_INVITE_CODE_INVALID)', async () => {
    setParams({ token: 'TOK' });
    setRoutes({
      'GET /partner-invites/by-token/TOK': preview(),
      'POST /partner-invites/by-token/TOK/send-code': { success: true, data: { expiresInSec: 600, deliveredVia: null, maskedContact: 'x' } },
      'POST /partner-invites/by-token/TOK/accept': fail(400, { code: 'PARTNER_INVITE_CODE_INVALID', params: { reason: 'Code expired' } }),
    });
    await paper(<PartnerInviteLinkScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: named(en.owners.accept.sendCode) })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.accept.sendCode) }));
    await waitFor(() => expect(field(0)).toBeTruthy());
    await fireEvent.changeText(field(0), '0000');
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.accept.accept) }));
    await waitFor(() => expect(screen.getByText('That code did not work: Code expired')).toBeTruthy());
  });

  it('an expired invitation offers no code step', async () => {
    setParams({ token: 'OLD' });
    setRoutes({ 'GET /partner-invites/by-token/OLD': preview({ expiresAt: '2020-01-01T00:00:00.000Z' }) });
    await paper(<PartnerInviteLinkScreen />);
    await waitFor(() => expect(screen.getByText(en.errors.PARTNER_INVITE_EXPIRED)).toBeTruthy());
    expect(screen.queryByRole('button', { name: named(en.owners.accept.sendCode) })).toBeNull();
  });

  it('by id, signed in: after accepting, "Open the business" switches into it', async () => {
    setParams({ id: 'inv1' });
    setRoutes({
      'GET /partner-invites/inv1': preview({ kind: 'TRANSFER' }),
      'POST /partner-invites/inv1/send-code': { success: true, data: { expiresInSec: 600, deliveredVia: 'sms', maskedContact: 'x' } },
      'POST /partner-invites/inv1/accept': accepted,
    });
    await paper(<MyInviteScreen />);
    await waitFor(() => expect(screen.getByText(fill(en.owners.accept.headTransfer, { business: 'Sharma Kirana' }))).toBeTruthy());
    expect(screen.getByText(en.owners.accept.transferExplain)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.accept.sendCode) }));
    await waitFor(() => expect(field(0)).toBeTruthy());
    await fireEvent.changeText(field(0), '4321');
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.accept.accept) }));
    await waitFor(() => expect(screen.getByRole('button', { name: named(en.owners.accept.openBusiness) })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.accept.openBusiness) }));
    await waitFor(() => expect(mockAuth.switchToContext).toHaveBeenCalledWith('partner:p9'));
  });
});

// ─────────────────────────────────────────────────────────── archive
describe('Archive business', () => {
  const partnerMe = { 'GET /partners/me/partner': { partner: { _id: 'p1', name: 'Sharma Kirana', kind: 'SHOP', status: 'ACTIVE' } } };

  it('is locked until the reason and the business name are given', async () => {
    setRoutes(partnerMe);
    await paper(<ArchiveBusinessScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: named(en.archive.submit) })).toBeTruthy());
    expect(screen.getByRole('button', { name: named(en.archive.submit) })).toBeDisabled();
    await fireEvent.changeText(field(0), 'Closing the shop');
    await fireEvent.changeText(field(1), 'sharma');
    expect(screen.getByText(en.errors.PARTNER_ARCHIVE_CONFIRM_NAME)).toBeTruthy();
    await fireEvent.changeText(field(1), 'sharma kirana');
    expect(screen.getByRole('button', { name: named(en.archive.submit) })).toBeEnabled();
  });

  it('open bookings/orders block it, with the counts shown', async () => {
    setRoutes({ ...partnerMe, 'POST /partners/me/archive': fail(409, { code: 'PARTNER_ARCHIVE_OPEN_WORK', params: { bookings: 3, orders: 1 } }) });
    await paper(<ArchiveBusinessScreen />);
    await waitFor(() => expect(field(0)).toBeTruthy());
    await fireEvent.changeText(field(0), 'Closing the shop');
    await fireEvent.changeText(field(1), 'Sharma Kirana');
    await fireEvent.press(screen.getByRole('button', { name: named(en.archive.submit) }));
    await waitFor(() => expect(screen.getByTestId('archive-open-work')).toBeTruthy());
    expect(screen.getByText(fill(en.archive.openBookings_other, { count: 3 }))).toBeTruthy();
    expect(screen.getByText(fill(en.archive.openOrders_one, { count: 1 }))).toBeTruthy();
    expect(callsTo('POST', '/partners/me/archive')[0].body).toEqual({ reason: 'Closing the shop', confirmName: 'Sharma Kirana' });
    expect(mockAuth.leaveBusiness).not.toHaveBeenCalled();
  });

  it('after success the owner is taken out of the business', async () => {
    setRoutes({ ...partnerMe, 'POST /partners/me/archive': { success: true, message: 'Archived', data: { status: 'ARCHIVED' } } });
    await paper(<ArchiveBusinessScreen />);
    await waitFor(() => expect(field(0)).toBeTruthy());
    await fireEvent.changeText(field(0), 'Closing the shop');
    await fireEvent.changeText(field(1), 'Sharma Kirana');
    await fireEvent.press(screen.getByRole('button', { name: named(en.archive.submit) }));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    await pressAlertButton(en.common.ok);
    await waitFor(() => expect(mockAuth.leaveBusiness).toHaveBeenCalledWith('ARCHIVED'));
  });

  it('a staff session is told only an owner can archive', async () => {
    mockAuth.profile.role = 'PARTNER_STAFF';
    await paper(<ArchiveBusinessScreen />);
    expect(screen.getByText(en.errors.PARTNER_OWNER_ONLY)).toBeTruthy();
    expect(callsTo('GET', '/partners/me/partner')).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────── stock history
const move = (over: object = {}) => ({
  id: 'm1', productId: 'pr1', qty: -2, type: 'SALE', sourceType: 'DOCUMENT', sourceId: 'doc1', sourceRef: 'INV/0042',
  balanceAfter: 8, isReversal: false, createdByName: 'Ravi', createdAt: '2026-09-29T09:30:00.000Z', ...over,
});

describe('Stock history', () => {
  const url = '/partners/me/products/pr1/stock-movements';

  it('shows signed quantities, balance, the Cancelled chip and opens the bill', async () => {
    setParams({ id: 'pr1', name: 'Tea 250g' });
    setRoutes({
      [`GET ${url}`]: {
        success: true, product: { _id: 'pr1', name: 'Tea 250g', stockQty: 10, trackStock: true, unit: 'PCS' },
        data: [move(), move({ id: 'm2', qty: 2, isReversal: true, reason: 'Cancelled Invoice INV/0042', balanceAfter: 10 })],
        page: 1, limit: 30, total: 2,
      },
    });
    await paper(<ProductStockHistoryScreen />);
    await waitFor(() => expect(screen.getByText('−2')).toBeTruthy());
    expect(screen.getByText('+2')).toBeTruthy();
    expect(screen.getByText(fill(en.stockHistory.balanceAfter, { balance: 8 }))).toBeTruthy();
    expect(screen.getByText(en.stockHistory.cancelled)).toBeTruthy();
    expect(screen.getAllByText(en.stockHistory.type.SALE).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getAllByText('INV/0042')[0]);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/billing/[id]', params: { id: 'doc1' } });
  });

  it('the type filter is sent to the server', async () => {
    setParams({ id: 'pr1' });
    setRoutes({ [`GET ${url}`]: { success: true, data: [move()], page: 1, limit: 30, total: 1 } });
    await paper(<ProductStockHistoryScreen />);
    await waitFor(() => expect(screen.getByText('−2')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: en.stockHistory.type.PURCHASE }));
    await waitFor(() => expect(callsTo('GET', url).some((c) => (c.params as { type?: string }).type === 'PURCHASE')).toBe(true));
  });

  it('an empty ledger explains where history starts, in Hindi too', async () => {
    setParams({ id: 'pr1' });
    setRoutes({ [`GET ${url}`]: { success: true, data: [], page: 1, limit: 30, total: 0 } });
    await paper(<ProductStockHistoryScreen />, 'hi');
    await waitFor(() => expect(screen.getByText(hi.stockHistory.emptyTitle)).toBeTruthy());
  });

  it('pages through the shop-wide ledger until total is covered', async () => {
    setRoutes({}, [[
      'GET', /\/partners\/me\/products\/stock-movements$/,
      (call: { params?: unknown }) => {
        const page = (call.params as { page: number }).page;
        return { success: true, data: [move({ id: `m${page}` })], page, limit: 1, total: 2 };
      },
    ]]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = await renderHook(() => useStockMovements('shop', {}), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => { await result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
    expect(callsTo('GET', '/partners/me/products/stock-movements').map((c) => (c.params as { page: number }).page)).toEqual([1, 2]);
    await unmount();
    client.clear();
  });
});
