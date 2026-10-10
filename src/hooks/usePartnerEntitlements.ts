import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { partnerApi, PartnerEntitlementsPayload, PartnerPermissionLevel } from '../api/partner.api';
import { qk } from '../lib/queryKeys';
import { PARTNER_MODULES, PartnerModule, PartnerAccessModule } from '../types/api-contract.generated';
import { normaliseRoleLimits, PartnerRoleLimits } from '../features/p1/access';
import { isP2Module, type P2Module } from '../features/p2/modules';
import { isCommerceFeature } from '../features/commerce/features';

/**
 * One place the partner app asks "may I?", fed by `GET /partners/me/entitlements`.
 *
 * The mobile twin of `frontend/src/hooks/usePartnerPermissions.ts`, and
 * deliberately the same rules rather than something cleverer: that hook was
 * written after three separate calls had each failed OPEN, and the shape it
 * settled on is the shape that stopped the leak. Two different answers to one
 * question means the one nobody is looking at is the one that drifts.
 *
 * It FAILS CLOSED, in the two places that matter:
 *
 *   - While the answer is outstanding, `can()` is false and `ready` is false.
 *     Nothing is rendered optimistically and filtered afterwards — a tab bar
 *     that draws the whole app and then removes half of it has already told a
 *     receptionist that the business has a Promotion screen and a Staff screen,
 *     and on a phone that flash is the most visible thing on the display.
 *   - On ANY error the answer is `CLOSED`, whose `limits` is an EMPTY map. That
 *     is why `planSells` below treats an absent key as "not sold" rather than
 *     copying the server's `planAllows`, which reads absent as unlimited. The
 *     server can afford that reading because `partner-entitlement.service.ts`
 *     fills every key before it answers; a client that copied it would turn a
 *     truncated payload into a free upgrade.
 *
 * Nothing here is a boundary. Every partner route runs `enforcePartnerScope`,
 * `requirePartnerModule` and `requirePartnerPermission` server-side; this only
 * stops the app advertising doors that will not open.
 */

/**
 * Each gate-2 module next to the plan capability that SELLS it.
 *
 * A copy of `CAPABILITIES[].partnerModule` in
 * `backend/src/services/partner-entitlement.service.ts`, and it is a copy
 * because the client has to tell two failures apart that the server answers with
 * the same silence: a module missing from `modules` because the partner switched
 * it off (their choice — say nothing, it is one tap away in Settings) and one
 * missing because their plan does not sell it (our business — say so, and say
 * what it costs). The server sends `plan.limits` precisely so the client can
 * make that distinction; without this map it could not.
 *
 * Typed as a total `Record` over the generated `PartnerModule` union, so adding
 * a module to the API contract fails to COMPILE here until somebody decides how
 * it is sold. The web version used an array and silently treated an unknown
 * module as LOCKED; a build error is the same safe direction, sooner.
 */
export interface PartnerModuleInfo {
  label: string;
  /** The plan capability that SELLS this module — see `CAPABILITIES` on the server. */
  capability: string;
  blurb: string;
  /** MaterialCommunityIcons name. */
  icon: string;
  /** The gate-3 permission a person needs to see this module at all. */
  permission: PartnerAccessModule;
}

export const PARTNER_MODULE_INFO: Record<PartnerModule, PartnerModuleInfo> = {
  BOOKINGS: {
    label: 'Bookings',
    capability: 'max_bookings_month',
    blurb: 'Residents book a slot with you, and you accept, reschedule or close it.',
    icon: 'calendar-check-outline',
    permission: 'BOOKINGS_VIEW',
  },
  CATALOG: {
    label: 'Catalogue',
    capability: 'catalog_enabled',
    blurb: 'The services and products you offer, with prices residents can see.',
    icon: 'view-list-outline',
    permission: 'CATALOG_VIEW',
  },
  ORDERS: {
    label: 'Orders',
    capability: 'max_orders_month',
    blurb: 'Residents order from your catalogue; you pack, dispatch and close.',
    icon: 'package-variant-closed',
    permission: 'ORDERS_VIEW',
  },
  INVOICING: {
    label: 'Billing',
    capability: 'invoicing_enabled',
    blurb: 'Bill a customer, record what they paid, and see what is still outstanding.',
    icon: 'receipt',
    permission: 'INVOICING_VIEW',
  },
  PROMOTION: {
    label: 'Promotion',
    capability: 'boost_enabled',
    blurb: 'Appear above other businesses in the societies near you.',
    icon: 'rocket-launch-outline',
    permission: 'PROMOTION',
  },
};

