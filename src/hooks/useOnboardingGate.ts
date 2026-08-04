import { usePartnerEntitlements } from './usePartnerEntitlements';

/**
 * Does this signed-in partner still belong in the registration wizard?
 *
 * The wizard is resumable across SESSIONS, not just across screens, and that is
 * what this answers. `registerPartnerPublic` creates the business at step 1 and
 * signs the partner in immediately — everything after that is four more screens
 * with a document upload in it, and the partner who closes the app on step 2 is
 * the normal case, not the edge one. Without this they would sign back in to an
 * app with one tab and no way to finish; with it they land back on the step the
 * SERVER remembers, on whatever device they pick up.
 *
 * The answer comes from `entitlements.business`, which the same one cached
 * request already carries — no second call.
 *
 * ── Which way it fails ────────────────────────────────────────────────────
 *
 * This one gate fails OPEN, and it is the only one in the app that does. Every
 * other gate answers "may I see this?", where the safe default is no. This one
 * answers "should I be thrown out of the app and into a signup form?", where a
 * wrong "yes" takes a live, trading partner and puts them in front of a
 * registration wizard for a business that is already registered. So an
 * unresolved or failed answer means "stay in the app", where the Today screen
 * explains what it can. The wizard's own endpoints refuse a partner who is past
 * DRAFT anyway (`EDITABLE_ONBOARDING_STATUSES`), so nothing is actually
 * reachable that should not be.
 */
export interface OnboardingGate {
  /** No answer yet. Show a splash rather than guessing — either guess flashes. */
  resolving: boolean;
  /** Send them to `(auth)/register`, which resumes at the saved step. */
  needsOnboarding: boolean;
}

export function useOnboardingGate(enabled: boolean): OnboardingGate {
  // `enabled` is passed through rather than only checked below: this hook runs
  // in the ROOT layout, which is mounted while signed out too, and
  // `/partners/me/entitlements` needs a session. Fired without one it 401s, and
  // the unrecoverable branch of that 401 clears SecureStore — the login screen
  // would be signing people out in the background.
  const { entitlements, ready, failed } = usePartnerEntitlements({ enabled });

  if (!enabled) return { resolving: false, needsOnboarding: false };
  if (!ready && !failed) return { resolving: true, needsOnboarding: false };

  const business = entitlements.business;
  // DRAFT — never submitted. REJECTED — sent back to be corrected, and
  // `EDITABLE_ONBOARDING_STATUSES` lets them re-open the form precisely so they
  // do not register a second time under a slightly different name.
  //
  // PENDING is deliberately NOT here: the profile is with a reviewer, the
  // partner has nothing left to do, and dropping them back into the wizard would
  // invite them to edit a submission somebody is currently looking at.
  const needsOnboarding = business?.status === 'DRAFT' || business?.status === 'REJECTED';

  return { resolving: false, needsOnboarding: Boolean(needsOnboarding) };
}
