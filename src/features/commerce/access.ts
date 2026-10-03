import { useMemo } from 'react';
import type { Href } from 'expo-router';

import { usePartnerEntitlements } from '../../hooks';
import type { PartnerAccessModule, PartnerModule } from '../../types/api-contract.generated';
import { commerceAllows, isCommerceFeature, type CommerceFeature, type CommercePermission } from './features';

/**
 * WHO MAY DO WHAT in the commerce screens — the routes' own guards, copied from
 * `backend/src/routes/commerce-*.routes.ts`, so a button is never a door that
 * answers 403. The server re-checks every one of these.
 *
 *   settings  any of ORDERS / INVOICING / CATALOG; read ORDERS_VIEW, INVOICING_VIEW, CATALOG_VIEW (READ) or
 *             STOREFRONT_MANAGE; each section needs its MODULE (storefront/delivery/fulfilment/share/growth ORDERS,
 *             offers ORDERS|CATALOG, wallet/loyalty/referral ORDERS|INVOICING, counter INVOICING, catalog CATALOG)
 *             and its own row (storefront… STOREFRONT_MANAGE, offers OFFERS_MANAGE, wallet… WALLET_MANAGE,
 *             growth broadcast keys BROADCAST_SEND, counter INVOICING_MANAGE, catalog CATALOG_MANAGE)
 *   offers    module CATALOG; OFFERS_VIEW READ / OFFERS_MANAGE FULL (+ feature OFFERS to create)
 *   wallet    WALLET_VIEW READ / WALLET_MANAGE FULL; top-up and pay-back also module INVOICING;
 *             pay-bill module INVOICING + INVOICING_MANAGE FULL (+ feature WALLET)
 *   broadcast module ORDERS; BROADCAST_SEND FULL (+ feature BROADCAST)
 *   insights  REPORTS READ; top customers + CUSTOMERS READ; dead stock module CATALOG + STOCK_VIEW;
 *             back-in-stock module CATALOG + CATALOG_VIEW
 *   counter   module INVOICING; holds/checkout INVOICING_MANAGE FULL; quick keys read INVOICING_VIEW READ
 *   variants  module CATALOG; CATALOG_VIEW READ / CATALOG_MANAGE FULL (+ feature VARIANTS to add)
 */

export interface CommerceAccessInput {
  ready: boolean;
  isAdmin: boolean;
  permissions: Record<string, string | undefined>;
  features: readonly string[];
  can: (m: PartnerAccessModule, level?: 'READ' | 'FULL') => boolean;
  hasModule: (m: PartnerModule) => boolean;
}

export interface CommerceAccess {
  ready: boolean;
  features: ReadonlySet<CommerceFeature>;
  has: (f: CommerceFeature) => boolean;
  /** Any commerce feature switched on. */
  anyOn: boolean;
  settings: {
    canView: boolean;
    /** Any section this person may write — the "Online shop settings" door. */
    canEdit: boolean;
    /** Which sections this shop's MODULES open (a missing module answers 404 MODULE_NOT_AVAILABLE). */
    visible: { online: boolean; offers: boolean; wallet: boolean; growth: boolean; counter: boolean; catalog: boolean };
    section: {
      storefront: boolean; offers: boolean; catalog: boolean; wallet: boolean; growthBroadcast: boolean; growthStock: boolean; counter: boolean;
    };
  };
  offers: { canView: boolean; canManage: boolean };
  wallet: { canView: boolean; canManage: boolean; canMoveMoney: boolean; canPayBill: boolean };
  broadcasts: { canSend: boolean };
  insights: { canView: boolean; customers: boolean; deadStock: boolean; stockAlerts: boolean };
  counter: { canSell: boolean; canReadQuickKeys: boolean };
  catalog: { canView: boolean; canManage: boolean };
  /** C2 (B-3): a rider — ORDER_DELIVERIES FULL — sees "My deliveries". */
  deliveries: { canDeliver: boolean };
}

