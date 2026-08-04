/**
 * The import surface the five screen agents work against.
 *
 * A barrel, so a screen imports from `@/hooks` and never reaches into a file
 * path that may be reorganised under it. Everything a screen needs to gate
 * itself, meter a create button or stay live is re-exported here.
 */
export {
  usePartnerEntitlements,
  moduleMenuEntries,
  moduleStateOf,
  planSells,
  planLimit,
  allows,
  PARTNER_MODULE_INFO,
  CLOSED_ENTITLEMENTS,
} from './usePartnerEntitlements';
export type {
  UsePartnerEntitlements,
  PartnerModuleState,
  ModuleMenuEntry,
  PartnerModuleInfo,
} from './usePartnerEntitlements';

export { usePlanUsage, capacityOf } from './usePlanUsage';
export type { CapacityView } from './usePlanUsage';

export { useOnboardingStatus, resumeStep } from './useOnboardingStatus';
export { useOnboardingGate } from './useOnboardingGate';
export type { OnboardingGate } from './useOnboardingGate';
export { usePushRegistration } from './usePushRegistration';
export { useLiveEvents } from './useLiveEvents';
