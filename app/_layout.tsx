import React from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { AppLightTheme, AppDarkTheme } from '../src/constants/theme';
import { LoadingOverlay } from '../src/components/LoadingOverlay';
import { queryClient } from '../src/lib/queryClient';
import { useOnboardingGate } from '../src/hooks';

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
 * true until then, and nothing is rendered while it is. Deciding the guard on a
 * half-restored session is exactly how an already-signed-in partner gets shown
 * the login screen for a moment on every cold start.
 */
function RootNavigator() {
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

  if (isLoading || resolving) {
    return <LoadingOverlay visible message="Starting up..." />;
  }

  const inApp = isAuthenticated && !needsOnboarding;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={inApp}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!inApp}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? AppDarkTheme : AppLightTheme;

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
            <AuthProvider>
              <StatusBar style={isDark ? 'light' : 'dark'} />
              <RootNavigator />
            </AuthProvider>
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
