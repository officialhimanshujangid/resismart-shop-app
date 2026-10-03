import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, IN_APP_PLAN_PURCHASES, STORAGE_KEYS } from '../constants/app';
import { storage } from '../utils/storage';
/**
 * The i18next SINGLETON, not `useTranslation` — this file is not a component
 * and `apiErrorMessage` is called from 114 places, most of them inside a
 * `catch` where no hook can run.
 *
 * Reading `i18n.t` at call time is what keeps it live: the instance carries the
 * current language, so a partner who switches to Hindi mid-session gets Hindi on
 * the very next failure without a single call site changing. `app/_layout.tsx`
 * holds the whole tree behind `initI18n` (`languageReady`), so by the time any
 * screen can have made a request the catalogue is loaded.
 *
 * No cycle: `src/i18n` imports i18next, expo-localization and the two JSON
 * catalogues, and nothing from `src/api`.
 */
import i18n from '../i18n';
import { resolveApiErrorText } from '../lib/apiErrorText';

/**
 * The normal ceiling. A warm server answers every one of these endpoints in
 * well under a second, so 30s is already generous — long enough to survive a
 * bad cell, short enough that a real failure is reported while the partner is
 * still looking at the screen.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The ceiling for a request that may be the one WAKING THE SERVER UP.
 *
 * `constants/app.ts` points at a free Render instance, which is suspended after
 * roughly fifteen minutes with no traffic and takes 30–60s to boot on the next
 * request. At the normal 30s that first call of the morning aborts before the
 * server has finished starting, and `apiErrorMessage` — with no response to
 * read — reports "No connection", blaming the shop's wifi for a sleeping
 * backend the partner cannot see.
 *
 * Deliberately NOT the global timeout. Raising `REQUEST_TIMEOUT_MS` to 60s
 * would make every genuine failure take a full minute to surface for the whole
 * day, to buy one request in the morning. The longer ceiling is spent only
 * while the server might actually be asleep — see `mightBeCold`.
 */
const COLD_START_TIMEOUT_MS = 60_000;

/**
 * How long the instance may sit idle before we assume it has been suspended
 * again. Render's own idle window is ~15 minutes; erring slightly under it
 * means the extra headroom is offered a little too often rather than not at
 * all, and offering it costs nothing unless the request is failing anyway.
 */
const IDLE_SLEEP_MS = 14 * 60_000;

/** When the server last proved it was awake by answering ANYTHING, 4xx included. */
let lastResponseAt: number | null = null;

