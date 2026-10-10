import type { PartnerKind } from '../../types/api-contract.generated';

/**
 * Society partners (CONTRACT-partner-P3 §1.1, §7.2, §7.3) — the shop app's half.
 *
 * `PARTNER_REACHES` / `PARTNER_ORIGINS` are NOT in `api-contract.generated.ts`:
 * the backend generator's registry does not list them yet (B0 owns it). They are
 * declared here, word for word as `models/partner.model.ts` spells them, until
 * that registry grows the two entries — then these become re-exports.
 */
export const PARTNER_REACHES = ['SOCIETY_ONLY', 'SOCIETY_AND_NEARBY', 'PUBLIC'] as const;
export type PartnerReach = typeof PARTNER_REACHES[number];
/** The two reaches that need `verification.status === 'VERIFIED'` (§0.1-1). */
export const REACHES_NEEDING_KYC: readonly PartnerReach[] = ['SOCIETY_AND_NEARBY', 'PUBLIC'];

export type PartnerOrigin = 'INDEPENDENT' | 'SOCIETY';

/** `GET /society-partner-invites/:token` (§7.2). No sign-in. */
export interface SocietyInvitePreview {
  societyName: string;
  societyCity?: string;
  businessName: string;
  kind: PartnerKind | string;
  operatorName: string;
  phoneMasked: string;
  /** The office already gave an email — the accept form does not ask again. */
  hasEmail: boolean;
  expiresAt: string;
  /**
   * NOT in the contract today (additive, forward-compatible): when a server
   * says `false`, the "Lives here" consent is hidden because no flat is linked.
   * Absent = unknown = the consent is offered with its "only if your flat is
   * linked" note (the server ignores it without a flat).
   */
  hasFlat?: boolean;
}

/** `POST /society-partner-invites/:token/otp` — the phone comes from the invite, never the body. */
export interface SocietyInviteOtpResult {
  phoneMasked: string;
  expiresInSec: number;
  deliveredVia?: 'whatsapp' | 'sms' | 'email' | string | null;
}

/** `acceptSocietyPartnerInviteSchema` (§5). */
export interface SocietyInviteAcceptBody {
  code: string;
  name?: string;
  email?: string;
  acceptTerms: true;
  showLivesHereBadge: boolean;
}

/** `POST /society-partner-invites/:token/accept` — then the NORMAL phone-OTP sign-in. */
export interface SocietyInviteAcceptResult {
  partnerId: string;
  slug: string;
  partnerName: string;
  loginPhoneMasked: string;
}

/** `GET /partners/me/reach` (§7.3). An independent answers only the first four fields. */
export interface MyReach {
  origin: PartnerOrigin;
  reach: PartnerReach;
  homeSociety?: { id: string; name: string; city?: string };
  societyApproval?: { status: 'APPROVED' | 'REVOKED' | string; approvedAt?: string; revokedAt?: string; revokedReason?: string };
  verificationStatus: string;
  showLivesHereBadge?: boolean;
  homeFlatLabel?: string;
  canWiden: boolean;
  nearbyKm?: number;
  /** P2A (M04-Q13): the home society's account is paused (suspended by ResiSmart). */
  homeSocietySuspended?: boolean;
}
