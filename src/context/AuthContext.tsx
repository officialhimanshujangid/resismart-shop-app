import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { forgetGoogle } from '../lib/google';
import {
  authApi,
  ProfileInfo,
  UserInfo,
  ResolvedContext,
  LoginOtpRequestResponse,
  OtpVia,
  isPartnerContext,
  toProfile,
} from '../api/auth.api';
import { normalizeLegacyProfile, clearSession, setSessionExpiredHandler, apiErrorMessage } from '../api/axios';
import { notificationApi } from '../api/notification.api';
import { storage } from '../utils/storage';
import { store } from '../lib/store';
import { DEVICE_KEYS, SESSION_CACHE_KEYS, STORAGE_KEYS } from '../constants/app';
import { resetQueryCache } from '../lib/queryClient';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  profile: ProfileInfo | null;
  user: UserInfo | null;
}

export interface LoginResult {
  success: boolean;
  requiresContextSelection?: boolean;
  profiles?: ProfileInfo[];
  /**
   * An opaque handle to the pending multi-context sign-in — NOT a user id.
   *
   * The server used to return one for `POST /auth/select-context`, which was
   * removed because it minted tokens from a userId with no credential check.
   * The field name is kept so the existing login screen still compiles; what it
   * carries is a handle `selectContext` checks against the session actually
   * being held, so a picker left on screen through a second sign-in cannot
   * switch the newer session.
   */
  userId?: string;
  /** The account has no password and must sign in with a one-time code. */
  requiresOtp?: boolean;
  error?: string;
}

/**
 * What a login-code request tells the caller.
 *
 * `delivery` is present on every success, because the endpoint always answers
 * with one — it is how the screen says "check your WhatsApp" rather than the old
 * bare spinner, and how it knows which other transport to offer. It can never
 * describe a failure; the endpoint refuses to, so that a delivery report cannot
 * become an account-enumeration oracle.
 */
export interface LoginOtpResult {
  success: boolean;
  delivery?: LoginOtpRequestResponse;
  error?: string;
}