/** True before the first answer of the process, and after a long enough silence. */
function mightBeCold(): boolean {
  return lastResponseAt === null || Date.now() - lastResponseAt > IDLE_SLEEP_MS;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/** The shape `persistSession` writes to STORAGE_KEYS.USER_PROFILE. */
export interface StoredProfile {
  tenantType: string;
  tenantId: string;
  role: string;
  /**
   * The server's own stable id for this context (`partner:<id>`), when the
   * session was created by a build that knows about it.
   *
   * Optional because a profile written before contexts existed does not have
   * one, and because the refresh endpoint still accepts the `tenantId` + `role`
   * pair. Preferred when present: a user who is both PARTNER_ADMIN of one
   * business and PARTNER_STAFF of another has two contexts that differ only by
   * role, and the pair lookup returns the FIRST match — which is not reliably
   * the one they were signed in to.
   */
  contextId?: string;
}

/**
 * STORAGE_KEYS deliberately kept the retired `resismart_shop_*` spelling so an
 * already-installed app can still find its session after the rename. That
 * decision only pays off if what comes back out of those keys is *usable*, and
 * on its own it is not: the profile written under them before the rename holds
 * `role: 'SHOP_ADMIN'` and `tenantType: 'SHOP'`, and the server no longer knows
 * either word. Kept apart, the two decisions cancel out — we carefully preserve
 * a session and then get it rejected on first use.
 *
 * Concretely, without this mapper:
 *
 * - The 401 interceptor below posts the stored `role` to /auth/refresh-token.
 *   That endpoint matches `tenantId` + `role` against the contexts it resolves
 *   from the user document, which the migration has already rewritten to
 *   `PARTNER_ADMIN`. `SHOP_ADMIN` matches nothing, so it answers 403
 *   "Unauthorized context request", the refresh throws, and the catch clause
 *   wipes every key — signing out exactly the mid-session user the retained key
 *   names were chosen to protect.
 * - The rehydrate in AuthContext restores `tenantType: 'SHOP'`, which is not
 *   `'PARTNER'`, so the partner app's own home screen introduces the active
 *   profile as "Society" and prints the raw retired role beside it.
 *
 * Normalizing where the value is read — rather than rewriting what is stored —
 * keeps this to one expression with no migration step that could itself fail
 * halfway and leave a device in a third state.
 *
 * This mapper is temporary. Every login and context switch overwrites the
 * stored profile with server-issued values, which are already the new ones, so
 * it only ever fires for a session that predates the rename. Delete it in the
 * same release that renames STORAGE_KEYS off the `resismart_shop_*` prefix:
 * constants/app.ts notes that rename can only ship as a deliberate
 * forced-logout, and a forced logout is precisely the event that guarantees no
 * pre-rename profile is left on any device.
 */
const LEGACY_ROLES: Record<string, string> = {
  SHOP_ADMIN: 'PARTNER_ADMIN',
  SHOP_OWNER: 'PARTNER_OWNER',
  SHOP_CLIENT: 'PARTNER_CLIENT',
};

const LEGACY_TENANT_TYPES: Record<string, string> = {
  SHOP: 'PARTNER',
};

/** `shop:<id>` → `partner:<id>`, the contextId half of the same rename. */
const LEGACY_CONTEXT_PREFIX: Record<string, string> = {
  shop: 'partner',
};

/**
 * Deliberately narrowed to `StoredProfile` rather than generic over the caller's
 * richer profile type. A generic would have to widen `role` back to `string` in
 * the object it returns, which does not typecheck against a caller whose own
 * type narrows it — and the escape hatch for that is an assertion this file has
 * no business making. Callers that hold extra fields overlay the result:
 * `{ ...stored, ...normalizeLegacyProfile(stored) }`.
 */
export function normalizeLegacyProfile(profile: StoredProfile | null): StoredProfile | null {
  if (!profile) return null;

  // `?? current` leaves anything already migrated — and any value we have never
  // heard of — exactly as it was, so this stays a translation and never becomes
  // a whitelist that silently blanks an unfamiliar role.
  const role = LEGACY_ROLES[profile.role] ?? profile.role;
  const tenantType = LEGACY_TENANT_TYPES[profile.tenantType] ?? profile.tenantType;
  const contextId = normalizeLegacyContextId(profile.contextId);

  return { tenantType, tenantId: profile.tenantId, role, contextId };
}

function normalizeLegacyContextId(contextId?: string): string | undefined {
  if (!contextId) return contextId;
  const sep = contextId.indexOf(':');
  if (sep < 0) return contextId;
  const replacement = LEGACY_CONTEXT_PREFIX[contextId.slice(0, sep)];
  return replacement ? `${replacement}${contextId.slice(sep)}` : contextId;
}

/**
 * Called when a 401 could not be recovered — the refresh token is gone, expired
 * or refused — after the session keys have already been cleared.
 *
 * It exists because clearing SecureStore is not the same as signing out. Before
 * this hook the interceptor deleted the four keys and then RESOLVED the original
 * rejection, leaving `AuthContext` still reporting `isAuthenticated: true` over
 * an empty keychain: every screen stayed mounted, every subsequent request went
 * out unauthenticated and failed, and the only way back was to kill the app.
 * `AuthProvider` registers the real handler on mount.
 *
 * A module-level slot rather than an import of AuthContext, because axios.ts is
 * imported BY the auth layer — the other direction is a require cycle.
 */
/**
 * WHY the session ended, handed to the listener so the sign-in screen can say
 * it. `no-access` is the one a partner must be told about: the credential is
 * fine, but no business is left on it — an owner whose business was handed
 * over (ROLE_ENDED), or archived. Without a sentence that reads as "the app
 * logged me out for no reason".
 */
export type SessionEndReason = 'rejected' | 'no-credential' | 'no-access';
type SessionExpiredHandler = (reason?: SessionEndReason) => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
}

/** Clear the session and tell whoever is listening. Safe to call twice. */
export async function clearSession(notify = true, reason?: SessionEndReason): Promise<void> {
  await storage.delete(STORAGE_KEYS.ACCESS_TOKEN);
  await storage.delete(STORAGE_KEYS.REFRESH_TOKEN);
  await storage.delete(STORAGE_KEYS.USER_PROFILE);
  await storage.delete(STORAGE_KEYS.USER_INFO);
  if (notify) onSessionExpired?.(reason);
}

