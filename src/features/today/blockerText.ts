import type { PartnerVisibilityBlocker } from '../../api/partner.api';

/**
 * A visibility blocker's sentence in the READER's language (M04-H, web parity).
 *
 * The server writes every blocker `message` in English only
 * (`partner-browse.service.ts#partnerVisibility`), so a Hindi reader of the
 * Today banner got an English sentence under a Hindi heading. The web panel
 * already maps the stable `code` to its own catalogue sentence
 * (`PartnerVisibilityAlert.tsx`, `partner.visibility.blocker.*`); this is the
 * same map, with the same words, for the app.
 *
 * The FALLBACK is the server's own `message`: a code added on the server after
 * this build ships still renders a true sentence instead of a dotted key.
 */
export function blockerText(
  b: Pick<PartnerVisibilityBlocker, 'code' | 'message'>,
  t: (key: string) => string,
  exists: (key: string) => boolean,
): string {
  const key = `today.blocker.${b.code}`;
  return exists(key) ? t(key) : b.message;
}
