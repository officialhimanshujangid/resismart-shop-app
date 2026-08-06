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

/** How each pricing style reads to the partner choosing it. */
export const PRICE_TYPE_LABEL: Record<ServicePriceType, string> = {
  FIXED: 'A fixed price',
  FROM: 'Starts from',
  QUOTE: 'Quoted after a look',
};

export const PRICE_TYPE_HINT: Record<ServicePriceType, string> = {
  FIXED: 'The resident sees this exact amount and pays it.',
  FROM: 'The resident sees "from ₹…", and the final bill can be higher.',
  QUOTE: 'No price is shown. You quote once you have seen the job.',
};

export const MODE_LABEL: Record<ServiceMode, string> = {
  AT_PARTNER: 'At your place',
  AT_CUSTOMER: "At the customer's home",
};

/** = `MIN_SERVICE_DURATION_MIN` / `MAX_SERVICE_DURATION_MIN` in `partner-service.model.ts`. */
export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_MIN = 8 * 60;

/** `IPartnerService`, as `partner-service.controller.ts` returns it (`.lean()`, `categoryId` unpopulated). */
export interface PartnerServiceRow {
  _id: string;
  name: string;
  description?: string;
  categoryId?: string | null;
  pricePaise: number;
  priceType: ServicePriceType;
  durationMin: number;
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