/**
 * ── Why a refresh failed, and which failures may end a session ───────────────
 *
 * The distinction this app was missing. Every throw out of the refresh — a DNS
 * failure, a 60s cold-start timeout, a 502 from a Render instance still booting,
 * a 429 from the shared-IP auth limiter — arrived at one `catch` that called
 * `clearSession()`. The note at the top of this file says the free instance
 * takes 30–60s to wake, so the first tap of the morning was signing partners
 * out; so was a lift, a dead patch of the market, or one shop's wifi dropping
 * mid-request.
 *
 * A failure the server never answered tells us NOTHING about the credential. It
 * is not evidence and must not be acted on; the next request tries again.
 *
 *  - `rejected`      the server answered 401 — the refresh token is expired or
 *                    revoked via `tokenVersion`, which the backend raises on
 *                    logout and password reset. A real sign-out, and it must
 *                    still be prompt.
 *  - `stale-context` 403 CONTEXT_NOT_AVAILABLE (`Unauthorized context request`):
 *                    the TOKEN is fine, but the `partner:<id>` this session was
 *                    minted against no longer resolves for this user. Repaired
 *                    in `runRefresh` by refreshing without a context.
 *  - `no-credential` nothing stored to refresh with; there is no session left.
 *  - `no-access`     403 NO_ACTIVE_ACCESS, or no partner business left.
 *  - `inconclusive`  everything else — no response at all (a timeout included:
 *                    `isTimeout` separates the two no-response cases for the
 *                    SENTENCE a partner reads, and neither of them is evidence
 *                    here), 429, 5xx, or a 200 carrying no token.
 */
export type RefreshFailureKind = 'rejected' | 'stale-context' | 'no-credential' | 'no-access' | 'inconclusive';

type RefreshError = Error & { refreshFailure: RefreshFailureKind };

/**
 * A tagged Error rather than an Error subclass: `instanceof` on a subclassed
 * builtin depends on how the file is down-levelled, and this check has to be
 * right in a release bundle, not just in dev.
 */
function refreshFailed(kind: RefreshFailureKind, message: string): RefreshError {
  const e = new Error(message) as RefreshError;
  e.refreshFailure = kind;
  return e;
}

function classifyRefreshFailure(e: unknown): RefreshFailureKind {
  const res = (e as AxiosError<ApiErrorBody> | null)?.response;
  if (!res) return 'inconclusive';
  // 401 is the ONLY answer that ends a session on its own: REFRESH_INVALID,
  // SESSION_ENDED, REFRESH_REUSED, USER_INACTIVE.
  if (res.status === 401) return 'rejected';
  // The code first; the prose is kept for a server that predates the codes.
  if (
    res.status === 403 &&
    (res.data?.code === 'CONTEXT_NOT_AVAILABLE' || res.data?.error === 'Unauthorized context request')
  ) {
    return 'stale-context';
  }
  // The person has no society or business left at all — see `endsSession`.
  if (res.status === 403 && res.data?.code === 'NO_ACTIVE_ACCESS') return 'no-access';
  // >>> MP3LEFT — OC-4b: the refresh answers SOCIETY_SUSPENDED INSTEAD of NO_ACTIVE_ACCESS when the
  // account has no place left and one of its societies is suspended (a partner whose business went
  // away while they also belonged to a suspended society). The same "nothing to open" — ends the
  // session like NO_ACTIVE_ACCESS, rather than leaving a session that can only 403. A shop's own
  // PARTNER token is never refused with it (the per-request check is for SOCIETY tokens only).
  if (res.status === 403 && res.data?.code === 'SOCIETY_SUSPENDED') return 'no-access';
  // <<< MP3LEFT
  // 429 lands here on purpose. `/auth/refresh-token` sits behind an IP-keyed
  // limiter of 20 per 15 minutes, and behind carrier NAT or one shop's wifi a
  // whole street shares an egress IP — so a routine background refresh can be
  // throttled for something somebody else did. "Come back later" is not "your
  // session is over".
  return 'inconclusive';
}

