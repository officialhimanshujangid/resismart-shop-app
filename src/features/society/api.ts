import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
import type {
  MyReach, PartnerReach, SocietyInviteAcceptBody, SocietyInviteAcceptResult, SocietyInviteOtpResult,
  SocietyInvitePreview,
} from './types';

/**
 * CONTRACT-partner-P3 §7.2 (the operator's invite link, no sign-in) and §7.3
 * (the partner session's reach router). Every path is exactly the contract's.
 *
 * `/society-partner-invites`, NOT `/partner-invites`: that family is P0's owner
 * invitations (`features/owners/api.ts`) and the two must never be confused.
 */
export function societyInvitePath(token: string): string {
  return `/society-partner-invites/${encodeURIComponent(token)}`;
}

export const societyInviteApi = {
  preview: (token: string) =>
    apiClient.get<ApiEnvelope<SocietyInvitePreview>>(societyInvitePath(token)).then((r) => unwrap(r.data)),

  /** `via` only — the schema is strict and takes no phone (the invite's phone is used). */
  sendCode: (token: string, via: 'auto' | 'whatsapp' | 'sms' = 'auto') =>
    apiClient
      .post<ApiEnvelope<SocietyInviteOtpResult>>(`${societyInvitePath(token)}/otp`, { via })
      .then((r) => unwrap(r.data)),

  accept: (token: string, body: SocietyInviteAcceptBody) => {
    const out: SocietyInviteAcceptBody = {
      code: body.code.trim(),
      acceptTerms: true,
      showLivesHereBadge: body.showLivesHereBadge,
    };
    if (body.name?.trim()) out.name = body.name.trim();
    if (body.email?.trim()) out.email = body.email.trim().toLowerCase();
    return apiClient
      .post<ApiEnvelope<SocietyInviteAcceptResult>>(`${societyInvitePath(token)}/accept`, out)
      .then((r) => unwrap(r.data));
  },
};

export const reachApi = {
  /** Any partner login may read it (staff included) — the Today banner does. */
  get: () => apiClient.get<ApiEnvelope<MyReach>>('/partners/me/reach').then((r) => unwrap(r.data)),

  /** Proprietor only; widening needs KYC (409 `REACH_NEEDS_KYC`). Answers the GET shape. */
  set: (reach: PartnerReach) =>
    apiClient.put<ApiEnvelope<MyReach>>('/partners/me/reach', { reach }).then((r) => unwrap(r.data)),

  /** Proprietor only; `show: true` without a linked flat → 409 `LIVES_HERE_NEEDS_FLAT`. */
  setLivesHereBadge: (show: boolean) =>
    apiClient
      .put<ApiEnvelope<MyReach>>('/partners/me/reach/lives-here-badge', { show })
      .then((r) => unwrap(r.data)),
};
