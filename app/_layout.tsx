import '@/lib/web-alert';
// Light/dark follows the phone (app.json userInterfaceStyle: automatic). The 1R
// forced-light import was removed on 2026-10-10 (E-VISUAL-APPS): every shop screen
// passed the END dark scan — see resismart-backups/audit/END-VISUAL-APPS.md.
import React, { useEffect, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { initI18n, deviceLanguage } from '../src/i18n';
import { loadStoredLanguage } from '../src/i18n/useLanguage';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { AppLightTheme, AppDarkTheme } from '../src/constants/theme';
import { LoadingOverlay } from '../src/components/LoadingOverlay';
import { queryClient } from '../src/lib/queryClient';
import { useOnboardingGate } from '../src/hooks';
import { useAppFonts } from '../src/theme/fonts';
import { ToastProvider } from '../src/components/ui/Toast';

/**
 * Which half of the app exists, decided by `Stack.Protected`.
 *
 * `Protected` (expo-router 6) removes the group from the navigator entirely when
 * its guard is false and redirects anybody standing on it. That replaces the
 * `useEffect(() => router.replace(...))` this file used to run, which had two
 * problems worth naming: it fired AFTER the first paint, so a signed-out launch
 * rendered a frame of the app shell before bouncing to login, and it navigated
 * imperatively from an effect that could run before the navigator had mounted.
 *
 * The session is restored from SecureStore before any of this — `isLoading` is
 * true until then, and the navigator is not built yet while it is. Deciding the
 * guard on a half-restored session is exactly how an already-signed-in partner
 * gets shown the login screen for a moment on every cold start.
 *
 * ── The splash is COMPOSED, never substituted ─────────────────────────────
 *
 * `resolving` used to `return <LoadingOverlay/>` in place of the `<Stack>`, and
 * that one line cost a partner their whole registration. `applySession` clears
 * the query cache BEFORE it flips `isAuthenticated`, so the entitlements request
 * is gone and `resolving` goes false → true on a navigator that is already
 * mounted: the tree was torn down and replaced by a spinner over an empty root
 * view, taking every screen's React state with it. `LoadingOverlay` is a
 * `<Modal>`, so it composes over the navigator instead — nothing here may ever
 * unmount the navigator to show a splash again.
 *
 * The splash still stands ALONE before the navigator has been built once, and
 * that is not the same thing: at that point there is no tree to destroy, and
 * mounting a half of the app to answer a question that is about to be answered
 * costs a real request on every cold start — `(auth)` would open the wizard,
 * which asks `/me/onboarding-status`, an endpoint a member of staff is 403'd
 * from. `booted` is the difference between "not built yet" and "built, and now
 * being asked again".
 */
function RootNavigator() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  /**
   * A partner whose registration is unfinished is held in `(auth)`, where the
   * wizard lives — that is what makes the wizard resumable across sessions and
   * across devices, not just across screens. `useOnboardingGate` reads the
   * answer off the entitlements request the app makes anyway, and fails OPEN
   * (see its header): an unknown answer keeps them in the app rather than
   * dropping a trading business into a signup form.
   */
  const { resolving, needsOnboarding } = useOnboardingGate(isAuthenticated);

  /**
   * A one-way latch: false until the navigator has rendered, true forever after.
   *
   * Written during render on purpose — it is idempotent, nothing reads it before
   * it is set, and the alternative (state plus an effect) would add a render
   * pass to the launch path to answer a question the render itself already knows.
   */
  const booted = useRef(false);
  if (!booted.current && (isLoading || resolving)) {
    return <LoadingOverlay visible message={t('common.startingUp')} />;
  }
  booted.current = true;

  /**
   * `resolving` holds the partner in `(auth)`, it does not send them to `(app)`.
   *
   * The fail-open in `useOnboardingGate` is about the ANSWER — an entitlements
   * call that failed must not throw a trading business into a signup form — and
   * it still is: `needsOnboarding` is false there, so the moment the request
   * settles, either way, this reads it. The PENDING state is a different
   * question. It is only reachable after `booted` (a fresh sign-in, which clears
   * the cache), and guessing `(app)` for it would open the SSE stream and
   * register a push token for a business that is about to turn out to be a
   * DRAFT. `(auth)` is the cheaper half to be wrong in — the partner is standing
   * on a screen there already — and the overlay covers the guess either way.
   */
  const inApp = isAuthenticated && !resolving && !needsOnboarding;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={inApp}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!inApp}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <LoadingOverlay visible={resolving} message={t('common.startingUp')} />
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? AppDarkTheme : AppLightTheme;

  /**
   * Seed the language from the partner's stored choice (else the phone's) before
   * ANY screen renders a string.
   *
   * Held rather than defaulted-then-corrected. i18next re-renders on
   * `languageChanged`, so initialising in English and switching a tick later
   * would "work" — and would flash English at a Hindi reader on every cold
   * start, on the login screen, which is the one screen a partner who does not
   * read English most needs in their own language. The cost of holding is a
   * single AsyncStorage read.
   */
  const [languageReady, setLanguageReady] = useState(false);
  useEffect(() => {
    (async () => {
      const stored = await loadStoredLanguage();
      initI18n(stored ?? deviceLanguage());
      setLanguageReady(true);
    })();
  }, []);

  /**
   * Design System v1: Sora for titles and money. Held like the language — a
   * title that swaps face a frame after it paints is a visible jump — but it
   * never blocks for long: `useAppFonts` resolves on load, on error, or after
   * 2.5 s, and every Sora style falls back to the system face.
   */
  const fontsReady = useAppFonts();

  if (!languageReady || !fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/*
          The QueryClientProvider sits ABOVE AuthProvider on purpose: the auth
          layer clears the cache on sign-in, sign-out and every context switch
          (`resetQueryCache`), so it has to be inside a tree where a client
          already exists.
        */}
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={theme}>
            <ToastProvider>
              <AuthProvider>
                <StatusBar style={isDark ? 'light' : 'dark'} />
                <RootNavigator />
              </AuthProvider>
            </ToastProvider>
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
