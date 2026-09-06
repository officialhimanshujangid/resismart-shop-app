import { isAxiosError } from 'axios';

import { apiClient, StoredProfile } from './axios';
import { TenantType, UserRole } from '../types/api-contract.generated';

/**
 * A context the signed-in identity may act in — one partner business, one flat,
 * or one tenant-level admin role. The server's `IResolvedContext`, trimmed to
 * what this app reads.
 *
 * `contextId` is the field that matters: `/auth/refresh-token` switches by it,
 * and it is the ONLY unambiguous handle. The `tenantId` + `role` pair the old
 * client posted resolves to the first match, which is the wrong business for
 * anybody who is PARTNER_ADMIN of one shop and PARTNER_STAFF of another.
 */
export interface ResolvedContext {
  contextId: string;
  kind: 'SOCIETY_UNIT' | 'PARTNER' | 'ADMIN';
  tenantType: TenantType;
  tenantId: string;
  tenantName: string;
  unitType: 'FLAT' | 'PARTNER' | null;
  unitId: string | null;
  unitLabel: string | null;
  role: UserRole;
}

/**
 * What gets persisted as the active profile.
 *
 * Extends `StoredProfile` — the shape the axios refresh interceptor reads back
 * out of SecureStore — so the two can never disagree about what a session is.
 * The extra fields are all optional because a profile written by a build that
 * predates them is still a valid session, and nothing here is load-bearing for
 * the refresh call.
 */
export interface ProfileInfo extends StoredProfile {
  /** `tenantType` is kept wide on purpose: it comes off the wire. */
  tenantType: TenantType | string;
  /** The business name, for the header. Absent on a pre-context session. */
  tenantName?: string;
}

export interface UserInfo {
  name: string;
  email?: string;
  phone?: string;
  profileImage?: string;
}

/**
 * The login response, in the shape the CURRENT backend answers with.
 *
 * `requiresContextSelection` / `profiles` / `userId` are gone: `auth.routes.ts`
 * removed `POST /auth/select-context` (it minted tokens from a userId with no
 * credential check), and `login` now auto-selects `contexts[0]` and returns
 * every context it resolved. Switching is a `/auth/refresh-token` call, which
 * requires the refresh token — so the client has a session before it can pick.
 */
export interface LoginResponse {
  message: string;
  autoSelected?: boolean;
  token: string;
  refreshToken: string;
  activeContext: ResolvedContext;
  availableContexts: ResolvedContext[];
  /** Legacy shape the server still sends. `activeContext` is the real answer. */
  profile?: ProfileInfo;
  user?: UserInfo;
}

export interface RefreshResponse {
  token: string;
  refreshToken: string;
  activeContext: ResolvedContext;
  availableContexts: ResolvedContext[];
  profile?: ProfileInfo;
}

export type OtpChannel = 'EMAIL' | 'PHONE';

/**
 * `LOGIN` is for signing an existing identity in; `PARTNER_REGISTRATION` is the
 * purpose the signup wizard's email and phone codes are minted under, and
 * `registerPartnerPublic` will only accept verification tokens issued for it.
 * Sending the wrong purpose fails at the very last step of the wizard, after
 * everything has been typed — which is why this is a union and not a string.
 */
export type OtpPurpose = 'LOGIN' | 'PARTNER_REGISTRATION' | 'GENERIC';

/**
 * The transport a PHONE code may be asked for by name.
 *
 * `auto` walks the server's WhatsApp → SMS ladder; naming one pins it, which is
 * what the "try the other way" buttons post. Ignored on EMAIL — the server
 * treats a phone transport chosen for an inbox as a meaningless instruction
 * rather than a client error, so nothing has to special-case it here.
 */
export type OtpAltVia = 'whatsapp' | 'sms';
export type OtpVia = 'auto' | OtpAltVia;

/** The transport a code actually went out on. `email` is never a `via`. */
export type OtpDeliveredVia = OtpAltVia | 'email';

/**
 * The delivery report both request endpoints carry.
 *
 * `alternatives` is what the server will genuinely accept as a second attempt —
 * it already excludes the rung that was just used and any rung that is not
 * configured — so it can be rendered as buttons without further filtering.
 *
 * `whatsappAvailable` is a fact about the PLATFORM (is the token set, is the
 * template approved), not about this user, which is why it is safe to print.
 * It is `false` in production today while `resismart_otp` sits unapproved.
 */
export interface OtpDelivery {
  deliveredVia: OtpDeliveredVia;
  alternatives: OtpAltVia[];
  whatsappAvailable: boolean;
}

/**
 * `POST /auth/otp/request` — signup / contact verification.
 *
 * This endpoint REPORTS DELIVERY TRUTHFULLY: a 200 means something was actually
 * accepted by a transport. Nothing delivered is a 502 carrying
 * `OtpDeliveryFailure`, and the caller must NOT advance to a code screen on it.
 */
export interface OtpRequestResponse extends OtpDelivery {
  message: string;
  channel: OtpChannel;
  expiresInSec?: number;
}

/**
 * The 502 body of `POST /auth/otp/request` — the code was minted but no
 * transport took it.
 *
 * The OTP row still exists and the server deliberately WAIVES the resend
 * cooldown after a failed delivery, so `alternatives` can be tried immediately.
 * That is the only reason listing them is worth anything.
 */
export interface OtpDeliveryFailure {
  error: string;
  channel: OtpChannel;
  deliveredVia: null;
  alternatives: OtpAltVia[];
  whatsappAvailable: boolean;
}