/** Everything denied. Note `limits: {}` — with `planSells` that reads as nothing sold. */
export const CLOSED_ENTITLEMENTS: PartnerEntitlementsPayload = {
  plan: { name: '', isFreeTier: true, status: 'unknown', limits: {} },
  modules: [],
  permissions: {},
  isAdmin: false,
  awaitingRole: true,
  offeredPermissions: [],
};

/**
 * Does the plan sell this capability at all? `0` and absent both mean no.
 *
 * The `0` half mirrors the server (`planAllows`); the absent half deliberately
 * does not — see the header.
 */
export function planSells(limits: Record<string, number> | undefined, key: string): boolean {
  const raw = limits?.[key];
  if (raw === undefined || raw === null) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n !== 0;
}

/** `null` when unlimited (`-1`), the ceiling otherwise, and `0` when not sold. */
export function planLimit(limits: Record<string, number> | undefined, key: string): number | null {
  const raw = limits?.[key];
  if (raw === undefined || raw === null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return n === -1 ? null : n;
}

/**
 * The three states a gate-2 module can be in, and the whole reason the app needs
 * `plan.limits` as well as `modules`:
 *
 *   ON      bought and switched on — show the tab.
 *   OFF     bought, and the partner switched it off. Show NOTHING. They made
 *           that choice and can undo it in Settings → Modules; nagging them
 *           about a decision they took is how a settings screen stops being
 *           trusted.
 *   LOCKED  their plan does not sell it. Show it WITH the price attached. This
 *           is the ONE case where hiding is the wrong answer — a partner who
 *           never learns Promotion exists never buys it. It is the difference
 *           between selling and leaking.
 */
// >>> X2F — one-factor partner plans (Owner, 2026-10-04): every module is on every
// plan; the plan limits catalogue items only. There is no LOCKED state any more —
// a module is ON (switched on) or OFF (switched off in Settings → Modules).
export type PartnerModuleState = 'ON' | 'OFF';

export function moduleStateOf(ent: PartnerEntitlementsPayload, module: PartnerModule): PartnerModuleState {
  return ent.modules.includes(module) ? 'ON' : 'OFF';
}
// <<< X2F

/**
 * Does this person's ROLE allow `module` at `level` or better? Gate 3 only — it
 * says nothing about whether the business has the module at all.
 *
 * The proprietor short-circuits, exactly as `resolvePartnerAccess` does
 * server-side, so a business that has locked itself out of its own roles screen
 * still has somebody who can fix it.
 */
export function allows(
  ent: PartnerEntitlementsPayload,
  module: PartnerAccessModule,
  level: 'READ' | 'FULL' = 'FULL',
): boolean {
  if (ent.isAdmin) return true;
  const have: PartnerPermissionLevel = ent.permissions[module] ?? 'NONE';
  if (have === 'NONE') return false;
  return level === 'READ' ? true : have === 'FULL';
}

/**
 * Anything unreadable is DROPPED rather than defaulted.
 *
 * `planSells` then reads it as not sold, which is the direction that costs a
 * support call instead of a giveaway. The module list is filtered against the
 * generated union for the same reason: a module name this build has never heard
 * of is never switched on.
 */
function normalise(raw: PartnerEntitlementsPayload | undefined): PartnerEntitlementsPayload {
  if (!raw || typeof raw !== 'object') return CLOSED_ENTITLEMENTS;

  const limits: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw.plan?.limits ?? {})) {
    const n = Number(v);
    if (Number.isFinite(n)) limits[k] = n;
  }

  const known = new Set<string>(PARTNER_MODULES);
  const modules = Array.isArray(raw.modules)
    ? raw.modules.filter((m): m is PartnerModule => known.has(m))
    : [];

  return {
    plan: {
      /**
       * EMPTY IS THE SENTINEL FOR "the server did not name the plan", and it is
       * deliberately not the word "Unknown".
       *
       * `plan.name` is a SERVER value — "Growth", "Starter" — and translating a
       * server value here would mean translating whatever the server sent too.
       * So the absence is expressed as a falsy string and the two screens that
       * PRINT it (`settings/index.tsx`, `settings/plan.tsx`) fall back to
       * `settings.plan.unknownName` at the point of display, which is the only
       * place that knows it is about to be read by a person.
       */
      name: raw.plan?.name ?? '',
      isFreeTier: raw.plan?.isFreeTier !== false,
      status: raw.plan?.status ?? 'unknown',
      limits,
      // `=== true`, so a server that does not send the field reads as "not a
      // trial" rather than as one with no deadline. `trialEndsAt` is carried
      // through untouched — it is a date string, and the ONE thing this app
      // must not do with a trial deadline is invent or round one.
      isTrial: raw.plan?.isTrial === true,
      trialEndsAt: raw.plan?.trialEndsAt,
    },
    modules,
    permissions: raw.permissions ?? {},
    isAdmin: raw.isAdmin === true,
    awaitingRole: raw.awaitingRole === true,
    offeredPermissions: Array.isArray(raw.offeredPermissions) ? raw.offeredPermissions : [],
    business: raw.business,
    usage: Array.isArray(raw.usage) ? raw.usage : undefined,
    // Carried through untouched. The blockers are already sentences written for
    // the proprietor, and normalising them here would mean this file deciding
    // what "invisible" means — which is precisely the judgement that belongs
    // beside the discovery gates on the server.
    visibility: raw.visibility,
    kycRequired: raw.kycRequired,
    // The ROLE's limits (P1). An absent or unreadable key is "no limit", which
    // is the server's reading too — the server enforces them either way.
    limits: normaliseRoleLimits(raw.limits),
    // P9A Q6: only the one value that narrows anything; anything else reads as "all jobs".
    ...(raw.jobScope === 'ASSIGNED' ? { jobScope: 'ASSIGNED' as const } : {}),
    // P2: only the four names this build knows; absent stays absent (an old
    // server), so nothing here changes for a business that never opted in.
    ...(Array.isArray(raw.categoryModules)
      ? { categoryModules: raw.categoryModules.filter((m): m is P2Module => isP2Module(m)) }
      : {}),
    // Commerce: only the feature names this build knows; absent stays absent.
    ...(Array.isArray(raw.commerceFeatures)
      ? { commerceFeatures: raw.commerceFeatures.filter((f) => isCommerceFeature(f)) }
      : {}),
  };
}

