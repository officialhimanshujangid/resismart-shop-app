/**
 * Partner P0 (CONTRACT-partner-P0) — the pure rules behind Team → Owners,
 * archive and the stock ledger, plus the coded-error sentences in en + hi.
 */
import i18n from 'i18next';

import {
  archiveNameMatches, canRemoveOwner, hasPendingTransfer, inviteLink, shownStatus, splitInvites,
  validateInviteForm, whatsappShareUrl,
} from '../features/owners/logic';
import type { AdminView, InviteView } from '../features/owners/types';
import { invitePath } from '../features/owners/api';
import { nextStockPage, signedQty, stockMovementParams } from '../features/catalog/stockMovements';
import { apiErrorMessage } from '../api/axios';
import { WEB_PANEL_URL } from '../constants/app';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const NOW = new Date('2026-09-30T10:00:00.000Z').getTime();
const inv = (over: Partial<InviteView>): InviteView => ({
  id: 'i1', partnerId: 'p1', kind: 'CO_ADMIN', status: 'PENDING', origin: 'PARTNER', toName: 'Asha',
  channel: 'PHONE', expiresAt: '2026-10-05T00:00:00.000Z', invitedByName: 'Ravi',
  createdAt: '2026-09-29T00:00:00.000Z', revokedCount: 0, ...over,
});
const admin = (over: Partial<AdminView>): AdminView => ({
  userId: 'u1', name: 'Ravi', isActive: true, isPrimary: true, since: '2026-01-01T00:00:00.000Z', ...over,
});

/** A rejected axios call, the shape `apiErrorMessage` reads. */
const axiosFail = (status: number, data: unknown) =>
  Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status, data } });

describe('owners logic', () => {
  it('a pending invite past expiry reads EXPIRED; others keep their status', () => {
    expect(shownStatus(inv({ expiresAt: '2026-09-01T00:00:00.000Z' }), NOW)).toBe('EXPIRED');
    expect(shownStatus(inv({}), NOW)).toBe('PENDING');
    expect(shownStatus(inv({ status: 'CANCELLED' }), NOW)).toBe('CANCELLED');
  });

  it('splits invites into waiting / closed / accepted handovers', () => {
    const s = splitInvites([
      inv({ id: 'a' }),
      inv({ id: 'b', status: 'DECLINED' }),
      inv({ id: 'c', kind: 'TRANSFER', status: 'ACCEPTED' }),
      inv({ id: 'd', expiresAt: '2026-09-01T00:00:00.000Z' }),
    ], NOW);
    expect(s.pending.map((i) => i.id)).toEqual(['a']);
    expect(s.closed.map((i) => i.id)).toEqual(['b', 'c', 'd']);
    expect(s.handovers.map((i) => i.id)).toEqual(['c']);
  });

  it('knows when a handover is already waiting', () => {
    expect(hasPendingTransfer([inv({ kind: 'TRANSFER' })], NOW)).toBe(true);
    expect(hasPendingTransfer([inv({ kind: 'TRANSFER', status: 'CANCELLED' }), inv({})], NOW)).toBe(false);
  });

  it('the last owner cannot be removed', () => {
    expect(canRemoveOwner([admin({})])).toBe(false);
    expect(canRemoveOwner([admin({}), admin({ userId: 'u2', isPrimary: false })])).toBe(true);
  });

  it('validates the invite form like the server schema', () => {
    const blank = { name: '', phone: '', email: '', note: '' };
    expect(validateInviteForm('CO_ADMIN', blank)).toEqual({
      name: 'owners.form.errName', contact: 'errors.PARTNER_INVITE_CONTACT_REQUIRED',
    });
    expect(validateInviteForm('CO_ADMIN', { ...blank, name: 'Asha', phone: '98765 43210' })).toEqual({});
    // A handover needs an email even when a phone is given.
    expect(validateInviteForm('TRANSFER', { ...blank, name: 'Asha', phone: '9876543210' }).email)
      .toBe('errors.PARTNER_INVITE_EMAIL_REQUIRED_FOR_TRANSFER');
    expect(validateInviteForm('TRANSFER', { ...blank, name: 'Asha', email: 'a@b.in' })).toEqual({});
    expect(validateInviteForm('CO_ADMIN', { ...blank, name: 'Asha', email: 'nope' }).email).toBe('owners.form.errEmail');
    expect(validateInviteForm('CO_ADMIN', { ...blank, name: 'Asha', email: 'a@b.in', note: 'x'.repeat(301) }).note)
      .toBe('owners.form.errNote');
  });

  it('builds the share link and a WhatsApp link addressed to an Indian mobile', () => {
    expect(inviteLink('tok/1')).toBe(`${WEB_PANEL_URL}/partner-invite/tok%2F1`);
    expect(whatsappShareUrl('hi there', '98765 43210')).toBe('https://wa.me/919876543210?text=hi%20there');
    expect(whatsappShareUrl('hi', undefined)).toBe('https://wa.me/?text=hi');
  });

  it('addresses an invitation by token or by id', () => {
    expect(invitePath({ token: 'abc' })).toBe('/partner-invites/by-token/abc');
    expect(invitePath({ id: 'x1' })).toBe('/partner-invites/x1');
  });

  it('archive confirmation compares the name case-insensitively', () => {
    expect(archiveNameMatches('Sharma Kirana', '  sharma kirana ')).toBe(true);
    expect(archiveNameMatches('Sharma Kirana', 'Sharma')).toBe(false);
    expect(archiveNameMatches('', '')).toBe(false);
  });
});