/**
 * May this failure end the session?
 *
 * Only when the server actually answered that the credential is finished — a
 * 401 from the refresh (`rejected`) — or there is nothing left to refresh with.
 *
 * `stale-context` is NOT one any more (auth contract 2026-09-29). The refresh
 * token is fine; only the `partner:<id>` it was minted against has stopped
 * resolving (the role was taken away, the business is gone). `runRefresh`
 * answers it by refreshing again WITHOUT a context and letting the server pick
 * what this person still has — see `adoptContext`. It only reaches here if even
 * that retry could not settle, and then it leaves the session alone.
 *
 * `no-access` (403 NO_ACTIVE_ACCESS, or a refresh that left this person with no
 * partner business at all) does end it: the credential is valid but there is
 * nothing this app can open with it — the same answer the sign-in screen gives
 * such an account (`auth.session.noPartnerAccess`). Keeping a session that can
 * only produce 403s would strand the partner on screens that never load.
 *
 * An ALLOWLIST on purpose — a kind added later defaults to "leave the session
 * alone", which is the side of the mistake a partner recovers from by waiting
 * rather than by signing in again mid-invoice.
 */
export function endsSession(e: unknown): boolean {
  const kind = (e as Partial<RefreshError> | null)?.refreshFailure;
  return kind === 'rejected' || kind === 'no-credential' || kind === 'no-access';
}

/** The session-ending kind of a refresh failure, for `clearSession`'s listener. */
export function sessionEndReason(e: unknown): SessionEndReason | undefined {
  const kind = (e as Partial<RefreshError> | null)?.refreshFailure;
  return kind === 'rejected' || kind === 'no-credential' || kind === 'no-access' ? kind : undefined;
}

/**
 * The context-carrying part of a refresh answer — what `/auth/refresh-token`
 * returns beside the tokens. Typed loosely here (axios.ts must not import
 * auth.api.ts: that file imports this one).
 */
export interface RefreshedContext {
  contextId: string;
  tenantType: string;
  tenantId: string;
  tenantName?: string;
  role: string;
}

/**
 * Called when a refresh MOVED the session to a different context (the stored
 * one had gone stale). `AuthProvider` registers it to repaint the header,
 * reset the query cache and update the business switcher. A module-level slot
 * for the same require-cycle reason as `onSessionExpired`.
 */
type ContextChangedHandler = (active: RefreshedContext, available: RefreshedContext[]) => void;
let onContextChanged: ContextChangedHandler | null = null;

export function setContextChangedHandler(handler: ContextChangedHandler | null): void {
  onContextChanged = handler;
}

/**
 * 403 codes an AUTHENTICATED API answers when the token's role/seat has been
 * taken away since it was minted. The answer is a refresh WITHOUT a context.
 */
export const STALE_ROLE_CODES: ReadonlySet<string> = new Set(['ROLE_ENDED', 'COMMITTEE_SEAT_ENDED', 'GATE_ACCESS_REVOKED']);

/**
 * The single-flight slot, and the reason the refresh moved out of the
 * interceptor.
 *
 * It used to run INLINE there, so a screen that fired five requests at once ran
 * five refreshes. Since 2026-09-29 the server ROTATES the refresh token on every
 * success and treats a token re-presented more than 60 s after its rotation as
 * REUSE (401 REFRESH_REUSED — the whole device session is ended), so parallel
 * refreshes are no longer merely wasteful. Even before that,
 * tolerating was not surviving: if any ONE of the five failed for any reason, its
 * `catch` deleted the tokens the other four had just written successfully, and a
 * perfectly good session died at a random moment. It also spent that budget of
 * 20-per-15-minutes five times faster, turning a burst into the 429 above.
 */
interface RefreshOutcome {
  token: string;
  /** True when the session was moved to a different context than the stored one. */
  contextChanged: boolean;
}

let refreshInFlight: Promise<RefreshOutcome> | null = null;

interface RefreshAnswer {
  token?: string;
  refreshToken?: string;
  activeContext?: RefreshedContext;
  availableContexts?: RefreshedContext[];
}

/**
 * One `/auth/refresh-token` call. `context` null = let the server pick.
 *
 * The rotated refresh token is written to disk HERE, the moment it arrives —
 * the server rotates on every success, so the token we just presented is dead
 * (after a 60 s grace) and the new one is the only way back. Writing it before
 * anything else can fail is what keeps a second call in the same refresh (the
 * stale-context retry, the partner pick) from presenting a spent token.
 */
