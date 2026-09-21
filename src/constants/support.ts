/**
 * ResiSmart's published support line, used by the Help screen's WhatsApp button.
 *
 * SOURCE OF TRUTH: `frontend/src/lib/landing.ts` (`supportPhoneE164`,
 * `supportHours`). This is a copy because the mobile app cannot import from the
 * web project — if the number or hours change there, change them here too.
 *
 * The hours are NOT a constant here: they are shown in the partner's language,
 * so they live in the catalogues as `help.supportHours` (en: "Mon–Sat,
 * 10:00–19:00 IST"). Keep that text in step with `supportHours` on the web.
 */

/** E.164 digits only, no "+" — the form wa.me expects. */
export const SUPPORT_PHONE_E164 = '917976426576';

/** A wa.me link that opens a chat with support, message pre-filled. */
export function supportWhatsAppUrl(message: string): string {
  return `https://wa.me/${SUPPORT_PHONE_E164}?text=${encodeURIComponent(message)}`;
}