describe('stock ledger logic', () => {
  it('sends from/to as whole local days, and only the filters that are set', () => {
    const p = stockMovementParams({ type: 'SALE', from: '2026-09-01', to: '2026-09-30' }, 2);
    expect(p.type).toBe('SALE');
    expect(p.page).toBe(2);
    expect(new Date(p.from!).getHours()).toBe(0);
    expect(new Date(p.to!).getHours()).toBe(23);
    expect(new Date(p.to!).getDate()).toBe(30);
    expect(stockMovementParams({}, 1)).toEqual({ type: undefined, from: undefined, to: undefined, page: 1, limit: 30 });
  });

  it('asks for the next page only while total is not covered', () => {
    expect(nextStockPage({ data: [{} as never], page: 1, limit: 30, total: 31 })).toBe(2);
    expect(nextStockPage({ data: [{} as never], page: 2, limit: 30, total: 31 })).toBeUndefined();
    expect(nextStockPage({ data: [], page: 1, limit: 30, total: 99 })).toBeUndefined();
  });

  it('signs quantities with a real minus', () => {
    expect(signedQty(5)).toBe('+5');
    expect(signedQty(-3)).toBe('−3');
    expect(signedQty(0)).toBe('0');
  });
});

describe('P0 coded errors — en + hi', () => {
  afterEach(async () => { await i18n.changeLanguage('en'); });

  it('every new code is in both catalogues', () => {
    const codes = [
      'PARTNER_ADMIN_EMAIL_USE_HANDOVER', 'PARTNER_OWNER_ONLY', 'PARTNER_INVITE_CONTACT_REQUIRED',
      'PARTNER_INVITE_EMAIL_REQUIRED_FOR_TRANSFER', 'PARTNER_INVITE_ALREADY_ADMIN', 'PARTNER_INVITE_ALREADY_PENDING',
      'PARTNER_TRANSFER_ALREADY_PENDING', 'PARTNER_INVITE_NOT_FOUND', 'PARTNER_INVITE_NOT_PENDING', 'PARTNER_INVITE_EXPIRED',
      'PARTNER_INVITE_CODE_INVALID', 'PARTNER_INVITE_NOT_FOR_YOU', 'PARTNER_LAST_ADMIN', 'PARTNER_ADMIN_NOT_FOUND',
      'PARTNER_ARCHIVED', 'PARTNER_ALREADY_ARCHIVED', 'PARTNER_NOT_ARCHIVED', 'PARTNER_ARCHIVE_CONFIRM_NAME',
      'PARTNER_ARCHIVE_REASON_REQUIRED', 'PARTNER_ARCHIVE_OPEN_WORK',
    ] as const;
    for (const code of codes) {
      expect((en.errors as Record<string, string>)[code]).toBeTruthy();
      expect((hi.errors as Record<string, string>)[code]).toBeTruthy();
    }
  });

  it('PARTNER_ARCHIVE_OPEN_WORK fills its counts, in Hindi too', async () => {
    const err = axiosFail(409, { code: 'PARTNER_ARCHIVE_OPEN_WORK', params: { bookings: 2, orders: 1 }, error: 'server' });
    expect(apiErrorMessage(err)).toBe(
      'There are 2 open bookings and 1 open orders. Finish or cancel them before archiving the business.',
    );
    await i18n.changeLanguage('hi');
    expect(apiErrorMessage(err)).toBe(hi.errors.PARTNER_ARCHIVE_OPEN_WORK.replace('{{bookings}}', '2').replace('{{orders}}', '1'));
  });

  it('PARTNER_INVITE_NOT_PENDING puts the status word into the reader\'s language', async () => {
    const err = axiosFail(409, { code: 'PARTNER_INVITE_NOT_PENDING', params: { statusText: 'cancelled', status: 'CANCELLED' } });
    expect(apiErrorMessage(err)).toBe('This invitation is cancelled and can no longer be used.');
    await i18n.changeLanguage('hi');
    expect(apiErrorMessage(err)).toContain('रद्द हो चुका');
  });

  it('an uncoded 4xx shows the server text; a 5xx shows the generic line', () => {
    expect(apiErrorMessage(axiosFail(409, { error: 'That login is disabled.' }))).toBe('That login is disabled.');
    expect(apiErrorMessage(axiosFail(500, { error: 'TypeError: x is undefined' }))).toBe(en.common.somethingWentWrong);
  });
});
