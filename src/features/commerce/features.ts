/**
 * Commerce (CONTRACT-commerce §1.1 / §2) — the feature names and the seven role
 * rows, copied from `backend/src/models/partner-commerce-settings.model.ts`
 * (`COMMERCE_FEATURES`) and `partner-access-role.model.ts` (rows 32–38).
 *
 * Kept free of React and of every other app module: `usePartnerEntitlements`
 * imports `isCommerceFeature` from here, and anything heavier would make the
 * app's one permission hook depend on the commerce screens.
 */

export const COMMERCE_FEATURES = [
  'STOREFRONT', 'DELIVERY_FEE', 'DELIVERY_SLOTS', 'PARTIAL_ACCEPT', 'DELIVERY_STAFF', 'DELIVERY_PROOF',
  'STOCK_RESERVATION', 'AUTO_CANCEL', 'OFFERS', 'BUNDLES', 'VARIANTS', 'WALLET', 'LOYALTY', 'REFERRAL',
  'BROADCAST', 'BACK_IN_STOCK', 'COUNTER_HOLD', 'QUICK_KEYS', 'SPLIT_TENDER', 'SHARE',
] as const;
export type CommerceFeature = typeof COMMERCE_FEATURES[number];

const KNOWN = new Set<string>(COMMERCE_FEATURES);
export const isCommerceFeature = (f: unknown): f is CommerceFeature => typeof f === 'string' && KNOWN.has(f);

/**
 * The seven commerce role rows. They are NOT in the generated
 * `PARTNER_ACCESS_MODULES` (that file is regenerated from the backend by C1), so
 * they are read off the permission map by name — see `commerceAllows`.
 */
export const COMMERCE_PERMISSIONS = [
  'STOREFRONT_MANAGE', 'OFFERS_VIEW', 'OFFERS_MANAGE', 'ORDER_DELIVERIES',
  'WALLET_VIEW', 'WALLET_MANAGE', 'BROADCAST_SEND',
] as const;
export type CommercePermission = typeof COMMERCE_PERMISSIONS[number];

/**
 * Gate 3 for a commerce row: the proprietor always; otherwise the level the
 * server put in the (derived) permission map. Absent = NONE. Mirrors `allows()`
 * in `usePartnerEntitlements.ts`.
 */
export function commerceAllows(
  ent: { isAdmin: boolean; permissions: Record<string, string | undefined> },
  row: CommercePermission,
  level: 'READ' | 'FULL' = 'FULL',
): boolean {
  if (ent.isAdmin) return true;
  const have = ent.permissions[row] ?? 'NONE';
  if (have === 'NONE') return false;
  return level === 'READ' ? true : have === 'FULL';
}
