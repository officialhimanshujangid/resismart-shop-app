/**
 * Partner P3 screens with the api mocked (CONTRACT-partner-P3 §7.2, §7.3, §11):
 *  - the society invitation link: preview → code → accept → normal phone sign-in,
 *    and the generic dead-link sentence (expired / withdrawn / used);
 *  - "Who can find you": KYC lock + route to verification, save, refusals,
 *    "Lives here" consent, staff read-only, independents;
 *  - the home-society banner (approved / removed).
 */
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import SocietyInviteLinkScreen from '../../app/society-invite/[token]';
import ReachScreen from '../../app/(app)/settings/reach';
import { HomeSocietyBanner } from '../features/society/components/HomeSocietyBanner';
import { themeColors } from '../constants/colors';
import { callsTo, fail, setRoutes } from './setup/mockApi';
import { router, setParams } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const mockAuth = {
  isAuthenticated: false,
  user: { name: 'Asha', phone: '9812345678' },
  profile: { role: 'PARTNER_ADMIN', tenantType: 'PARTNER', tenantId: 'p9', contextId: 'partner:p9', tenantName: 'Asha Tailors' },
  availableContexts: [],
  switchToContext: jest.fn(async () => undefined),
  requestLoginOtp: jest.fn(async () => ({
    success: true,
    delivery: { message: 'Code sent on WhatsApp', deliveredVia: 'whatsapp', alternatives: ['sms'], whatsappAvailable: true },
  })),
};
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }));

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const field = (i: number) => screen.getAllByTestId('text-input-outlined')[i];
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(String(v)), s);
const named = (label: string) => new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockAuth.isAuthenticated = false;
  mockAuth.profile.role = 'PARTNER_ADMIN';
});

// ───────────────────────────────────────────── the society invitation link
const TOKEN = 'T'.repeat(43);
const base = `/society-partner-invites/${TOKEN}`;
const preview = (over: object = {}) => ({
  success: true,
  data: {
    societyName: 'Green Park', societyCity: 'Jaipur', businessName: 'Asha Tailors', kind: 'SERVICE',
    operatorName: 'Asha Verma', phoneMasked: '•••••45678', hasEmail: false, expiresAt: '2099-10-07T00:00:00.000Z', ...over,
  },
});
const otp = { success: true, data: { phoneMasked: '•••••45678', expiresInSec: 600, deliveredVia: 'whatsapp' } };
const accepted = { success: true, data: { partnerId: 'p9', slug: 'asha-tailors', partnerName: 'Asha Tailors', loginPhoneMasked: '•••••45678' } };

async function openAndSendCode(routes: Record<string, unknown>, lang?: 'en' | 'hi') {
  setParams({ token: TOKEN });
  setRoutes({ [`GET ${base}`]: preview(), [`POST ${base}/otp`]: otp, ...routes });
  await paper(<SocietyInviteLinkScreen />, lang);
  await waitFor(() => expect(screen.getByText(fill(en.society.invite.head, { society: 'Green Park', business: 'Asha Tailors' }))).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: named(en.society.invite.sendCode) }));
  await waitFor(() => expect(field(0)).toBeTruthy());
}