/**
 * `POST /auth/login/otp/request` — deliberately NOT the same contract.
 *
 * It answers 200 for everybody, and `deliveredVia` is the transport used OR
 * MERELY INTENDED. It can never be null and it can never report a failure,
 * because "we could not deliver" on an unauthenticated endpoint would say
 * whether the account exists. Do not build failure UI on this response.
 */
export interface LoginOtpRequestResponse extends OtpDelivery {
  message: string;
  channel: OtpChannel;
}

/**
 * The 502 delivery report, or `undefined` for any other failure.
 *
 * Kept beside the types it reads so no screen has to know the status code. Uses
 * axios's NAMED `isAxiosError` rather than the default export's member, which is
 * what the lint rule asks for everywhere else in this codebase.
 */
export function otpDeliveryFailure(error: unknown): OtpDeliveryFailure | undefined {
  if (!isAxiosError(error) || error.response?.status !== 502) return undefined;
  const body = error.response.data as Partial<OtpDeliveryFailure> | undefined;
  if (!body || !Array.isArray(body.alternatives)) return undefined;
  return {
    error: body.error ?? 'We could not deliver the code right now.',
    channel: body.channel ?? 'PHONE',
    deliveredVia: null,
    alternatives: body.alternatives,
    whatsappAvailable: body.whatsappAvailable === true,
  };
}

export interface OtpVerifyResponse {
  message: string;
  channel: OtpChannel;
  /** Short-lived, and bound to channel + target + purpose. */
  verificationToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export const authApi = {
  /**
   * Password login. `identifier`, NOT `email` — `auth.validator.ts`'s
   * `loginSchema` takes an email OR a phone number under that one name, and the
   * previous `{ email, password }` body failed its `identifier` check on every
   * attempt, so this endpoint answered 400 for everybody.
   *
   * Most partner identities have no password at all: `registerPartnerPublic`
   * creates them passwordless and they sign in with a code. Those get a 401 with
   * `useOtp: true` — see `AuthContext.login`, which turns that into the OTP flow
   * rather than into "invalid credentials".
   */
  login: (identifier: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login', { identifier, password }),

  /**
   * Passwordless sign-in, step 1. Deliberately vague about whether the account
   * exists — see `LoginOtpRequestResponse` for what `deliveredVia` means here,
   * which is NOT what it means on `otpRequest`.
   *
   * `via` pins the transport for a retry on the other rung. It is sent
   * explicitly rather than left to the server's default so a re-request from the
   * code screen cannot silently land back on the rung that just failed.
   */
  loginOtpRequest: (identifier: string, via: OtpVia = 'auto') =>
    apiClient.post<LoginOtpRequestResponse>('/auth/login/otp/request', { identifier, via }),

  /**
   * Google sign-in. Returns the same session shape as the password and OTP
   * routes — the server mints one kind of session however the identity was
   * proved — so the caller consumes it identically.
   */
  loginGoogle: (idToken: string) =>
    apiClient.post<LoginResponse>('/auth/login/google', { idToken }),

  /**
   * Google standing in for the emailed code during partner registration.
   * Returns the same verification receipt `otpVerify` returns.
   */
  googleVerifyContact: (idToken: string) =>
    apiClient.post<{ email: string; verificationToken: string; name?: string }>(
      '/auth/google/verify-contact',
      { idToken, purpose: 'PARTNER_REGISTRATION' },
    ),

  /** Passwordless sign-in, step 2 — issues the session. */
  loginOtpVerify: (identifier: string, code: string) =>
    apiClient.post<LoginResponse>('/auth/login/otp/verify', { identifier, code }),

  /**
   * Switch context, and the only way to do it. Also how a session is renewed —
   * one endpoint, because "which business am I in" and "give me a fresh token"
   * are the same operation server-side.
   */
  switchContext: (refreshToken: string, contextId: string) =>
    apiClient.post<RefreshResponse>('/auth/refresh-token', { refreshToken, contextId }),

  /**
   * Verification codes for registration (purpose-bound — see OtpPurpose).
   *
   * Rejects with a 502 when nothing was delivered; read it with
   * `otpDeliveryFailure` and stay on the step. A caught error here is NOT a
   * reason to show a code box.
   */
  otpRequest: (channel: OtpChannel, target: string, purpose: OtpPurpose, via: OtpVia = 'auto') =>
    apiClient.post<OtpRequestResponse>('/auth/otp/request', { channel, target, purpose, via }),

  otpVerify: (channel: OtpChannel, target: string, purpose: OtpPurpose, code: string) =>
    apiClient.post<OtpVerifyResponse>('/auth/otp/verify', { channel, target, purpose, code }),

  /**
   * Kept taking `{ email }` rather than a bare string: `forgot-password.tsx`
   * already calls it that way and this agent does not own that screen. The
   * argument shape mirrors the request body, which is also how the endpoint
   * reads.
   */
  forgotPassword: (data: ForgotPasswordRequest) =>
    apiClient.post<{ message: string }>('/auth/forgot-password', data),
};

/** A context this app can actually open. Everything else is another product. */
export const isPartnerContext = (c: ResolvedContext): boolean => c.tenantType === 'PARTNER';

/** `ResolvedContext` → the profile shape that gets persisted. */
export const toProfile = (c: ResolvedContext): ProfileInfo => ({
  tenantType: c.tenantType,
  tenantId: c.tenantId,
  role: c.role,
  contextId: c.contextId,
  tenantName: c.tenantName,
});