async function postRefresh(refreshToken: string, context: StoredProfile | { contextId: string } | null): Promise<RefreshAnswer> {
  let data: unknown;
  try {
    // A bare axios call on purpose: going through `apiClient` would put the
    // refresh itself behind this interceptor, and a 401 from the refresh would
    // try to refresh.
    ({ data } = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
      refreshToken,
      // contextId when we have it; the tenantId/role pair is the fallback the
      // server still honours for sessions that predate contexts.
      ...(context
        ? {
            contextId: context.contextId,
            tenantId: (context as StoredProfile).tenantId,
            role: (context as StoredProfile).role,
          }
        : {}),
    }));
  } catch (e) {
    // Even a refusal proves the server is awake — the same rule the response
    // interceptor applies, which this deliberately bare call does not pass through.
    if ((e as AxiosError).response) lastResponseAt = Date.now();
    throw refreshFailed(classifyRefreshFailure(e), 'the refresh call did not succeed');
  }
  // Likewise on the way out: without this, a long quiet spell followed by a
  // successful refresh still hands the NEXT request a cold-start ceiling.
  lastResponseAt = Date.now();

  const answer = (data ?? {}) as RefreshAnswer;
  // A 2xx carrying no token is the server misbehaving, not this partner's
  // session ending — `inconclusive`, so the session survives it.
  if (!answer.token) throw refreshFailed('inconclusive', 'refresh returned no token');
  if (answer.refreshToken) {
    const kept = await storage.set(STORAGE_KEYS.REFRESH_TOKEN, answer.refreshToken);
    if (!kept) throw refreshFailed('inconclusive', 'could not store the rotated refresh token');
  }
  return answer;
}

/**
 * The stale-context repair: the server picked a context for us — make it a
 * PARTNER one, preferring the business this device was already showing.
 *
 * "Keep the partner context if still present": the same `contextId` first,
 * then the same business under another role, then the server's own pick if it
 * is a partner, then any partner business. None left → `no-access`.
 */
async function adoptContext(
  answer: RefreshAnswer,
  previous: StoredProfile | null,
): Promise<RefreshAnswer & { activeContext: RefreshedContext }> {
  const partners = (answer.availableContexts ?? (answer.activeContext ? [answer.activeContext] : []))
    .filter((c) => c.tenantType === 'PARTNER');
  if (partners.length === 0) throw refreshFailed('no-access', 'no partner business left on this account');

  const active = answer.activeContext;
  const pick =
    partners.find((c) => previous?.contextId && c.contextId === previous.contextId) ??
    partners.find((c) => previous?.tenantId && c.tenantId === previous.tenantId) ??
    (active && active.tenantType === 'PARTNER' ? active : undefined) ??
    partners[0];

  if (active && active.contextId === pick.contextId) return { ...answer, activeContext: active };
  // One more refresh, now naming the partner context. Uses the token the
  // previous call just rotated in (already on disk).
  const switched = await postRefresh(answer.refreshToken ?? '', { contextId: pick.contextId });
  return {
    ...switched,
    availableContexts: switched.availableContexts ?? answer.availableContexts,
    activeContext: switched.activeContext ?? pick,
  };
}