describe('Society invitation link', () => {
  it('signed out: preview → code → accept (email asked, terms ticked) → phone sign-in hand-off', async () => {
    await openAndSendCode({ [`POST ${base}/accept`]: accepted });
    expect(screen.getByText(fill(en.society.invite.codeSentVia, { phone: '•••••45678', via: en.owners.accept.via.whatsapp }))).toBeTruthy();
    expect(callsTo('POST', `${base}/otp`)[0].body).toEqual({ via: 'auto' });

    await fireEvent.changeText(field(0), '123456');
    await fireEvent.changeText(field(2), 'Asha@Shop.in');
    // Terms not ticked yet → nothing is sent.
    await fireEvent.press(screen.getByRole('button', { name: named(en.society.invite.accept) }));
    expect(screen.getByText(en.society.invite.termsNeeded)).toBeTruthy();
    expect(callsTo('POST', `${base}/accept`)).toHaveLength(0);

    await fireEvent.press(screen.getByText(en.society.invite.terms));
    await fireEvent(screen.getByLabelText(en.society.invite.badge), 'valueChange', true);
    await fireEvent.press(screen.getByRole('button', { name: named(en.society.invite.accept) }));
    await waitFor(() => expect(screen.getByText(fill(en.society.invite.doneTitle, { business: 'Asha Tailors' }))).toBeTruthy());
    expect(callsTo('POST', `${base}/accept`)[0].body).toEqual({
      code: '123456', email: 'asha@shop.in', acceptTerms: true, showLivesHereBadge: true,
    });

    // The normal phone-OTP sign-in: the number must end in the masked digits.
    await fireEvent.changeText(field(0), '9812345670');
    await fireEvent.press(screen.getByRole('button', { name: named(en.society.invite.sendSignInCode) }));
    expect(screen.getByText(fill(en.society.invite.phoneMismatch, { phone: '•••••45678' }))).toBeTruthy();
    expect(mockAuth.requestLoginOtp).not.toHaveBeenCalled();

    await fireEvent.changeText(field(0), '+91 98123 45678');
    await fireEvent.press(screen.getByRole('button', { name: named(en.society.invite.sendSignInCode) }));
    await waitFor(() => expect(mockAuth.requestLoginOtp).toHaveBeenCalledWith('9812345678'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(auth)/verify-otp',
      params: { identifier: '9812345678', message: 'Code sent on WhatsApp', deliveredVia: 'whatsapp', alternatives: 'sms', whatsappAvailable: '1' },
    });
  });

  it('an office-given email is not asked again; "Sign in another way" goes to login', async () => {
    setParams({ token: TOKEN });
    setRoutes({ [`GET ${base}`]: preview({ hasEmail: true, hasFlat: false }), [`POST ${base}/otp`]: otp, [`POST ${base}/accept`]: accepted });
    await paper(<SocietyInviteLinkScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: named(en.society.invite.sendCode) })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: named(en.society.invite.sendCode) }));
    await waitFor(() => expect(field(0)).toBeTruthy());
    expect(screen.getAllByTestId('text-input-outlined')).toHaveLength(2); // code + name, no email
    expect(screen.queryByText(en.society.invite.badge)).toBeNull(); // hasFlat: false
    await fireEvent.changeText(field(0), '654321');
    await fireEvent.changeText(field(1), 'Asha V');
    await fireEvent.press(screen.getByText(en.society.invite.terms));
    await fireEvent.press(screen.getByRole('button', { name: named(en.society.invite.accept) }));
    await waitFor(() => expect(callsTo('POST', `${base}/accept`)).toHaveLength(1));
    expect(callsTo('POST', `${base}/accept`)[0].body).toEqual({ code: '654321', name: 'Asha V', acceptTerms: true, showLivesHereBadge: false });
    await waitFor(() => expect(screen.getByRole('button', { name: named(en.society.invite.otherWay) })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: named(en.society.invite.otherWay) }));
    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('expired / withdrawn / used links read one generic sentence, no code step — in Hindi too', async () => {
    setParams({ token: TOKEN });
    setRoutes({ [`GET ${base}`]: fail(404, { code: 'SOCIETY_INVITE_NOT_FOUND', error: 'server words' }) });
    await paper(<SocietyInviteLinkScreen />, 'hi');
    await waitFor(() => expect(screen.getByText(hi.errors.SOCIETY_INVITE_NOT_FOUND)).toBeTruthy());
    expect(screen.getByText(hi.society.invite.deadTitle)).toBeTruthy();
    expect(screen.queryByText(hi.society.invite.sendCode)).toBeNull();
    expect(screen.queryByText(hi.common.tryAgain)).toBeNull();
  });

  it('a wrong code is said with the server\'s reason', async () => {
    await openAndSendCode({ [`POST ${base}/accept`]: fail(400, { code: 'SOCIETY_INVITE_CODE_INVALID', params: { reason: 'Code expired' } }) });
    await fireEvent.changeText(field(0), '000000');
    await fireEvent.changeText(field(2), 'a@b.in');
    await fireEvent.press(screen.getByText(en.society.invite.terms));
    await fireEvent.press(screen.getByRole('button', { name: named(en.society.invite.accept) }));
    await waitFor(() => expect(screen.getByText(fill(en.errors.SOCIETY_INVITE_CODE_INVALID, { reason: 'Code expired' }))).toBeTruthy());
    // Still on the form — the code can be retried.
    expect(screen.getByRole('button', { name: named(en.society.invite.accept) })).toBeTruthy();
  });

  it('used in the meantime / society full → the form is gone, the sentence stays', async () => {
    await openAndSendCode({ [`POST ${base}/accept`]: fail(409, { code: 'SOCIETY_INVITE_SOCIETY_FULL' }) });
    await fireEvent.changeText(field(0), '123456');
    await fireEvent.changeText(field(2), 'a@b.in');
    await fireEvent.press(screen.getByText(en.society.invite.terms));
    await fireEvent.press(screen.getByRole('button', { name: named(en.society.invite.accept) }));
    await waitFor(() => expect(screen.getByText(en.errors.SOCIETY_INVITE_SOCIETY_FULL)).toBeTruthy());
    expect(screen.queryByRole('button', { name: named(en.society.invite.accept) })).toBeNull();
  });

  it('signed in already: "Open the business" switches into the new one', async () => {
    mockAuth.isAuthenticated = true;
    await openAndSendCode({ [`POST ${base}/accept`]: accepted });
    await fireEvent.changeText(field(0), '123456');
    await fireEvent.changeText(field(2), 'a@b.in');
    await fireEvent.press(screen.getByText(en.society.invite.terms));
    await fireEvent.press(screen.getByRole('button', { name: named(en.society.invite.accept) }));
    await waitFor(() => expect(screen.getByRole('button', { name: named(en.owners.accept.openBusiness) })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: named(en.owners.accept.openBusiness) }));
    await waitFor(() => expect(mockAuth.switchToContext).toHaveBeenCalledWith('partner:p9'));
    expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)');
  });
});