/** Pure — the hook below feeds it; tests call it directly. */
export function commerceAccessOf(i: CommerceAccessInput): CommerceAccess {
  const features = new Set(i.features.filter(isCommerceFeature));
  const row = (r: CommercePermission, level: 'READ' | 'FULL') =>
    i.ready && commerceAllows({ isAdmin: i.isAdmin, permissions: i.permissions }, r, level);
  const can = (m: PartnerAccessModule, level: 'READ' | 'FULL') => i.ready && i.can(m, level);
  const mod = (m: PartnerModule) => i.ready && i.hasModule(m);

  // Settings sections are gated per MODULE (`SECTION_MODULES` in commerce-storefront.routes.ts):
  // a counter-only shop (INVOICING, no ORDERS) still opens counter / points / store credit / offers / catalogue.
  const visible = {
    online: mod('ORDERS'),
    offers: mod('ORDERS') || mod('CATALOG'),
    wallet: mod('ORDERS') || mod('INVOICING'),
    growth: mod('ORDERS'),
    counter: mod('INVOICING'),
    catalog: mod('CATALOG'),
  };
  const section = {
    storefront: visible.online && row('STOREFRONT_MANAGE', 'FULL'),
    offers: visible.offers && row('OFFERS_MANAGE', 'FULL'),
    catalog: visible.catalog && can('CATALOG_MANAGE', 'FULL'),
    wallet: visible.wallet && row('WALLET_MANAGE', 'FULL'),
    growthBroadcast: visible.growth && row('BROADCAST_SEND', 'FULL'),
    growthStock: visible.online && row('STOREFRONT_MANAGE', 'FULL'),
    counter: visible.counter && can('INVOICING_MANAGE', 'FULL'),
  };
  return {
    ready: i.ready,
    features,
    has: (f) => features.has(f),
    anyOn: features.size > 0,
    settings: {
      canView: (mod('ORDERS') || mod('INVOICING') || mod('CATALOG'))
        && (can('ORDERS_VIEW', 'READ') || row('STOREFRONT_MANAGE', 'FULL') || can('INVOICING_VIEW', 'READ') || can('CATALOG_VIEW', 'READ')),
      canEdit: Object.values(section).some(Boolean),
      visible,
      section,
    },
    offers: {
      canView: mod('CATALOG') && row('OFFERS_VIEW', 'READ'),
      canManage: mod('CATALOG') && row('OFFERS_MANAGE', 'FULL'),
    },
    wallet: {
      canView: row('WALLET_VIEW', 'READ'),
      canManage: row('WALLET_MANAGE', 'FULL'),
      canMoveMoney: mod('INVOICING') && row('WALLET_MANAGE', 'FULL'),
      canPayBill: mod('INVOICING') && can('INVOICING_MANAGE', 'FULL'),
    },
    broadcasts: { canSend: mod('ORDERS') && row('BROADCAST_SEND', 'FULL') },
    insights: {
      canView: can('REPORTS', 'READ'),
      customers: can('REPORTS', 'READ') && can('CUSTOMERS', 'READ'),
      deadStock: mod('CATALOG') && can('STOCK_VIEW', 'READ'),
      stockAlerts: mod('CATALOG') && can('CATALOG_VIEW', 'READ'),
    },
    counter: {
      canSell: mod('INVOICING') && can('INVOICING_MANAGE', 'FULL'),
      canReadQuickKeys: mod('INVOICING') && can('INVOICING_VIEW', 'READ'),
    },
    catalog: {
      canView: mod('CATALOG') && can('CATALOG_VIEW', 'READ'),
      canManage: mod('CATALOG') && can('CATALOG_MANAGE', 'FULL'),
    },
    deliveries: { canDeliver: mod('ORDERS') && row('ORDER_DELIVERIES', 'FULL') },
  };
}

export function useCommerceAccess(): CommerceAccess {
  const { ready, can, hasModule, entitlements } = usePartnerEntitlements();
  // `?? …` because a partial payload (an old server, a test double) must read as "nothing", never throw.
  const features = entitlements?.commerceFeatures;
  return useMemo(
    () => commerceAccessOf({
      ready,
      isAdmin: entitlements?.isAdmin === true,
      permissions: (entitlements?.permissions ?? {}) as Record<string, string | undefined>,
      features: features ?? [],
      can,
      hasModule,
    }),
    [ready, entitlements?.isAdmin, entitlements?.permissions, features, can, hasModule],
  );
}

/** One "Grow your shop" row on More. */
export interface CommerceDoor {
  key: string;
  icon: string;
  labelKey: string;
  blurbKey: string;
  href: Href;
}

/**
 * The commerce rows More draws (§14). Rule 1 of the contract — nothing changes
 * for a shop until it switches something on — so only the settings door shows
 * before that, and only to somebody who can switch features on.
 */
export function commerceDoors(a: CommerceAccess): CommerceDoor[] {
  if (!a.ready) return [];
  const doors: CommerceDoor[] = [];
  // C2 rider view: only where the shop gives deliveries to staff, and only to a rider.
  if (a.has('DELIVERY_STAFF') && a.deliveries.canDeliver) {
    doors.push({ key: 'DELIVERIES', icon: 'moped-outline', labelKey: 'commerce.doors.deliveries', blurbKey: 'commerce.doors.deliveriesBlurb', href: '/commerce/deliveries' as Href });
  }
  if (a.anyOn && a.has('OFFERS') && a.offers.canView) {
    doors.push({ key: 'OFFERS', icon: 'ticket-percent-outline', labelKey: 'commerce.doors.offers', blurbKey: 'commerce.doors.offersBlurb', href: '/commerce/offers' as Href });
  }
  if ((a.has('WALLET') || a.has('LOYALTY') || a.has('REFERRAL')) && a.wallet.canView) {
    doors.push({ key: 'WALLET', icon: 'wallet-giftcard', labelKey: 'commerce.doors.wallet', blurbKey: 'commerce.doors.walletBlurb', href: '/commerce/wallet' as Href });
  }
  if (a.has('BROADCAST') && a.broadcasts.canSend) {
    doors.push({ key: 'BROADCAST', icon: 'bullhorn-outline', labelKey: 'commerce.doors.broadcasts', blurbKey: 'commerce.doors.broadcastsBlurb', href: '/commerce/broadcasts' as Href });
  }
  if (a.anyOn && a.insights.canView) {
    doors.push({ key: 'INSIGHTS', icon: 'chart-box-outline', labelKey: 'commerce.doors.insights', blurbKey: 'commerce.doors.insightsBlurb', href: '/commerce/insights' as Href });
  }
  if (a.settings.canEdit) {
    doors.push({ key: 'SETTINGS', icon: 'storefront-edit-outline', labelKey: 'commerce.doors.settings', blurbKey: 'commerce.doors.settingsBlurb', href: '/commerce/settings' as Href });
  }
  return doors;
}
