import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/app';
import { storage } from '../utils/storage';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
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
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
}

/** Clear the session and tell whoever is listening. Safe to call twice. */
export async function clearSession(notify = true): Promise<void> {
  await storage.delete(STORAGE_KEYS.ACCESS_TOKEN);
  await storage.delete(STORAGE_KEYS.REFRESH_TOKEN);
  await storage.delete(STORAGE_KEYS.USER_PROFILE);
  await storage.delete(STORAGE_KEYS.USER_INFO);
  if (notify) onSessionExpired?.();
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
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequest | undefined;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await storage.get(STORAGE_KEYS.REFRESH_TOKEN);
        const profile = normalizeLegacyProfile(
          await storage.getObject<StoredProfile>(STORAGE_KEYS.USER_PROFILE)
        );
        if (!refreshToken) throw new Error('No refresh token');

        const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
          refreshToken,
          // contextId when we have it; the tenantId/role pair is the fallback the
          // server still honours for sessions that predate contexts.
          contextId: profile?.contextId,
          tenantId: profile?.tenantId,
          role: profile?.role,
        });

        const { token, refreshToken: newRefresh } = response.data;
        await storage.set(STORAGE_KEYS.ACCESS_TOKEN, token);
        await storage.set(STORAGE_KEYS.REFRESH_TOKEN, newRefresh);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return apiClient(originalRequest);
      } catch {
        await clearSession();
      }
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

/** The server's error body. `missing` is the onboarding checklist; see below. */
interface ApiErrorBody {
  error?: string;
  message?: string;
  code?: string;
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
 */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;
    const fromBody = body?.error ?? body?.message;
    if (typeof fromBody === 'string' && fromBody.trim()) return fromBody;
    if (!error.response) return 'No connection. Check your network and try again.';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
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
