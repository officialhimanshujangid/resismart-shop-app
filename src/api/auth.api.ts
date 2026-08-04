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

export interface OtpRequestResponse {
  message: string;
  channel: OtpChannel;
  expiresInSec?: number;
  /** Dev only — no SMS gateway is wired, so the phone code comes back inline. */
  devCode?: string;
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

  /** Passwordless sign-in, step 1. Deliberately vague about whether the account exists. */
  loginOtpRequest: (identifier: string) =>
    apiClient.post<OtpRequestResponse & { devCode?: string }>('/auth/login/otp/request', { identifier }),

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

  /** Verification codes for registration (purpose-bound — see OtpPurpose). */
  otpRequest: (channel: OtpChannel, target: string, purpose: OtpPurpose) =>
    apiClient.post<OtpRequestResponse>('/auth/otp/request', { channel, target, purpose }),

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
