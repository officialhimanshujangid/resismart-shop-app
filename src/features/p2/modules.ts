/**
 * Partner suite P2 — the business-type modules (CONTRACT-partner-P2 §1.1, §1.3, §2).
 *
 * Pharmacy, subscriptions & tuition, appointments and jobs are switched on PER
 * BUSINESS, off by default, free on every plan. Pure: no React, no network — the
 * screens and the tests read the same rules.
 *
 * HARD RULE (§0.1): a business that never switches one on sees nothing new. Every
 * P2 door in this app asks `hasCategoryModule` first, and that answer comes from
 * `GET /partners/me/entitlements` → `categoryModules`, which is `[]` (or absent,
 * on an old server) for everybody who never opted in.
 */
import type { PartnerModule } from '../../types/api-contract.generated';

export const P2_MODULES = ['PHARMACY', 'SUBSCRIPTIONS', 'APPOINTMENTS', 'JOBS'] as const;
export type P2Module = typeof P2_MODULES[number];

export const isP2Module = (v: unknown): v is P2Module =>
  typeof v === 'string' && (P2_MODULES as readonly string[]).includes(v);

/** The base modules each one works on top of (`CATEGORY_MODULE_REQUIRES`). */
export const P2_REQUIRES: Readonly<Record<P2Module, readonly PartnerModule[]>> = Object.freeze({
  PHARMACY: ['CATALOG'],
  SUBSCRIPTIONS: ['INVOICING'],
  APPOINTMENTS: ['BOOKINGS'],
  JOBS: ['BOOKINGS', 'INVOICING'],
});

/** The settings key (`PUT /category-modules/settings/:key`) of each module. */
export const P2_SETTINGS_KEY: Readonly<Record<P2Module, P2SettingsKey>> = Object.freeze({
  PHARMACY: 'pharmacy',
  SUBSCRIPTIONS: 'subscriptions',
  APPOINTMENTS: 'appointments',
  JOBS: 'jobs',
});

export type P2SettingsKey = 'pharmacy' | 'subscriptions' | 'appointments' | 'jobs';

export const BILLING_BASES = ['SCHEDULED_MINUS_EXCEPTIONS', 'MARKED_DELIVERED'] as const;
export type BillingBasis = typeof BILLING_BASES[number];
export const RX_SCHEDULES = ['H', 'H1'] as const;
export type RxSchedule = typeof RX_SCHEDULES[number];

export interface PharmacySettings {
  nearExpiryDays: number[];
  blockUnbatchedSales: boolean;
  enforceMrp: boolean;
  requireRxFor: RxSchedule[];
  requireBatchOnReceipt: boolean;
}
export interface SubscriptionSettings {
  pauseCutoffHHmm: string;
  maxPauseDays: number;
  billDay: number;
  autoIssue: boolean;
  billingBasis: BillingBasis;
  moveStockOnBill: boolean;
  markBackDays: number;
}
export interface AppointmentSettings {
  /** Absent = no change window (today's rules). */
  customerChangeCutoffMin?: number;
  remind2h: boolean;
  noShowConsumesSession: boolean;
  seriesHorizonDays: number;
}
export interface JobSettings {
  gatePassLeadMin: number;
  gatePassTrailMin: number;
  gatePassMaxUses: number;
  quoteValidityDays: number;
  requireQuoteBeforeVisit: boolean;
}
export interface ModuleSettings {
  pharmacy: PharmacySettings;
  subscriptions: SubscriptionSettings;
  appointments: AppointmentSettings;
  jobs: JobSettings;
}

/** `MODULE_SETTINGS_DEFAULTS` — what the server answers for a business that never saved any. */
export const MODULE_SETTINGS_DEFAULTS: ModuleSettings = Object.freeze({
  pharmacy: { nearExpiryDays: [90, 30, 7], blockUnbatchedSales: false, enforceMrp: true, requireRxFor: ['H', 'H1'], requireBatchOnReceipt: true },
  subscriptions: {
    pauseCutoffHHmm: '20:00', maxPauseDays: 60, billDay: 1, autoIssue: true,
    billingBasis: 'SCHEDULED_MINUS_EXCEPTIONS', moveStockOnBill: false, markBackDays: 7,
  },
  appointments: { remind2h: true, noShowConsumesSession: true, seriesHorizonDays: 28 },
  jobs: { gatePassLeadMin: 30, gatePassTrailMin: 60, gatePassMaxUses: 2, quoteValidityDays: 7, requireQuoteBeforeVisit: false },
}) as ModuleSettings;

