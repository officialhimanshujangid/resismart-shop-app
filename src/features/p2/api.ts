import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
import {
  CategoryModulesView, ModuleSettings, P2Module, P2SettingsKey, normaliseSettings, normaliseView,
} from './modules';

/**
 * `/api/v1/partners/me/category-modules` (CONTRACT-partner-P2 §5): SETTINGS READ
 * to see, SETTINGS FULL to switch or save. Settings may be saved while the module
 * is OFF (set it up first, then switch on).
 */
export const categoryModulesApi = {
  get: () =>
    apiClient.get<ApiEnvelope<unknown>>('/partners/me/category-modules')
      .then((r) => normaliseView(unwrap(r.data))),

  /** 409 CATEGORY_MODULE_NEEDS_BASE {module, needs} when a base module is off. */
  toggle: (key: P2Module, on: boolean) =>
    apiClient.put<ApiEnvelope<unknown>>(`/partners/me/category-modules/${key}`, { on })
      .then((r) => normaliseView(unwrap(r.data))),

  /** One key's settings; every field optional. `appointments.customerChangeCutoffMin: null` removes the window. */
  saveSettings: (key: P2SettingsKey, body: Record<string, unknown>) =>
    apiClient.put<ApiEnvelope<{ settings: unknown }>>(`/partners/me/category-modules/settings/${key}`, body)
      .then((r): ModuleSettings => normaliseSettings(unwrap(r.data)?.settings)),
};

/** Query keys for every P2 screen — one prefix, so a module toggle can clear them all. */
export const p2Keys = {
  all: () => ['p2'] as const,
  modules: () => ['p2', 'category-modules'] as const,
};
