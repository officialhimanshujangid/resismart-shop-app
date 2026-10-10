import axios from 'axios';
import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
import { AvailabilityRow } from './types';

/**
 * `/partners/me/availability/**` — see `partner-service.routes.ts`
 * (`partnerAvailabilityRouter`) and `partner-availability.controller.ts`.
 *
 * This app reads/writes the business's own schedule only
 * (`GET .../one` with no `?staffId=`, `PUT` with `staffId: null` in the
 * body) — see the scope note in `./types.ts`.
 */
export const availabilityApi = {
  /**
   * The business's default schedule, or `null` when none has been saved yet.
   * `GET .../one` answers 404 with `code: 'NO_SCHEDULE'` for "not set up",
   * which is a real, expected state for a brand-new partner — not an error
   * this screen should show a retry banner for.
   */
  get: async (): Promise<AvailabilityRow | null> => {
    try {
      const res = await apiClient.get<ApiEnvelope<AvailabilityRow>>('/partners/me/availability/one');
      return unwrap(res.data);
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.status === 404) return null;
      throw e;
    }
  },

  /**
   * P9A (Owner Q7): EVERY schedule at once — the business's own (`staffId: null`)
   * and each person's own hours. Same call the website's Working hours screen makes.
   */
  list: async (): Promise<AvailabilityRow[]> => {
    const res = await apiClient.get<ApiEnvelope<AvailabilityRow[]>>('/partners/me/availability');
    const rows = unwrap(res.data);
    return Array.isArray(rows) ? rows : [];
  },

  /** P9A Q7: "Back on the business's hours" — removes ONE person's own hours (never the business's). */
  removeOverride: (staffId: string) =>
    apiClient.delete<ApiEnvelope<unknown>>(`/partners/me/availability/${encodeURIComponent(staffId)}`).then((r) => r.data),

  /** Upsert — same request whether this is the first save or the fiftieth. */
  save: (body: Record<string, unknown>) =>
    apiClient.put<ApiEnvelope<AvailabilityRow>>('/partners/me/availability', body).then((r) => unwrap(r.data)),
};