export interface ModuleMenuEntry extends PartnerModuleInfo {
  module: PartnerModule;
  /**
   * `ON` — open the screen. `LOCKED` — open the upgrade card instead. `OFF`
   * never appears here; see below.
   */
  state: Exclude<PartnerModuleState, 'OFF'>;
}

/**
 * What the "More" screen should list, applying the web sidebar's three rules in
 * the web sidebar's order (`frontend/src/components/layout/sidebarContent.tsx`).
 * The tab bar and More both build from this, so the two cannot disagree about
 * what a partner is allowed to see.
 *
 *   1. Gate 3 is checked FIRST and is absolute. A receptionist with no
 *      BOOKINGS_VIEW never sees Bookings, whatever the plan says.
 *   2. `OFF` is dropped silently. The partner switched it off themselves and it
 *      is one tap away in Settings → Modules; a menu that keeps arguing with a
 *      setting is a menu people stop trusting.
 *   3. `LOCKED` is SHOWN — with its price — but only to somebody holding
 *      SETTINGS at FULL, because that is who can act on it and the upgrade card
 *      is on a screen the others would be refused. This is the one case where
 *      hiding is the wrong answer: a partner who never learns Promotion exists
 *      never buys it. It is also the only exception to "not entitled ⇒ not
 *      rendered" in this whole app.
 */
