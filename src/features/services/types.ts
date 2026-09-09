import {
  PARTNER_SERVICE_MODES, PartnerServiceMode, SERVICE_PRICE_TYPES, ServicePriceType,
} from '../../types/api-contract.generated';

/**
 * The partner's price list — what a service partner sells time for. Mirrors
 * `frontend/src/app/(dashboard)/dashboard/partner/services/shared.ts`, the web
 * twin of this file, field for field. `ServiceMode`/`ServicePriceType` are NOT
 * hand-written here: both come from `api-contract.generated.ts`, which is
 * generated from `partner-service.model.ts` / `partner.model.ts` — a value set
 * the SERVER validates must not be duplicated by hand on the client.
 */

export const SERVICE_MODES = PARTNER_SERVICE_MODES;
export type ServiceMode = PartnerServiceMode;
export { SERVICE_PRICE_TYPES };
export type { ServicePriceType };

/**
 * HOW EACH PRICING STYLE AND MODE READS ON SCREEN — a catalogue key per value,
 * not the words.
 *
 * The KEYS are `SERVICE_PRICE_TYPES` and `SERVICE_MODES`, which come from
 * `api-contract.generated.ts` and are the WIRE values: `priceType` and `modes[]`
 * on the service, validated server-side against the same generated set. Those
 * literals never move. Only the labels and hints are translated — the same
 * split `features/billing/types.ts` is the worked example of.
 */
export const PRICE_TYPE_LABEL_KEY: Record<ServicePriceType, string> = {
  FIXED: 'services.priceType.FIXED',
  FROM: 'services.priceType.FROM',
  QUOTE: 'services.priceType.QUOTE',
};

export const PRICE_TYPE_HINT_KEY: Record<ServicePriceType, string> = {
  FIXED: 'services.priceType.FIXEDHint',
  FROM: 'services.priceType.FROMHint',
  QUOTE: 'services.priceType.QUOTEHint',
};

export const MODE_LABEL_KEY: Record<ServiceMode, string> = {
  AT_PARTNER: 'services.mode.AT_PARTNER',
  AT_CUSTOMER: 'services.mode.AT_CUSTOMER',
};

/** = `MIN_SERVICE_DURATION_MIN` / `MAX_SERVICE_DURATION_MIN` in `partner-service.model.ts`. */
export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_MIN = 8 * 60;

/**
 * = `MIN_SERVICE_CAPACITY` / `MAX_SERVICE_CAPACITY` in `partner-service.model.ts`,
 * which are deliberately the SAME pair `PartnerAvailability.capacityPerSlot`
 * uses. A service allowed a capacity of 0 would describe a day that is open and
 * unbookable at once.
 */
export const MIN_SERVICE_CAPACITY = 1;
export const MAX_SERVICE_CAPACITY = 100;

/** `IPartnerService`, as `partner-service.controller.ts` returns it (`.lean()`, `categoryId` unpopulated). */
export interface PartnerServiceRow {
  _id: string;
  name: string;
  description?: string;
  categoryId?: string | null;
  pricePaise: number;
  priceType: ServicePriceType;
  durationMin: number;
  /**
   * How many of THIS service fit in one slot, when that is not the day's number.
   *
   * **Absent or `null` means "use the day's `capacityPerSlot`"** — the contract
   * `partner-service.model.ts` states at length, and the reason nothing in this
   * app may substitute a default for it: a form that always posts a number would
   * pin every service to one customer at a time and silently override the day
   * capacity of every partner who had set one.
   *
   * A number here names a DEDICATED RESOURCE. The slot engine counts a service
   * with an override against its own bookings only, and drops those bookings out
   * of the day's shared pool — so five chairs plus one massage room really is six
   * people at once.
   */
  capacityPerSlotOverride?: number | null;
  modes: ServiceMode[];
  advancePaise: number;
  visitChargePaise: number;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

/** What the create/edit form sends. Matches `createPartnerServiceSchema`/`updatePartnerServiceSchema`. */
export interface ServiceFormInput {
  name: string;
  description?: string;
  categoryId?: string | null;
  pricePaise: number;
  priceType: ServicePriceType;
  durationMin: number;
  /**
   * OMIT THE KEY for "use the day's capacity". Never a default.
   *
   * `null` is accepted on the EDIT path only (`updatePartnerServiceSchema` adds
   * `.nullable()`) and is the clear signal: it puts the service back on the
   * day's number. On create the schema is not nullable, so a new service that is
   * not dedicated must send nothing at all — which is why this is optional here
   * rather than `number | null` with a sentinel.
   */
  capacityPerSlotOverride?: number | null;
  modes: ServiceMode[];
  advancePaise: number;
  visitChargePaise: number;
  isActive: boolean;
  sortOrder: number;
}

export interface ServiceListFilters {
  isActive?: 'true' | 'false';
  categoryId?: string;
  q?: string;
}

/** The owner-curated taxonomy row, from `/partner-categories/public`. */
export interface PartnerCategoryLite {
  _id: string;
  name: string;
}
