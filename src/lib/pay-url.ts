/**
 * PARITY (PAY-E Phase C skip, same as mobile-society `features/finance/pay-url.ts`) —
 * a bill-ready / reminder push for a shop unit carries its public pay link as
 * `data.payUrl` (`<web>/pay/b/<token>`, backend `society-pay-notice.payPushData`).
 * Tapping the push opens that page directly, so the bill is paid in one tap.
 *
 * Only an http(s) URL whose path is a bill pay link is accepted — a push can never
 * make the app open an arbitrary scheme (`upi://`, `javascript:`) or another page.
 */
export function payUrlFromPush(data: unknown): string | null {
  const raw = (data as { payUrl?: unknown } | null | undefined)?.payUrl;
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  const m = /^https?:\/\/[^/\s?#]+(\/[^\s?#]*)?/i.exec(raw.trim());
  if (!m) return null;
  const path = m[1] || '';
  return /^\/pay\/b\/[A-Za-z0-9._~-]+\/?$/.test(path) ? raw.trim() : null;
}
