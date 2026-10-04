import React from 'react';
import { Stack } from 'expo-router';

import { useAuth } from '../../src/context/AuthContext';

/**
 * The signed-out half — plus the one screen that outlives signing in.
 *
 * `register` is the wizard, and it is deliberately NOT protected. Step 1 runs
 * with no session (it is what creates the business) and steps 2–5 run with one
 * (`PARTNER_PROPRIETOR_CHAIN`), so it is the only screen in the app that has to
 * exist on both sides of the session flipping. The root layout keeps this whole
 * group mounted for a DRAFT or REJECTED partner precisely so it can.
 *
 * ── Why the other three are behind a guard ────────────────────────────────
 *
 * This is what carries a partner from the sign-in code back into the wizard,
 * and it is declarative because the imperative version does not work: nothing
 * could `router.replace` them, because `verify-otp` deliberately does not
 * navigate (the root guards own that), and the root guards could not do it
 * either — registration creates the partner in DRAFT, so `needsOnboarding` is
 * true both BEFORE and AFTER the code is verified and the group they are
 * standing in never changes.
 *
 * So the swap happens one level down. When the session opens, `login`,
 * `forgot-password` and `verify-otp` leave the navigator; `register` is the only
 * route name left, so React Navigation drops the removed routes from the stack
 * and lands on it (`StackRouter.getStateForRouteNamesChange`). The wizard was
 * already mounted underneath — the partner pushed `verify-otp` from it — so it
 * keeps its state rather than being rebuilt.
 *
 * The three of them being unreachable while signed in is also correct on its own
 * terms: a sign-in screen for a session that already exists is a way to get a
 * second one.
 */
export const unstable_settings = {
  /**
   * The deterministic landing spot when the stack has to be rebuilt from
   * nothing — a cold start, or a group that was removed and came back. Without
   * it the answer is "whichever screen sorted first", which is how a signed-out
   * launch could open on a wizard rather than on the sign-in screen.
   *
   * When `login` itself is guarded away the router falls through to the only
   * remaining name, which is `register` — the wizard, which is where a
   * signed-in partner who still has one belongs.
   */
  anchor: 'login',
};

export default function AuthLayout() {
  const { isAuthenticated } = useAuth();

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="verify-otp" />
        {/* M01 audit — #46 "Restore my account" (signed out until the restore signs in). */}
        <Stack.Screen name="restore-account" />
      </Stack.Protected>
      <Stack.Screen name="register" />
    </Stack>
  );
}
