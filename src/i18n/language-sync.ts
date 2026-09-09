import i18n, { Language, SUPPORTED } from './index';
import { apiClient } from '../api/axios';
import { STORAGE_KEYS } from '../constants/app';
import { storage } from '../utils/storage';

/**
 * Tell the SERVER which language this partner reads.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not how the screen switches language — that is `useLanguage()`, backed
 * by i18next and AsyncStorage, and it must stay instant and offline. Nothing
 * here delays it, undoes it, or can make it fail. `DEVICE_KEYS.LANGUAGE` remains
 * the device's own answer and survives sign-out; this only mirrors it upward.
 *
 * WHY IT HAS TO EXIST
 * -------------------
 * The backend writes every notification, email and WhatsApp template in two
 * languages (`backend/src/constants/notification-copy.ts`) and picks per
 * recipient by reading `User.language` (`messaging.service.ts:808`). The only
 * writer of that field is `PATCH /me/language`
 * (`backend/src/routes/me.routes.ts:25`). A partner whose counter phone has been
 * in Hindi since it was unboxed is otherwise sent English booking alerts, English
 * payment reminders and an English plan-expiry warning, forever.
 *
 * It also fixes the OTP, which is sent BEFORE any session exists: the server
 * keeps a phone→language map (`languagesByPhone`) built from this same field, so
 * a partner who has signed in once in Hindi gets their next login code in Hindi.
 *
 * WHEN IT FIRES
 * -------------
 *   • the language changed, via i18next's own `languageChanged` event — the same
 *     signal `useLanguage()` renders from, so the settings row is covered without
 *     knowing anything about this file,
 *   • a session was just established (`applySession`),
 *   • a stored session was rehydrated on cold start.
 *
 * The last two are the recovery path. `confirmed` is memory-only on purpose: a
 * call that never left the phone leaves it unset, so the next launch asserts the
 * preference again. A "synced" flag on disk would be the version that loses a
 * preference permanently the one time the request dies in flight.
 *
 * SIGNED OUT, NOTHING HAPPENS. `PATCH /me/language` is authenticated, and a 401
 * in this app is not free: `axios.ts` routes it through the single-flight refresh
 * and a failed refresh can force a sign-out. The token check below is a guard
 * against spending a refresh token on a preference, not politeness.
 *
 * CONTEXT SWITCHES ARE NOT SIGN-OUTS. `switchContext` re-runs `applySession`
 * with the same person behind it, so the second call answers from `confirmed`
 * without touching the network. Only `resetLanguageSync()` — on a real sign-out —
 * clears that, because the next partner on this phone is a different `User` row.
 */

/**
 * What the server has confirmed it stored, this process only.
 *
 * Taken from the response echo rather than from what was sent: the controller
 * folds regional tags (`hi-IN` → `hi`) via `normalizeLanguage` and answers with
 * what it actually wrote.
 */
let confirmed: Language | null = null;

/** In-flight guard, so repeated taps on the toggle send one call per settle. */
let inFlight: Language | null = null;

/**
 * Which request is the current answer.
 *
 * Two taps in quick succession put two PATCHes in the air and they can come back
 * in either order. Without this, the `hi` response could land last and record
 * `confirmed = 'hi'` for a partner now reading English — and `confirmed` is
 * exactly what stops the next launch from correcting it. Only the newest request
 * may record anything; an overtaken one records nothing, so the preference is
 * re-asserted rather than remembered wrong.
 */
let latest = 0;

let subscribed = false;

const asLanguage = (raw: unknown): Language | null =>
  (typeof raw === 'string' && (SUPPORTED as readonly string[]).includes(raw) ? (raw as Language) : null);

/**
 * Forget what the server knows. Called on sign-out — a counter phone is shared,
 * and the next person to sign in is a different `User` row whose own preference
 * must not be skipped because the last one's had already been sent.
 */
export function resetLanguageSync(): void {
  confirmed = null;
  inFlight = null;
}

/**
 * Send the current language, unless there is nothing to say.
 *
 * Returns `void`, not a promise, so nothing can be made to wait on it.
 */
export function syncLanguage(): void {
  const language = asLanguage(i18n.language);
  if (!language) return;
  if (confirmed === language || inFlight === language) return;

  inFlight = language;
  const seq = ++latest;
  void (async () => {
    try {
      const token = await storage.get(STORAGE_KEYS.ACCESS_TOKEN);
      if (!token) return;
      const { data } = await apiClient.patch('/me/language', { language });
      if (seq !== latest) return; // overtaken — see `latest`
      confirmed = asLanguage(data?.data?.language) ?? language;
    } catch {
      // A shop counter is a basement with one bar of signal. The phone is
      // already in the language the partner picked and stays that way;
      // `confirmed` is untouched, so the next launch or sign-in tries again.
      // Nothing here is worth interrupting a sale with.
    } finally {
      if (inFlight === language) inFlight = null;
    }
  })();
}

/**
 * Watch i18next so every future language change reaches the server too.
 *
 * Started from the AuthContext once a session exists rather than at import, so a
 * toggle tapped before sign-in cannot fire an authenticated call. Idempotent,
 * and never torn down — `syncLanguage` reads the token on every call, so it goes
 * quiet by itself the moment the partner signs out.
 */
export function startLanguageSync(): void {
  if (subscribed) return;
  subscribed = true;
  i18n.on('languageChanged', () => syncLanguage());
}
