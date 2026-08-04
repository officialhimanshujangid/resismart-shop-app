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
 * `partner.onboardingStep` is stored server-side and never moves backwards, so
 * the resume point survives a reinstall and follows the partner between devices.
 * Local state is never the authority here — it cannot be, because the answer has
 * to be right on a phone the wizard has never run on.
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
 * The step to open, clamped into range.
 *
 * The server stores 1–5 and never decreases it, but the clamp is not
 * defensive noise: `submit-for-review` sets it to 5, and a rejected partner
 * comes back with a `missing[]` list whose FIRST gap is the screen they should
 * actually land on — being dropped on step 5 with a fault on step 2 is a dead
 * end for somebody who does not know the form.
 */
export function resumeStep(status: OnboardingStatus | undefined): number {
  if (!status) return 1;
  const firstGap = status.missing.length
    ? Math.min(...status.missing.map((m) => m.step))
    : undefined;
  const saved = Math.min(5, Math.max(1, status.step || 1));
  // A rejected profile is being corrected, so go where the correction is. A
  // DRAFT is being filled in, so go where they left off.
  if (status.verificationStatus === 'REJECTED' && firstGap) return firstGap;
  return saved;
}
