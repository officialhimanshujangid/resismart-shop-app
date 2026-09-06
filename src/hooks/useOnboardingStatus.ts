import { useQuery } from '@tanstack/react-query';
import { partnerApi, OnboardingStatus } from '../api/partner.api';
import { qk } from '../lib/queryKeys';

/**
 * Where the partner got to in the signup wizard, read from the SERVER on mount.
 *
 * This is the whole reason the wizard is resumable. The web version shipped
 * without it and it became an audit finding: step 1 → 2 is exactly where a
 * signup funnel leaks, because step 1 creates the business and step 2 is where
 * the partner puts the phone down. If reopening the app starts them at step 1
 * again, everything typed after it is typed twice, and the second attempt is the
 * one where they give up.
 *
 * Both halves of the answer are computed from the stored partner document —
 * `onboardingStep` is the pointer, `missing[]` is what is actually still empty —
 * so the resume point survives a reinstall and follows the partner between
 * devices. Local state is never the authority here; it cannot be, because the
 * answer has to be right on a phone the wizard has never run on. Which of the
 * two `resumeStep` believes, and why, is spelled out on it below.
 */
export function useOnboardingStatus(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: qk.onboarding.status(),
    queryFn: () => partnerApi.onboardingStatus(),
    enabled: options?.enabled ?? true,
    // Always re-asked on mount. A cached step is precisely the thing that would
    // put somebody back on a screen they finished on another device.
    staleTime: 0,
  });

  return {
    status: query.data,
    loading: query.isPending,
    error: query.error,
    refresh: query.refetch,
  };
}

/**
 * The step to open: the first one with something still missing, and step 5 when
 * there is nothing.
 *
 * Read from `missing[]` rather than from `onboardingStep`, for EVERY status —
 * the same rule the web wizard's `landingStep` applies, and it is the correct
 * one. The stored pointer only says how far somebody got, not whether what they
 * left behind is usable: `register-public` writes steps 1 and 2 with a
 * placeholder address and a pointer of 1, so a partner whose only real gaps are
 * the map pin and their categories was being dropped on step 1 to retype the
 * business name they had just typed.
 *
 * This used to be first-gap for REJECTED only, guarded by a worry about
 * retyping. That worry is already answered: every step prefills from
 * `GET /partners/me/partner`, so a step opened early is a step already filled
 * in, and the rail (see `register.tsx`) reaches all five once the account
 * exists — nothing here is a one-way door.
 */
export function resumeStep(status: OnboardingStatus | undefined): number {
  if (!status) return 1;
  const gaps = status.missing.map((m) => m.step).filter((s) => s >= 1 && s <= 5);
  // Nothing missing means there is nothing to send them back for — step 5 is
  // where the submit button is.
  if (!gaps.length) return 5;
  return Math.min(...gaps);
}