export function moduleMenuEntries(
  ent: PartnerEntitlementsPayload,
  ready: boolean,
): ModuleMenuEntry[] {
  if (!ready) return []; // fail closed: nothing is offered before the answer lands

  return PARTNER_MODULES.flatMap<ModuleMenuEntry>((module) => {
    const info = PARTNER_MODULE_INFO[module];
    if (!allows(ent, info.permission, 'READ')) return [];
    const state = moduleStateOf(ent, module);
    if (state === 'OFF') return [];
    return [{ ...info, module, state }]; // X2F: no plan-LOCKED rows — every plan has every module
  });
}

export interface UsePartnerEntitlements {
  /** The resolved answer, or the fully-closed one while loading and on error. */
  entitlements: PartnerEntitlementsPayload;
  /** The request is outstanding. Draw a splash, NOT a tab bar. */
  loading: boolean;
  /**
   * An answer has arrived. Deliberately different from `!loading`: a caller that
   * builds a menu needs to tell "still asking" from "asked, and the answer is
   * no", because only one of the two is worth retrying.
   */
  ready: boolean;
  /** The answer is the closed one because the request failed, not because it said no. */
  failed: boolean;
  /** `can('STAFF')` → may act (FULL). `can('STAFF', 'READ')` → may see. False while loading. */
  can: (module: PartnerAccessModule, level?: 'READ' | 'FULL') => boolean;
  /** Bought AND switched on. Not a permission question — see `can`. */
  hasModule: (module: PartnerModule) => boolean;
  /** ON / OFF (X2F: no LOCKED — every plan has every module). */
  moduleState: (module: PartnerModule) => PartnerModuleState;
  /** The module rows "More" should draw, gate 3 applied — see `moduleMenuEntries`. */
  menu: ModuleMenuEntry[];
  /** The role's P1 limits (discount cap, price edit, backdate, credit override). `{}` = none. */
  roleLimits: PartnerRoleLimits;
  refresh: () => void;
}

const NO_LIMITS: PartnerRoleLimits = Object.freeze({});

export interface UsePartnerEntitlementsOptions {
  /**
   * Defaults to true. Pass `false` when there is no session yet: the endpoint is
   * authenticated, and firing it from the signed-out half of the app would draw
   * a 401 whose unrecoverable branch CLEARS the session — a request made to ask
   * about permissions would sign somebody out.
   */
  enabled?: boolean;
}

export function usePartnerEntitlements(options?: UsePartnerEntitlementsOptions): UsePartnerEntitlements {
  const queryClient = useQueryClient();
  const enabled = options?.enabled ?? true;

  const query = useQuery({
    queryKey: qk.entitlements(),
    queryFn: () => partnerApi.entitlements(),
    enabled,
    // The gate for the whole app. Kept fresh for a minute so a tab switch does
    // not re-ask, and refetched explicitly after anything that changes what the
    // partner may see (a module toggle, a plan change) via `refresh()`.
    staleTime: 60_000,
  });

  const resolved = query.isSuccess ? normalise(query.data) : CLOSED_ENTITLEMENTS;
  const loading = query.isPending;
  const ready = query.isSuccess;
  const failed = query.isError;

  const can = useCallback(
    (module: PartnerAccessModule, level: 'READ' | 'FULL' = 'FULL'): boolean => {
      if (!ready) return false; // loading counts as not-permitted
      return allows(resolved, module, level);
    },
    [ready, resolved],
  );

  const hasModule = useCallback(
    (module: PartnerModule): boolean => (ready ? resolved.modules.includes(module) : false),
    [ready, resolved],
  );

  const moduleState = useCallback(
    (module: PartnerModule): PartnerModuleState => {
      // Before the answer lands every module reads LOCKED rather than ON.
      // Callers are expected to check `ready` first and draw nothing; this is the
      // backstop for the ones that forget.
      if (!ready) return 'OFF'; // X2F (was LOCKED; that state is gone)
      return moduleStateOf(resolved, module);
    },
    [ready, resolved],
  );

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.entitlements() });
  }, [queryClient]);

  const menu = useMemo(() => moduleMenuEntries(resolved, ready), [resolved, ready]);
  const roleLimits = resolved.limits ?? NO_LIMITS;

  return { entitlements: resolved, loading, ready, failed, can, hasModule, moduleState, menu, roleLimits, refresh };
}