async function runRefresh(dropContext: boolean): Promise<RefreshOutcome> {
  const [refreshToken, stored] = await Promise.all([
    storage.get(STORAGE_KEYS.REFRESH_TOKEN),
    storage.getObject<StoredProfile>(STORAGE_KEYS.USER_PROFILE),
  ]);
  if (!refreshToken) throw refreshFailed('no-credential', 'no refresh token');
  const profile = normalizeLegacyProfile(stored);

  let answer: RefreshAnswer;
  let contextChanged = false;
  if (dropContext) {
    // An API said ROLE_ENDED (or similar): the context itself is what went
    // stale, so do not even present it.
    answer = await postRefresh(refreshToken, null);
    contextChanged = true;
  } else {
    try {
      answer = await postRefresh(refreshToken, profile);
    } catch (e) {
      if ((e as Partial<RefreshError>).refreshFailure !== 'stale-context') throw e;
      // 403 CONTEXT_NOT_AVAILABLE: the token is fine, the business is not.
      // Forget the stored context and ask again without one. Same refresh
      // token — a refused call does not rotate it.
      answer = await postRefresh(refreshToken, null);
      contextChanged = true;
    }
  }

  if (contextChanged) {
    const adopted = await adoptContext(answer, profile);
    answer = adopted;
    const ctx = adopted.activeContext;
    contextChanged = ctx.contextId !== profile?.contextId;
    await storage.setObject(STORAGE_KEYS.USER_PROFILE, {
      tenantType: ctx.tenantType,
      tenantId: ctx.tenantId,
      role: ctx.role,
      contextId: ctx.contextId,
      tenantName: ctx.tenantName,
    });
  }

  const token = answer.token as string;
  const storedAccess = await storage.set(STORAGE_KEYS.ACCESS_TOKEN, token);
  /**
   * A token we cannot persist is not a session we can use.
   *
   * `storage.set` used to swallow its own failure, which made this the quietest
   * fault in the file: the one retried request would succeed on the header the
   * interceptor sets from the returned token, every LATER request would read the
   * stale token back off disk, 401, and refresh again — one refresh per request,
   * straight into the IP limiter, with nothing anywhere to say why. Reported as
   * `inconclusive` because it is our disk that failed and not the credential:
   * this request fails, the session stays, and the next attempt tries again.
   */
  if (!storedAccess) throw refreshFailed('inconclusive', 'could not store the new access token');

  if (contextChanged && answer.activeContext) {
    onContextChanged?.(answer.activeContext, answer.availableContexts ?? [answer.activeContext]);
  }
  return { token, contextChanged };
}

/**
 * The shared refresh. Callers that arrive while one is running join it —
 * whatever kind it is: a context-keeping refresh that meets a stale context
 * repairs it itself, so a `dropContext` caller loses nothing by joining.
 */
function sharedRefresh(dropContext = false): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = runRefresh(dropContext).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** The shared refresh, for callers that only need the new access token. */
export function refreshSession(opts: { dropContext?: boolean } = {}): Promise<string> {
  return sharedRefresh(opts.dropContext).then((o) => o.token);
}

/**
 * Sign-in/out endpoints whose 401 is an ANSWER (wrong password, bad code), not
 * an expired access token — a refresh there is meaningless.
 */
function isAuthEntry(url: string | undefined): boolean {
  if (!url) return false;
  return /\/auth\/(login|refresh-token|logout|otp|register|forgot-password|reset-password|google)/.test(url);
}

/**
 * Retry the original request after a refresh — unless the refresh MOVED the
 * session to another business and the request would write. A retried POST
 * would then create the invoice/booking in a business the partner did not
 * pick. Reads are safe (the cache is reset for the new business anyway).
 */
function retryAfterRefresh(original: RetriableRequest, outcome: RefreshOutcome) {
  const method = (original.method ?? 'get').toLowerCase();
  if (outcome.contextChanged && method !== 'get') {
    return Promise.reject(new Error(i18n.t('errors.ROLE_ENDED')));
  }
  if (original.headers) original.headers.Authorization = `Bearer ${outcome.token}`;
  return apiClient(original);
}

/**
 * `_retry` is ours, not axios's, so it is declared rather than bolted onto an
 * `any`. Without the flag a 401 on the REFRESH call itself would be retried
 * through the same interceptor forever.
 */
interface RetriableRequest extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