interface AuthContextType extends AuthState {
  /** `identifier` is an email OR a phone number — the server takes either. */
  login: (identifier: string, password: string) => Promise<LoginResult>;
  /**
   * Send a one-time sign-in code. Deliberately vague about whether the account
   * exists, but NOT about which transport was used — `via` pins that transport
   * for a retry, and the result carries what the server reported.
   */
  requestLoginOtp: (identifier: string, via?: OtpVia) => Promise<LoginOtpResult>;
  /** Verify a one-time sign-in code and open the session. */
  verifyLoginOtp: (identifier: string, code: string) => Promise<LoginResult>;
  /** Open a session from a Google ID token. Creates nothing. */
  loginWithGoogle: (idToken: string) => Promise<LoginResult>;
  /**
   * Pick one of several partner businesses. The first argument is the handle
   * from `LoginResult.userId`; `tenantId` + `role` identify the row that was
   * tapped. Kept at three arguments so `login.tsx` is untouched.
   */
  selectContext: (handle: string, tenantId: string, role: string) => Promise<void>;
  /**
   * Every partner business this session could switch to — the "switch shop"
   * menu's data, read by More's Account card.
   *
   * Populated by `applySession` AND by the cold-start rehydrate. The second half
   * used to be missing, and the consequence was not subtle: the list arrives on
   * the login and refresh responses, a restart replays neither, so after every
   * app restart this was `[]` and a partner with two businesses had to sign out
   * and back in to reach the other one. See the rehydrate effect.
   */
  availableContexts: ResolvedContext[];
  /**
   * Switch the LIVE session to another of this person's businesses.
   *
   * Distinct from `selectContext`, which finishes a half-done sign-in held in
   * `pending` and cannot be called once a session exists. This one addresses the
   * stored refresh token instead, so it works from anywhere in the signed-in
   * app. `contextId`, never the `tenantId` + `role` pair: somebody who is
   * PARTNER_ADMIN of one shop and PARTNER_STAFF of another has two contexts that
   * differ only by role, and a pair lookup returns whichever matched first.
   *
   * Rejects with a readable message; the caller shows it. On success everything
   * is torn down and rebuilt through `applySession`, cache included.
   */
  switchToContext: (contextId: string) => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * How long sign-out will wait for the server to acknowledge the device before
 * giving up on it. Short on purpose: `DELETE /notifications/devices` is a
 * courtesy, and a partner standing in a dead spot must not be held in a session
 * they have asked to leave while a request that cannot succeed runs its full
 * ceiling (`api/axios.ts` allows a minute for a cold instance).
 */
const UNREGISTER_TIMEOUT_MS = 5_000;

/**
 * Take this device off the shop's push list, as part of signing out.
 *
 * Without it, `usePushRegistration` leaves a live token registered against the
 * partner forever: a member of staff who signs out on their own phone keeps
 * receiving that shop's order and booking alerts on it indefinitely, with no
 * session left in the app to explain where they are coming from or to turn them
 * off. That is a privacy failure, not a missing nicety.
 *
 * Three things it must not do, all of them reasons this is written the way it
 * is rather than as a bare `await`:
 *
 *  - It must not run after `clearSession`. The endpoint is authenticated, so
 *    the access token has to still be there when the request goes out.
 *  - It must not block sign-out. Every failure is swallowed, and the wait is
 *    bounded — a partner must always be able to sign out.
 *  - It must not leave the local token behind. The stored token AND the scope
 *    it was registered under are both cleared, so the next person to sign in on
 *    this device re-registers instead of matching the cached pair in
 *    `usePushRegistration` and skipping the POST.
 */
async function unregisterPushDevice(): Promise<void> {
  const token = await store.get(DEVICE_KEYS.PUSH_TOKEN);
  if (!token) return;
  await Promise.race([
    notificationApi.unregisterDevice(token).catch((error: unknown) => {
      // The server may still hold the token. It is addressed by partner scope,
      // so the worst case is alerts for a shop this person no longer has a
      // session with — bad, but not a reason to trap them in that session.
      console.warn('[push] unregister on sign-out failed:', error);
    }),
    new Promise<void>((resolve) => setTimeout(resolve, UNREGISTER_TIMEOUT_MS)),
  ]);
  await store.remove(DEVICE_KEYS.PUSH_TOKEN);
  await store.remove(DEVICE_KEYS.PUSH_TOKEN_SCOPE);
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    token: null,
    profile: null,
    user: null,
  });
  const [availableContexts, setAvailableContexts] = useState<ResolvedContext[]>([]);

  /**
   * The half-finished sign-in behind a context picker.
   *
   * A ref rather than state: nothing renders from it, and it holds a refresh
   * token — putting it in state would put a credential into every render's
   * closure and into React DevTools for the whole time the modal is open.
   * Cleared the moment a context is chosen or the sign-in is abandoned.
   */
  const pending = useRef<{ handle: string; refreshToken: string; contexts: ResolvedContext[] } | null>(null);

  const applySession = useCallback(
    async (
      token: string,
      refreshToken: string,
      context: ResolvedContext,
      contexts: ResolvedContext[],
      user: UserInfo | null,
    ) => {
      const profile = toProfile(context);
      await storage.set(STORAGE_KEYS.ACCESS_TOKEN, token);
      await storage.set(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
      await storage.setObject(STORAGE_KEYS.USER_PROFILE, profile);
      if (user) await storage.setObject(STORAGE_KEYS.USER_INFO, user);
      // Before the state flips, not after: anything already mounted would
      // otherwise refetch against the OLD cache key and paint the previous
      // business's data for a frame. See `resetQueryCache`.
      resetQueryCache();
      pending.current = null;
      const partners = contexts.filter(isPartnerContext);
      setAvailableContexts(partners);
      /**
       * Written to disk as well as to state, because state does not survive a
       * cold start and this list has no other source at launch.
       *
       * AsyncStorage rather than SecureStore: this can be several businesses'
       * worth of JSON and SecureStore's Android backend refuses anything over
       * 2 KB — silently, in `storage.set`'s swallowed catch, which would make the
       * switch menu empty for exactly the partners who need it most. Nothing
       * secret goes here; see `SESSION_CACHE_KEYS`.
       *
       * Not awaited-on-failure: a write that fails costs an empty switch menu
       * until the next sign-in, and must never cost the sign-in itself.
       */
      void store.setJson(SESSION_CACHE_KEYS.AVAILABLE_CONTEXTS, partners);
      setState((s) => ({
        isAuthenticated: true,
        isLoading: false,
        token,
        profile,
        user: user ?? s.user,
      }));
    },
    [],
  );

  /**
   * Turn a login/OTP-verify response into either a session or a picker.
   *
   * Contexts that are not PARTNER are dropped rather than shown: this is the
   * partner app, and a resident flat is another product's screen entirely. If
   * nothing partner-shaped is left, the sign-in fails with a sentence that says
   * which app to open instead of a blank tab bar.
   */
  const consumeLogin = useCallback(
    async (data: {
      token: string;
      refreshToken: string;
      activeContext?: ResolvedContext;
      availableContexts?: ResolvedContext[];
      user?: UserInfo;
    }): Promise<LoginResult> => {
      const all = data.availableContexts ?? (data.activeContext ? [data.activeContext] : []);
      const partners = all.filter(isPartnerContext);

      if (partners.length === 0) {
        return {
          success: false,
          error:
            'This account does not have access to a partner business. Please use the ResiSmart Society app, or ask your administrator to add you.',
        };
      }

      // Already signed in to a partner business, and it is the only one — nothing
      // to ask about.
      const active = data.activeContext;
      if (partners.length === 1) {
        const only = partners[0];
        if (active && active.contextId === only.contextId) {
          await applySession(data.token, data.refreshToken, only, all, data.user ?? null);
          return { success: true };
        }
        // The server auto-selected something else (a flat, or an admin role).
        // Switch straight to the one business this person has rather than
        // showing a picker with a single row in it.
        const switched = await authApi.switchContext(data.refreshToken, only.contextId);
        await applySession(
          switched.data.token,
          switched.data.refreshToken,
          switched.data.activeContext,
          switched.data.availableContexts,
          data.user ?? null,
        );
        return { success: true };
      }

      const handle = `pending-${Date.now().toString(36)}`;
      pending.current = { handle, refreshToken: data.refreshToken, contexts: partners };
      return {
        success: false,
        requiresContextSelection: true,
        profiles: partners.map(toProfile),
        userId: handle,
      };
    },
    [applySession],
  );

  /**
   * Google, as a third way to prove the identity — never a way to create one.
   *
   * `consumeLogin` still applies the partner-only gate: an identity with no
   * partner context is refused here exactly as it is on the password path, so a
   * resident's Google account cannot open the shop app.
   */
  const loginWithGoogle = useCallback(
    async (idToken: string): Promise<LoginResult> => {
      try {
        const { data } = await authApi.loginGoogle(idToken);
        return await consumeLogin(data);
      } catch (err) {
        return {
          success: false,
          error: apiErrorMessage(err, 'Google sign-in failed. Please try again.'),
        };
      }
    },
    [consumeLogin],
  );

  const login = useCallback(
    async (identifier: string, password: string): Promise<LoginResult> => {
      try {
        const { data } = await authApi.login(identifier, password);
        return await consumeLogin(data);
      } catch (err) {
        // A partner identity created by the signup wizard is PASSWORDLESS —
        // `registerPartnerPublic` never sets a hash — so the server answers 401
        // with `useOtp: true`. Reporting that as "invalid credentials" would
        // tell a partner their password is wrong when they have never had one.
        const useOtp =
          typeof err === 'object' &&
          err !== null &&
          'response' in err &&
          (err as { response?: { data?: { useOtp?: boolean } } }).response?.data?.useOtp === true;
        if (useOtp) {
          return {
            success: false,
            requiresOtp: true,
            error: 'This account signs in with a one-time code. We can send you one now.',
          };
        }
        return { success: false, error: apiErrorMessage(err, 'Login failed. Please try again.') };
      }
    },
    [consumeLogin],
  );

  const requestLoginOtp = useCallback(
    async (identifier: string, via: OtpVia = 'auto'): Promise<LoginOtpResult> => {
      try {
        const { data } = await authApi.loginOtpRequest(identifier, via);
        // Forwarded whole. The screen needs the server's SENTENCE (it names the
        // transport) and the transport itself (it decides which "try the other
        // way" button to offer) — deriving either on the client would be the
        // client guessing at delivery again, which is the bug being fixed.
        return { success: true, delivery: data };
      } catch (err) {
        // No 502 branch: this endpoint answers 200 for everybody by design, so
        // anything thrown here is a 429, a 400 or the network — never "we could
        // not deliver". See `LoginOtpRequestResponse`.
        return { success: false, error: apiErrorMessage(err, 'Could not send the code. Please try again.') };
      }
    },
    [],
  );

  const verifyLoginOtp = useCallback(
    async (identifier: string, code: string): Promise<LoginResult> => {
      try {
        const { data } = await authApi.loginOtpVerify(identifier, code);
        return await consumeLogin(data);
      } catch (err) {
        return { success: false, error: apiErrorMessage(err, 'That code did not work. Please try again.') };
      }
    },
    [consumeLogin],
  );

  const selectContext = useCallback(
    async (handle: string, tenantId: string, role: string) => {
      const held = pending.current;
      if (!held || held.handle !== handle) {
        throw new Error('This sign-in has expired. Please sign in again.');
      }
      const chosen = held.contexts.find((c) => c.tenantId === tenantId && c.role === role);
      if (!chosen) throw new Error('That business is no longer available on this account.');

      const { data } = await authApi.switchContext(held.refreshToken, chosen.contextId);
      await applySession(
        data.token,
        data.refreshToken,
        data.activeContext,
        data.availableContexts,
        null,
      );
    },
    [applySession],
  );

  /**
   * Move the live session to another of this person's businesses.
   *
   * `/auth/refresh-token` is the ONE endpoint that does this — "which business
   * am I in" and "give me a fresh token" are the same operation server-side —
   * so a switch is a refresh with a `contextId` on it, and it needs the stored
   * refresh token rather than the `pending` handle a first sign-in uses.
   *
   * `applySession` does the rest, and the order inside it is what makes this
   * safe: the query cache is cleared BEFORE `isAuthenticated`/`profile` flip, so
   * nothing mounted can paint the previous business's bookings for a frame. That
   * is gate 6, and it is the whole reason this is not a bare `setState`.
   *
   * The push token is re-registered by `usePushRegistration` on its own, off the
   * changed `partnerId` — without that the partner would keep getting the first
   * shop's alerts and none of the second's.
   */
  const switchToContext = useCallback(
    async (contextId: string) => {
      const refreshToken = await storage.get(STORAGE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) {
        throw new Error('Your session has expired. Please sign in again.');
      }
      try {
        const { data } = await authApi.switchContext(refreshToken, contextId);
        if (!isPartnerContext(data.activeContext)) {
          throw new Error('That is not a partner business this app can open.');
        }
        await applySession(
          data.token,
          data.refreshToken,
          data.activeContext,
          data.availableContexts,
          null, // the person has not changed — `applySession` keeps the held `user`
        );
      } catch (err) {
        // Rethrown as a sentence rather than swallowed: the caller has a modal
        // open and has to say why nothing happened. An axios error surfaced raw
        // here would read "Request failed with status code 401" on a shop's till.
        throw new Error(apiErrorMessage(err, 'Could not switch business. Please try again.'));
      }
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    pending.current = null;
    /**
     * Clear Google's own cached account too, or the next tap signs the previous
     * person back in with no chooser — on a shop's shared counter tablet that is
     * one member of staff acting as another. Never throws.
     */
    await forgetGoogle();
    await unregisterPushDevice();
    await clearSession(false); // we are the ones ending it — no need to be told
    resetQueryCache();
    // `clearSession` only wipes the four SecureStore keys. The cached shop list
    // lives in AsyncStorage and has to be removed by name, or the next person to
    // sign in on this counter tablet reads the previous account's businesses.
    await store.remove(SESSION_CACHE_KEYS.AVAILABLE_CONTEXTS);
    setAvailableContexts([]);
    setState({ isAuthenticated: false, isLoading: false, token: null, profile: null, user: null });
    // Deliberately no `router.replace`. `app/_layout.tsx` wraps the two route
    // groups in `Stack.Protected`, so flipping `isAuthenticated` unmounts `(app)`
    // and redirects on its own. Navigating here as well would push at a route
    // that is being removed in the same commit of the render, which expo-router
    // reports as a navigation to a non-existent screen.
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = await storage.get(STORAGE_KEYS.ACCESS_TOKEN);
        // A profile stored before the SHOP → PARTNER rename still says
        // `SHOP_ADMIN` / `SHOP`; normalize on the way out of SecureStore so the
        // rehydrated session is indistinguishable from a freshly logged-in one.
        // Overlaid rather than replaced so fields the normalizer does not know
        // about — `tenantName` — survive. See normalizeLegacyProfile.
        const stored = await storage.getObject<ProfileInfo>(STORAGE_KEYS.USER_PROFILE);
        const normalized = normalizeLegacyProfile(stored);
        const profile: ProfileInfo | null = stored && normalized ? { ...stored, ...normalized } : null;
        const user = await storage.getObject<UserInfo>(STORAGE_KEYS.USER_INFO);

        if (token && profile) {
          /**
           * The shop list, restored with the rest of the session.
           *
           * This was the missing half of `availableContexts`. `applySession`
           * populates it, and only `applySession` did — so it was correct for
           * exactly as long as the process lived, and `[]` after every cold
           * start. A partner with two businesses therefore found the "Switch
           * business" row empty every morning, and signing out and back in was
           * the only way to reach their second shop.
           *
           * Read from disk rather than re-fetched. The list only arrives on a
           * login or a refresh response, and firing a refresh here to get it
           * would rotate the refresh token on every launch — racing the axios
           * interceptor, which does the same thing on the first 401. A cached
           * list can be stale (a business added on the web will not appear until
           * the next sign-in or switch, both of which rewrite it), and a stale
           * menu is a far cheaper failure than a session that logs itself out.
           *
           * Filtered again on the way in: what is on disk was written by this
           * build, but a value from an older one predates the partner-only rule.
           */
          const cached = await store.getJson<ResolvedContext[]>(SESSION_CACHE_KEYS.AVAILABLE_CONTEXTS);
          if (Array.isArray(cached)) setAvailableContexts(cached.filter(isPartnerContext));
          setState({ isAuthenticated: true, isLoading: false, token, profile, user });
        } else {
          setState((s) => ({ ...s, isLoading: false }));
        }
      } catch {
        setState((s) => ({ ...s, isLoading: false }));
      }
    })();
  }, []);

  /**
   * The axios interceptor clears SecureStore when a 401 cannot be refreshed, but
   * clearing storage is not signing out: without this the provider went on
   * reporting `isAuthenticated: true` over an empty keychain, every screen
   * stayed mounted, and every request after it failed unauthenticated with no
   * way back except killing the app.
   */
  useEffect(() => {
    setSessionExpiredHandler(() => {
      pending.current = null;
      resetQueryCache();
      // Same reasoning as `logout` — the AsyncStorage copy is not covered by the
      // interceptor's `clearSession`.
      void store.remove(SESSION_CACHE_KEYS.AVAILABLE_CONTEXTS);
      setAvailableContexts([]);
      setState({ isAuthenticated: false, isLoading: false, token: null, profile: null, user: null });
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        availableContexts,
        login,
        requestLoginOtp,
        verifyLoginOtp,
        loginWithGoogle,
        selectContext,
        switchToContext,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