/** `MODULE_SETTINGS_BOUNDS` — the same limits the validators hold. */
export const MODULE_SETTINGS_BOUNDS = Object.freeze({
  nearExpiryDays: { min: 1, max: 365, maxItems: 5 },
  maxPauseDays: { min: 1, max: 90 },
  billDay: { min: 1, max: 28 },
  markBackDays: { min: 0, max: 31 },
  customerChangeCutoffMin: { min: 0, max: 10080 },
  seriesHorizonDays: { min: 7, max: 90 },
  gatePassLeadMin: { min: 0, max: 180 },
  gatePassTrailMin: { min: 0, max: 240 },
  gatePassMaxUses: { min: 1, max: 5 },
  quoteValidityDays: { min: 1, max: 30 },
});

export interface CategoryModuleRow {
  key: P2Module;
  /** Chosen by the business. */
  on: boolean;
  /** Chosen AND every base module on — what actually opens the doors. */
  effective: boolean;
  requires: string[];
  missingBase: string[];
}

export interface CategoryModulesView {
  modules: CategoryModuleRow[];
  settings: ModuleSettings;
}

/** Garbage in → the default out, one key at a time (the server's `moduleSettingsOf` reading). */
export function normaliseSettings(raw: unknown): ModuleSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<P2SettingsKey, Record<string, unknown>>>;
  const D = MODULE_SETTINGS_DEFAULTS;
  const pick = <T extends object>(dflt: T, got: Record<string, unknown> | undefined): T => {
    const out = { ...dflt } as Record<string, unknown>;
    if (got && typeof got === 'object') {
      for (const [k, v] of Object.entries(got)) {
        if (v === undefined || v === null) continue;
        const d = (dflt as Record<string, unknown>)[k];
        if (d === undefined || typeof d === typeof v || (Array.isArray(d) && Array.isArray(v))) out[k] = v;
      }
    }
    return out as T;
  };
  const appointments = pick(D.appointments, r.appointments);
  const cutoff = r.appointments?.customerChangeCutoffMin;
  if (typeof cutoff === 'number' && Number.isFinite(cutoff)) appointments.customerChangeCutoffMin = cutoff;
  else delete appointments.customerChangeCutoffMin;
  const pharmacy = pick(D.pharmacy, r.pharmacy);
  pharmacy.nearExpiryDays = [...pharmacy.nearExpiryDays].filter((n) => Number.isFinite(n)).sort((a, b) => b - a);
  pharmacy.requireRxFor = pharmacy.requireRxFor.filter((s): s is RxSchedule => (RX_SCHEDULES as readonly string[]).includes(s));
  return {
    pharmacy,
    subscriptions: pick(D.subscriptions, r.subscriptions),
    appointments,
    jobs: pick(D.jobs, r.jobs),
  };
}

export function normaliseView(raw: unknown): CategoryModulesView {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { modules?: unknown; settings?: unknown };
  const got = Array.isArray(r.modules) ? r.modules as Array<Record<string, unknown>> : [];
  const modules = P2_MODULES.map((key): CategoryModuleRow => {
    const row = got.find((m) => m?.key === key) ?? {};
    const requires = Array.isArray(row.requires) ? (row.requires as string[]) : [...P2_REQUIRES[key]];
    return {
      key,
      on: row.on === true,
      effective: row.effective === true,
      requires,
      missingBase: Array.isArray(row.missingBase) ? (row.missingBase as string[]) : [],
    };
  });
  return { modules, settings: normaliseSettings(r.settings) };
}

/** The effective modules from an entitlements payload, defensively (absent = none). */
export function categoryModulesOf(ent: { categoryModules?: unknown } | undefined | null): P2Module[] {
  const raw = ent?.categoryModules;
  return Array.isArray(raw) ? raw.filter(isP2Module) : [];
}