// ─────────────────────────────────────────────────── Who can find you
const myReach = (over: object = {}) => ({
  success: true,
  data: {
    origin: 'SOCIETY', reach: 'SOCIETY_ONLY', homeSociety: { id: 's1', name: 'Green Park' },
    societyApproval: { status: 'APPROVED', approvedAt: '2026-09-30T00:00:00.000Z' }, verificationStatus: 'UNSUBMITTED',
    showLivesHereBadge: false, homeFlatLabel: 'B-204', canWiden: false, nearbyKm: 3, ...over,
  },
});

describe('Who can find you', () => {
  it('unverified: the two wider options are locked and lead to verification', async () => {
    setRoutes({ 'GET /partners/me/reach': myReach() });
    await paper(<ReachScreen />);
    await waitFor(() => expect(screen.getByText(en.society.reach.option.PUBLIC.title)).toBeTruthy());
    expect(screen.getAllByText(en.society.reach.needsKyc)).toHaveLength(2);
    expect(screen.getByText(en.society.reach.current)).toBeTruthy();
    expect(screen.getByText(fill(en.society.reach.option.SOCIETY_AND_NEARBY.body, { society: 'Green Park', km: 3 }))).toBeTruthy();
    expect(screen.getByText(en.errors.REACH_NEEDS_KYC)).toBeTruthy();
    // A locked option does not select; Save stays off.
    await fireEvent.press(screen.getByTestId('reach-option-PUBLIC'));
    expect(screen.getByRole('button', { name: en.common.save })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: named(en.society.reach.goVerify) }));
    expect(router.push).toHaveBeenCalledWith('/settings/verification');
  });

  it('verified: choose everyone, save, and the server answer is shown', async () => {
    setRoutes({
      'GET /partners/me/reach': myReach({ verificationStatus: 'VERIFIED', canWiden: true }),
      'PUT /partners/me/reach': myReach({ verificationStatus: 'VERIFIED', canWiden: true, reach: 'PUBLIC' }),
    });
    await paper(<ReachScreen />);
    await waitFor(() => expect(screen.getByTestId('reach-option-PUBLIC')).toBeTruthy());
    expect(screen.queryByText(en.society.reach.needsKyc)).toBeNull();
    await fireEvent.press(screen.getByTestId('reach-option-PUBLIC'));
    // P8A: the same "unsaved" hint as the web until Save is pressed; nothing is sent before.
    expect(screen.getByTestId('reach-unsaved')).toBeTruthy();
    expect(callsTo('PUT', '/partners/me/reach')).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: en.common.save }));
    await waitFor(() => expect(screen.getByText(en.society.reach.saved)).toBeTruthy());
    expect(screen.getByTestId('reach-saved', { includeHiddenElements: true })).toBeTruthy(); // decorative (hidden from a11y)
    expect(screen.queryByTestId('reach-unsaved')).toBeNull();
    expect(callsTo('PUT', '/partners/me/reach')[0].body).toEqual({ reach: 'PUBLIC' });
  });

  it('REACH_NEEDS_KYC from the server is said in place with the way to verification', async () => {
    setRoutes({
      'GET /partners/me/reach': myReach({ verificationStatus: 'VERIFIED' }),
      'PUT /partners/me/reach': fail(409, { code: 'REACH_NEEDS_KYC', href: '/dashboard/partner/verification' }),
    });
    await paper(<ReachScreen />);
    await waitFor(() => expect(screen.getByTestId('reach-option-SOCIETY_AND_NEARBY')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('reach-option-SOCIETY_AND_NEARBY'));
    await fireEvent.press(screen.getByRole('button', { name: en.common.save }));
    await waitFor(() => expect(screen.getByText(en.errors.REACH_NEEDS_KYC)).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: named(en.society.reach.goVerify) }));
    expect(router.push).toHaveBeenCalledWith('/settings/verification');
  });

  it('"Lives here" consent: on with a linked flat; off and explained without one', async () => {
    setRoutes({
      'GET /partners/me/reach': myReach(),
      'PUT /partners/me/reach/lives-here-badge': myReach({ showLivesHereBadge: true }),
    });
    await paper(<ReachScreen />);
    await waitFor(() => expect(screen.getByText(fill(en.society.reach.badgeTitle, { flat: 'B-204' }))).toBeTruthy());
    await fireEvent(screen.getByTestId('lives-here-switch'), 'valueChange', true);
    await waitFor(() => expect(callsTo('PUT', '/partners/me/reach/lives-here-badge')).toHaveLength(1));
    expect(callsTo('PUT', '/partners/me/reach/lives-here-badge')[0].body).toEqual({ show: true });
  });

  it('no linked flat: the switch is off and LIVES_HERE_NEEDS_FLAT is shown', async () => {
    setRoutes({ 'GET /partners/me/reach': myReach({ homeFlatLabel: undefined }) });
    await paper(<ReachScreen />);
    await waitFor(() => expect(screen.getByText(en.errors.LIVES_HERE_NEEDS_FLAT)).toBeTruthy());
    expect(screen.getByTestId('lives-here-switch').props.disabled).toBe(true);
  });

  it('staff read it but cannot change it; Hindi', async () => {
    mockAuth.profile.role = 'PARTNER_STAFF';
    setRoutes({ 'GET /partners/me/reach': myReach({ verificationStatus: 'VERIFIED' }) });
    await paper(<ReachScreen />, 'hi');
    await waitFor(() => expect(screen.getByText(hi.society.reach.ownerOnly)).toBeTruthy());
    expect(screen.getByText(hi.society.reach.option.SOCIETY_ONLY.title)).toBeTruthy();
    expect(screen.queryByRole('button', { name: hi.common.save })).toBeNull();
  });

  it('P8A: staff get "has a flat" without the owner\'s flat label — no "needs your flat" sentence, no flat shown', async () => {
    mockAuth.profile.role = 'PARTNER_STAFF';
    setRoutes({ 'GET /partners/me/reach': myReach({ homeFlatLabel: undefined, hasHomeFlat: true }) });
    await paper(<ReachScreen />);
    await waitFor(() => expect(screen.getByText(en.society.reach.badgeTitleNoFlat)).toBeTruthy());
    expect(screen.queryByText(en.errors.LIVES_HERE_NEEDS_FLAT)).toBeNull();
    expect(screen.queryByText(/B-204/)).toBeNull();
    expect(screen.getByTestId('lives-here-switch').props.disabled).toBe(true);
  });

  it('an independent business is told there is nothing to choose', async () => {
    setRoutes({ 'GET /partners/me/reach': { success: true, data: { origin: 'INDEPENDENT', reach: 'PUBLIC', verificationStatus: 'VERIFIED', canWiden: false } } });
    await paper(<ReachScreen />);
    await waitFor(() => expect(screen.getByTestId('reach-independent')).toBeTruthy());
    expect(screen.queryByTestId('reach-option-PUBLIC')).toBeNull();
  });
});

