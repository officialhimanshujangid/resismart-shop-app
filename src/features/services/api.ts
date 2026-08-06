import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
import { PartnerServiceRow, ServiceFormInput, ServiceListFilters } from './types';

/**
 * `/partners/me/services/**` — see `partner-service.routes.ts` and
 * `partner-service.controller.ts`. Unpaginated on purpose: a price list is a
 * dozen rows, not a catalogue, so the list screen filters what it already has
 * rather than costing a request per keystroke — same call shape as the web
 * `services/page.tsx`.
 */
export const servicesApi = {
  list: (filters: ServiceListFilters = {}) =>
    apiClient
      .get<ApiEnvelope<PartnerServiceRow[]>>('/partners/me/services', {
        params: {
          isActive: filters.isActive,
          categoryId: filters.categoryId,
          q: filters.q || undefined,
        },
      })
      .then((r) => unwrap(r.data)),

  getOne: (id: string) =>
    apiClient.get<ApiEnvelope<PartnerServiceRow>>(`/partners/me/services/${id}`).then((r) => unwrap(r.data)),

  create: (body: ServiceFormInput) =>
    apiClient.post<ApiEnvelope<PartnerServiceRow>>('/partners/me/services', body).then((r) => unwrap(r.data)),

  update: (id: string, body: Partial<ServiceFormInput>) =>
    apiClient.put<ApiEnvelope<PartnerServiceRow>>(`/partners/me/services/${id}`, body).then((r) => unwrap(r.data)),

  /**
   * `DELETE /partners/me/services/:id` deactivates a service that has ever
   * been booked and genuinely removes one that has not — the server decides
   * which and says so in `message`; this app shows that sentence verbatim
   * rather than inventing its own (mirrors `services/page.tsx#withdraw`).
   */
  remove: (id: string) =>
    apiClient.delete<ApiEnvelope<PartnerServiceRow>>(`/partners/me/services/${id}`).then((r) => r.data),
};
