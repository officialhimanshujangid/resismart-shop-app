/**
 * The completion-code panel's state, as pure arithmetic.
 *
 * The server's `completionCode` (`{attemptsLeft, resendsLeft, canResend}`) is
 * the truth; this only folds a refusal from `POST /:id/complete` into it while
 * the fresh booking is being fetched, so the panel never says "5 tries left"
 * straight after the fifth wrong code.
 *
 * Codes and params (`marketplace-error-codes.ts`):
 *   BOOKING_CODE_WRONG   {attemptsLeft}
 *   BOOKING_CODE_LOCKED  {attemptsLeft: "0"} — only a new code gets out of it
 *   BOOKING_CODE_NOT_SENT
 */

export interface CodePanelState {
  attemptsLeft: number;
  resendsLeft: number;
  canResend: boolean;
}

export const CODE_REFUSALS = new Set([
  'BOOKING_CODE_WRONG',
  'BOOKING_CODE_LOCKED',
  'BOOKING_CODE_NOT_SENT',
  'BOOKING_CODE_RESEND_LIMIT',
  'BOOKING_CODE_RESEND_NOT_NEEDED',
]);

/** True for a refusal the code panel shows in place, instead of an alert. */
export const isCodeRefusal = (code: string | undefined): boolean => !!code && CODE_REFUSALS.has(code);

/** The state after a refusal, before the server's fresh view arrives. */
export function afterRefusal(
  prev: CodePanelState | undefined,
  code: string | undefined,
  params: Record<string, unknown> | undefined,
): CodePanelState | undefined {
  if (!prev) return prev;
  if (code === 'BOOKING_CODE_LOCKED') return { ...prev, attemptsLeft: 0 };
  if (code === 'BOOKING_CODE_WRONG') {
    const n = Number(params?.attemptsLeft);
    return Number.isFinite(n) && n >= 0 ? { ...prev, attemptsLeft: n } : prev;
  }
  if (code === 'BOOKING_CODE_RESEND_LIMIT') return { ...prev, resendsLeft: 0, canResend: false };
  return prev;
}

/** Locked: no tries left, so the only way on is a new code (or support). */
export const isLocked = (s: CodePanelState | undefined): boolean => !!s && s.attemptsLeft <= 0;