apiClient.interceptors.request.use(
  async (config) => {
    const token = await storage.get(STORAGE_KEYS.ACCESS_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Only when the caller has not asked for its own ceiling, and only while the
    // instance may still be asleep. `config.timeout` is already the instance
    // default by this point, so "did the caller choose it" is "is it anything
    // other than the default".
    if (config.timeout === REQUEST_TIMEOUT_MS && mightBeCold()) {
      config.timeout = COLD_START_TIMEOUT_MS;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => {
    lastResponseAt = Date.now();
    return response;
  },
  async (error: AxiosError) => {
    // A refusal is still proof the server is up and serving; only a request that
    // never got a response leaves the question open.
    if (error.response) lastResponseAt = Date.now();
    const originalRequest = error.config as RetriableRequest | undefined;
    const status = error.response?.status;
    const code = (error.response?.data as ApiErrorBody | undefined)?.code;
    /**
     * Two ways in: a 401 (the access token expired — refresh keeping the
     * context), and a 403 whose code says the ROLE behind the token is gone
     * (ROLE_ENDED …) — refresh WITHOUT the context and let the server say what
     * this person still has. Neither ends the session by itself; only a 401
     * from the refresh does (see `endsSession`).
     */
    const expired = status === 401 && !isAuthEntry(originalRequest?.url);
    const roleEnded = status === 403 && !!code && STALE_ROLE_CODES.has(code);
    if ((expired || roleEnded) && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      let outcome: RefreshOutcome;
      try {
        outcome = await sharedRefresh(roleEnded);
      } catch (refreshError) {
        // The whole point: only a server answer that rejects the credential ends
        // the session. Anything we never got an answer to leaves it exactly as it
        // was — this request fails, and the next one refreshes again.
        if (endsSession(refreshError)) await clearSession(true, sessionEndReason(refreshError));
        return Promise.reject(error);
      }
      return retryAfterRefresh(originalRequest, outcome);
    }
    return Promise.reject(error);
  }
);

/**
 * The envelope the partner controllers answer in. Not every one of them uses it
 * — `partner.controller`'s onboarding handlers reply with the bare object — so
 * `unwrap` accepts both rather than making each caller remember which.
 */
export interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

/**
 * `res.data.data` when the handler wrapped its payload, `res.data` when it did
 * not.
 *
 * `'data' in body` rather than a truthiness check: an envelope whose `data` is
 * legitimately `null` or `0` must still unwrap, and a bare payload that happens
 * to carry its own `data` field is not something any of these endpoints return.
 */
export function unwrap<T>(body: ApiEnvelope<T> | T): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as ApiEnvelope<T>).data as T;
  }
  return body as T;
}

/**
 * A request that ran out of time rather than one that was refused or dropped.
 *
 * Both codes appear: axios aborts with `ECONNABORTED` on its own `timeout`, and
 * React Native's networking stack sometimes surfaces the platform's own
 * `ETIMEDOUT` first.
 */
function isTimeout(error: AxiosError): boolean {
  return !error.response && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT');
}

/** The server's error body. `missing` is the onboarding checklist; see below. */
interface ApiErrorBody {
  error?: string;
  message?: string;
  code?: string;
  /** Values the coded sentence names (`{attemptsLeft}`, `{max}` …). */
  params?: Record<string, unknown>;
  upgradeRequired?: boolean;
  missing?: Array<{ step: number; field: string; message: string }>;
}

/**
 * The sentence to show the partner.
 *
 * Prefers the server's own wording, because the backend deliberately writes
 * these as things a shop owner can act on ("Drop the map pin on your location")
 * rather than as field names — a client that replaced them with a generic
 * "Request failed" would throw away the only useful part of the response. The
 * fallback names the network, since that is the actual cause when there is no
 * response body at all and a shop's connection dies constantly.
 *
 * A TIMEOUT is separated out from the rest of the no-response cases. The two
 * look identical to axios but are not the same event: a dropped connection is
 * the partner's network, while an abort after the full ceiling is usually the
 * server still waking up (see `COLD_START_TIMEOUT_MS`). Telling somebody with
 * four bars of signal to check their network sends them to reboot a router that
 * was never the problem.
 */
