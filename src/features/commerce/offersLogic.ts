/**
 * Small pure helpers for the Offers screens (list, editor, detail). Kept out of
 * the foundation `logic.ts` (owned by the orchestrator) and out of the route
 * files (expo-router wants only a default export there).
 */
import type { OfferForm, OfferFormErrors, OfferState } from './logic';
import type { OfferChannel, OfferView } from './types';

type T = (key: string, options?: Record<string, unknown>) => string;

/** The chip colour of each offer state. */
export const OFFER_STATE_TONE: Record<OfferState, 'good' | 'info' | 'neutral' | 'warn'> = {
  RUNNING: 'good', NOT_STARTED: 'info', EXPIRED: 'neutral', USED_UP: 'neutral', ENDED: 'neutral', PAUSED: 'warn',
};

/** A–Z and 2–9 without the look-alikes 0/O and 1/I. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** "Make a code": six easy-to-read characters. */
export function makeCouponCode(random: () => number = Math.random, length = 6): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return out;
}

/** What is typed into the code box → upper case, A–Z/0–9 only, at most 16. */
export const cleanCouponCode = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

/** "Online · At the counter". */
export const channelsText = (channels: OfferChannel[] | undefined, t: T): string =>
  (channels ?? []).map((ch) => t(`commerce.offers.channel.${ch}`)).join(' · ');

/** The editor's folds, and which one each field's error lives in. */
export type OfferFold = 'who' | 'which' | 'where' | 'limits' | 'stacking';
const FOLD_OF: Partial<Record<keyof OfferForm, OfferFold>> = {
  description: 'who', minOrder: 'who', firstOrderOnly: 'who', startsOn: 'who', endsOn: 'who',
  daysOfWeek: 'who', timeWindows: 'who', tags: 'who',
  scopeType: 'which', productIds: 'which', categoryIds: 'which', excludeProductIds: 'which',
  channels: 'where',
  perCustomer: 'limits', total: 'limits',
  stackable: 'stacking', priority: 'stacking',
};

/** The folds that hold an error — opened so the partner sees why Save did nothing. */
export function foldsWithErrors(errors: OfferFormErrors): OfferFold[] {
  const out = new Set<OfferFold>();
  for (const k of Object.keys(errors) as (keyof OfferForm)[]) {
    const f = FOLD_OF[k];
    if (f) out.add(f);
  }
  return [...out];
}

/** C-5: once a customer has used the offer, its benefit, items and code are fixed. */
export const offerLocked = (o: Pick<OfferView, 'stats' | 'usedCount'> | undefined): boolean =>
  !!o && ((o.stats?.usedCount ?? o.usedCount ?? 0) > 0);

/** The product ids an existing offer names (scope, left-out, free item) — to look their names up. */
export function offerProductIds(f: Pick<OfferForm, 'productIds' | 'excludeProductIds' | 'getProductId'>, cap = 20): string[] {
  const ids = [...f.productIds, ...f.excludeProductIds, ...(f.getProductId ? [f.getProductId] : [])];
  return [...new Set(ids)].slice(0, cap);
}