// ─────────────────────────────────────────────────── home-society banner
describe('Home-society banner', () => {
  const c = themeColors(false);
  const r = myReach().data as never;

  it('approved: society, who finds you, and the way to change it', async () => {
    await paper(<HomeSocietyBanner c={c} reach={r} canManage />);
    expect(screen.getByText(fill(en.society.banner.approvedTitle, { society: 'Green Park' }))).toBeTruthy();
    expect(screen.getByText(fill(en.society.banner.approvedBody.SOCIETY_ONLY, { society: 'Green Park' }))).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: named(en.society.reach.title) }));
    expect(router.push).toHaveBeenCalledWith('/settings/reach');
  });

  it('removed: the date and the reason, in Hindi; no button without SETTINGS', async () => {
    const removed = myReach({ societyApproval: { status: 'REVOKED', revokedAt: '2026-10-01T00:00:00.000Z', revokedReason: 'Shop closed' } }).data as never;
    await paper(<HomeSocietyBanner c={c} reach={removed} canManage={false} />, 'hi');
    expect(screen.getByText(hi.society.banner.removedTitle)).toBeTruthy();
    expect(screen.getByText(/Shop closed/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('an independent draws nothing', async () => {
    await paper(<HomeSocietyBanner c={c} reach={{ origin: 'INDEPENDENT', reach: 'PUBLIC', verificationStatus: 'VERIFIED', canWiden: false }} canManage />);
    expect(screen.queryByTestId('home-society-banner')).toBeNull();
  });
});