export function apiErrorMessage(error: unknown, fallback?: string): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;

    /**
     * The two idempotency refusals, ABOVE the server's own wording.
     *
     * This is the one place the rule about preferring the server's sentence is
     * wrong, and it is wrong in a way that costs money. Both of these answers
     * (`idempotency.middleware.ts:169-198`) are about a request the partner has
     * ALREADY sent, not about a new failure — but they arrive down the same
     * `catch` as every other error and get drawn in the same red toast, so a
     * partner reads them as "that did not work".
     *
     * The 409 is the dangerous one. "This is still being processed" printed as
     * an error means Issue gets tapped again, which is precisely the second
     * numbered invoice the key was sent to prevent. So it says what to do
     * instead of what happened, and it leads with the fact that nothing is lost.
     */
    if (body?.code === 'IDEMPOTENCY_IN_PROGRESS') {
      return i18n.t('common.apiError.idempotencyInProgress');
    }
    if (body?.code === 'IDEMPOTENCY_KEY_REUSED') {
      return i18n.t('common.apiError.idempotencyKeyReused');
    }

    /**
     * A plan refusal (402 / `upgradeRequired`), also above the server's wording.
     *
     * The backend writes these for the web panel and ends them with "Upgrade
     * your plan" — a pointer to a purchase this build may not make or mention
     * (`IN_APP_PLAN_PURCHASES`). So every caller, the offline-draft queue
     * included, gets our neutral sentence instead, split by the one distinction
     * worth keeping: a module the plan does not include at all, versus a
     * ceiling the plan has and has reached.
     */
    if (!IN_APP_PLAN_PURCHASES && isUpgradeRequired(error)) {
      return body?.code === 'MODULE_NOT_IN_PLAN' || body?.code === 'PLAN_UPGRADE_REQUIRED'
        ? i18n.t('common.apiError.notInPlan')
        : i18n.t('common.apiError.planLimit');
    }

    /**
     * A CODED refusal is shown in OUR words, in the current language — the
     * `errors.<CODE>` catalogue, seeded from the backend's partner and
     * marketplace catalogues. An uncoded 4xx keeps the server's own sentence
     * (written for a shop owner, names the thing to fix); a 5xx gets the
     * generic line, never a server's crash text. The rules are in
     * `src/lib/apiErrorText.ts`.
     */
    const fromBody = body?.error ?? body?.message;

    /**
     * PASSWORD_POLICY is the one auth code whose SERVER sentence is better than
     * ours — it names the exact problem ("too common", "contains your name").
     * It is English only, so a Hindi reader still gets the catalogue sentence.
     */
    if (
      body?.code === 'PASSWORD_POLICY' &&
      typeof fromBody === 'string' &&
      fromBody.trim() &&
      !String(i18n.language ?? 'en').startsWith('hi')
    ) {
      return fromBody.trim();
    }

    const resolved = resolveApiErrorText(
      {
        status: error.response?.status,
        code: body?.code,
        params: body?.params,
        serverText: typeof fromBody === 'string' ? fromBody : undefined,
        hasResponse: !!error.response,
        timedOut: isTimeout(error),
      },
      { t: (k, o) => String(i18n.t(k, o)), exists: (k) => i18n.exists(k) },
    );
    if (resolved.kind === 'text') return resolved.text;
    if (resolved.kind === 'timeout') return i18n.t('common.apiError.timeout');
    if (resolved.kind === 'noConnection') return i18n.t('common.apiError.noConnection');
    return fallback ?? i18n.t('common.somethingWentWrong');
  }
  if (error instanceof Error && error.message) return error.message;
  /**
   * `?? t(…)`, NOT a default parameter.
   *
   * A default written as `fallback = i18n.t(…)` reads as harmless and is the
   * shape this app has agreed not to use: the language belongs to the moment
   * the sentence is SHOWN, and pinning translation to a signature is how a
   * string ends up frozen in whatever language happened to be current when it
   * was bound. Resolved here, at the point of return, it cannot be stale.
   */
  return fallback ?? i18n.t('common.somethingWentWrong');
}

/** True when the server refused because the partner's plan does not cover this. */
export function isUpgradeRequired(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const body = error.response?.data as ApiErrorBody | undefined;
  return error.response?.status === 402 || body?.upgradeRequired === true;
}

/**
 * The machine-readable reason, where the server sent one.
 *
 * The SENTENCE is what a partner reads and `apiErrorMessage` is how it is
 * shown; this is for the handful of refusals a screen has to branch on rather
 * than merely print — `NO_BILL_RAISED` being the one that has an obvious next
 * step ("raise it now?") the message itself cannot perform.
 */
export function apiErrorCode(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  return (error.response?.data as ApiErrorBody | undefined)?.code;
}

/** The `params` of a coded refusal (`{ attemptsLeft: '3' }` …), where sent. */
export function apiErrorParams(error: unknown): Record<string, unknown> | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  return (error.response?.data as ApiErrorBody | undefined)?.params;
}

/**
 * An idempotency key for a create request, so a retry on a flaky connection
 * cannot produce two invoices (PARTNERS_PLAN §12.5).
 *
 * Generated ONCE per user intent and reused for every retry of that intent —
 * generating it inside the retry is the bug it exists to prevent. Offline
 * drafts must store their key alongside the draft, not mint one at sync time.
 */
export function withIdempotency(key: string, config?: AxiosRequestConfig): AxiosRequestConfig {
  return { ...config, headers: { ...config?.headers, 'Idempotency-Key': key } };
}
