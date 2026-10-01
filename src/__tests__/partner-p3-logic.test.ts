/**
 * CONTRACT-partner-P3 (shop app) — the pure rules behind the society-invite,
 * reach and home-society screens, and the new blocker route.
 */
import { blockerFix } from '../api/partner.api';
import { societyInvitePath } from '../features/society/api';
import {
  DEAD_INVITE_CODES, homeBannerOf, isEmail, isSocietyPartner, loginPhone, needsKyc, phoneMatchesMask, reachOptionState,
} from '../features/society/logic';
import type { MyReach } from '../features/society/types';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const reach = (over: Partial<MyReach> = {}): MyReach => ({
  origin: 'SOCIETY', reach: 'SOCIETY_ONLY', verificationStatus: 'UNSUBMITTED', canWiden: false,
  homeSociety: { id: 's1', name: 'Green Park' }, societyApproval: { status: 'APPROVED', approvedAt: '2026-09-30T00:00:00.000Z' },
  nearbyKm: 3, ...over,
});

describe('society invite paths and codes', () => {
  it('uses the society-partner-invites family, never P0\'s partner-invites', () => {
    expect(societyInvitePath('abc_-DEF')).toBe('/society-partner-invites/abc_-DEF');
    expect(societyInvitePath('a/b')).toBe('/society-partner-invites/a%2Fb');
  });
  it('the three refusals that finish a link', () => {
    expect([...DEAD_INVITE_CODES].sort()).toEqual(['SOCIETY_INVITE_ALREADY_USED', 'SOCIETY_INVITE_NOT_FOUND', 'SOCIETY_INVITE_SOCIETY_FULL']);
  });
  it('email check', () => {
    expect(isEmail(' shop@x.in ')).toBe(true);
    expect(isEmail('shop@x')).toBe(false);
  });
});

describe('phoneMatchesMask — the sign-in hand-off', () => {
  it('accepts the number whose tail the mask shows, with or without +91', () => {
    expect(phoneMatchesMask('9812345678', '•••••45678')).toBe(true);
    expect(phoneMatchesMask('+91 98123 45678', '•••••45678')).toBe(true);
    expect(loginPhone('+91 98123 45678')).toBe('9812345678');
  });
  it('refuses another number, a short one, or a non-mobile', () => {
    expect(phoneMatchesMask('9812345670', '•••••45678')).toBe(false);
    expect(phoneMatchesMask('98123', '•••••45678')).toBe(false);
    expect(phoneMatchesMask('1812345678', '')).toBe(false);
  });
  it('a mask with no digits proves nothing and is not held against the person', () => {
    expect(phoneMatchesMask('9812345678', '••••••••••')).toBe(true);
  });
});

describe('reach options', () => {
  it('widening needs KYC; narrowing never does', () => {
    expect(needsKyc('SOCIETY_ONLY')).toBe(false);
    expect(needsKyc('SOCIETY_AND_NEARBY')).toBe(true);
    expect(needsKyc('PUBLIC')).toBe(true);
    const r = reach();
    expect(reachOptionState(r, 'SOCIETY_ONLY')).toBe('CURRENT');
    expect(reachOptionState(r, 'SOCIETY_AND_NEARBY')).toBe('LOCKED');
    expect(reachOptionState(r, 'PUBLIC')).toBe('LOCKED');
    const v = reach({ reach: 'PUBLIC', verificationStatus: 'VERIFIED' });
    expect(reachOptionState(v, 'SOCIETY_ONLY')).toBe('OPEN');
    expect(reachOptionState(v, 'SOCIETY_AND_NEARBY')).toBe('OPEN');
    // A partner that lost verification may still narrow.
    expect(reachOptionState(reach({ reach: 'PUBLIC', verificationStatus: 'REJECTED' }), 'SOCIETY_ONLY')).toBe('OPEN');
  });
});

describe('home-society banner', () => {
  it('approved / revoked / nothing', () => {
    expect(homeBannerOf(reach())).toEqual({ kind: 'APPROVED', society: 'Green Park', reach: 'SOCIETY_ONLY', km: 3 });
    expect(homeBannerOf(reach({ societyApproval: { status: 'REVOKED', revokedAt: '2026-10-01T00:00:00.000Z', revokedReason: '  Shop closed  ' } })))
      .toEqual({ kind: 'REVOKED', society: 'Green Park', at: '2026-10-01T00:00:00.000Z', reason: 'Shop closed' });
    expect(homeBannerOf({ origin: 'INDEPENDENT', reach: 'PUBLIC', verificationStatus: 'VERIFIED', canWiden: false })).toBeNull();
    expect(homeBannerOf(undefined)).toBeNull();
    expect(isSocietyPartner(reach())).toBe(true);
    expect(isSocietyPartner({ origin: 'INDEPENDENT', reach: 'PUBLIC', verificationStatus: 'VERIFIED', canWiden: false })).toBe(false);
  });
});

describe('visibility blocker SOCIETY_ONLY_REACH', () => {
  it('routes to this app\'s reach screen, with a label in both languages', () => {
    expect(blockerFix('SOCIETY_ONLY_REACH')).toEqual({ href: '/settings/reach', labelKey: 'blockerFix.SOCIETY_ONLY_REACH' });
    expect(en.blockerFix.SOCIETY_ONLY_REACH).toBeTruthy();
    expect(hi.blockerFix.SOCIETY_ONLY_REACH).toBeTruthy();
  });
});
