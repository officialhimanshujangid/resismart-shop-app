import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  authApi,
  ProfileInfo,
  UserInfo,
  ResolvedContext,
  isPartnerContext,
  toProfile,
} from '../api/auth.api';
import { normalizeLegacyProfile, clearSession, setSessionExpiredHandler, apiErrorMessage } from '../api/axios';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../constants/app';
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

interface AuthContextType extends AuthState {
  /** `identifier` is an email OR a phone number — the server takes either. */
  login: (identifier: string, password: string) => Promise<LoginResult>;
  /** Send a one-time sign-in code. Deliberately vague about whether the account exists. */
  requestLoginOtp: (identifier: string) => Promise<{ success: boolean; devCode?: string; error?: string }>;
  /** Verify a one-time sign-in code and open the session. */
  verifyLoginOtp: (identifier: string, code: string) => Promise<LoginResult>;
  /**
   * Pick one of several partner businesses. The first argument is the handle
   * from `LoginResult.userId`; `tenantId` + `role` identify the row that was
   * tapped. Kept at three arguments so `login.tsx` is untouched.
   */
  selectContext: (handle: string, tenantId: string, role: string) => Promise<void>;
  /** Every partner business this session could switch to, for a "switch shop" menu. */
  availableContexts: ResolvedContext[];
  logout: () => Promise<void>;
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
      setAvailableContexts(contexts.filter(isPartnerContext));
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

  const requestLoginOtp = useCallback(async (identifier: string) => {
    try {
      const { data } = await authApi.loginOtpRequest(identifier);
      return { success: true, devCode: data.devCode };
    } catch (err) {
      return { success: false, error: apiErrorMessage(err, 'Could not send the code. Please try again.') };
    }
  }, []);

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

  const logout = useCallback(async () => {
    pending.current = null;
    await clearSession(false); // we are the ones ending it — no need to be told
    resetQueryCache();
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
        selectContext,
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
