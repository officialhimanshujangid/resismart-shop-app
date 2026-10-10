import type { MyReach, PartnerReach } from './types';
import { REACHES_NEEDING_KYC } from './types';

/**
 * Pure rules for the society-partner screens. None of them decide anything the
 * server does not also decide — they only choose what to DRAW before asking.
 */

/** The refusals after which an invitation link is finished: the form is hidden. */
export const DEAD_INVITE_CODES: ReadonlySet<string> = new Set([
  'SOCIETY_INVITE_NOT_FOUND',
  'SOCIETY_INVITE_ALREADY_USED',
  'SOCIETY_INVITE_SOCIETY_FULL',
]);

export const INVITE_CODE_RE = /^\d{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s: string) => EMAIL_RE.test(s.trim());

/** Only the digits of a phone — `+91 98765 43210` → `919876543210`. */
export const digitsOf = (s: string) => s.replace(/\D/g, '');

/**
 * Does the number typed match the masked one the server showed (`•••••45678`)?
 *
 * Only the visible tail is compared. A mask with no digits proves nothing, so it
 * is not held against the person (the sign-in itself is the real check). A
 * 10-digit Indian mobile, with or without +91, is required either way.
 */
export function phoneMatchesMask(typed: string, masked: string | undefined): boolean {
  const d = digitsOf(typed);
  const local = d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
  if (!/^[6-9]\d{9}$/.test(local)) return false;
  const tail = digitsOf(masked ?? '');
  return !tail || local.endsWith(tail.length > 10 ? tail.slice(-10) : tail);
}

/** The login identifier sent to the normal phone-OTP sign-in. */
export function loginPhone(typed: string): string {
  const d = digitsOf(typed);
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
}

export const needsKyc = (reach: PartnerReach) => REACHES_NEEDING_KYC.includes(reach);

/**
 * How a reach option is drawn:
 *  - CURRENT   the one in force;
 *  - OPEN      may be chosen (narrowing always, widening once verified);
 *  - LOCKED    needs ResiSmart KYC first — same test as `reachChangeRefusal`.
 */
export type ReachOptionState = 'CURRENT' | 'OPEN' | 'LOCKED';
export function reachOptionState(r: Pick<MyReach, 'reach' | 'verificationStatus'>, option: PartnerReach): ReachOptionState {
  if (option === r.reach) return 'CURRENT';
  if (needsKyc(option) && r.verificationStatus !== 'VERIFIED') return 'LOCKED';
  return 'OPEN';
}

/** Is this a society partner at all (the reach screen, banner and More row exist only for them)? */
export const isSocietyPartner = (r: MyReach | undefined | null): r is MyReach =>
  !!r && r.origin === 'SOCIETY';

/** The Today banner: approved, removed, or nothing (independents, unknown state). */
export type HomeBanner =
  | { kind: 'APPROVED'; society: string; reach: PartnerReach; km?: number }
  | { kind: 'REVOKED'; society: string; at?: string; reason?: string }
  // P2A (M04-Q13, web parity): approved, but the home society's account is paused.
  | { kind: 'PAUSED'; society: string };
export function homeBannerOf(r: MyReach | undefined | null): HomeBanner | null {
  if (!isSocietyPartner(r) || !r.homeSociety) return null;
  const society = r.homeSociety.name;
  const status = r.societyApproval?.status;
  if (status === 'REVOKED') {
    return { kind: 'REVOKED', society, at: r.societyApproval?.revokedAt, reason: r.societyApproval?.revokedReason?.trim() || undefined };
  }
  if (r.homeSocietySuspended === true) return { kind: 'PAUSED', society }; // P2A (M04-Q13)
  if (status === 'APPROVED') return { kind: 'APPROVED', society, reach: r.reach, km: r.nearbyKm };
  return null;
}
