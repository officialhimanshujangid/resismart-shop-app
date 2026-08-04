import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
import {
  AssignableStaff, BookingVerb, PagedResult, PartnerBookingListFilters, PartnerBookingView,
} from './booking.types';

/**
 * `/partners/me/bookings/...` — see `backend/src/routes/booking.routes.ts`.
 *
 * One function per verb rather than one generic `act(verb, id, body)`, so a
 * screen calling `bookingApi.reject(id, { reason })` gets a body TypeScript can
 * check against that verb's own validator shape (`reject` demands a reason,
 * `accept` does not) instead of a bag of optional fields shared by all eleven.
 */
export const bookingApi = {
  list: (filters: PartnerBookingListFilters = {}) =>
    apiClient
      .get<ApiEnvelope<PartnerBookingView[]> & PagedResult<PartnerBookingView>>('/partners/me/bookings', {
        params: filters,
      })
      .then((r) => r.data),

  get: (id: string) =>
    apiClient
      .get<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}`)
      .then((r) => unwrap(r.data)),

  accept: (id: string, body: { note?: string } = {}) =>
    apiClient
      .post<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}/accept`, body)
      .then((r) => unwrap(r.data)),

  /** A reason is required — it is what the customer reads. */
  reject: (id: string, body: { reason: string }) =>
    apiClient
      .post<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}/reject`, body)
      .then((r) => unwrap(r.data)),

  assign: (id: string, body: { staffId: string; note?: string }) =>
    apiClient
      .post<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}/assign`, body)
      .then((r) => unwrap(r.data)),

  /** `slotStart` is a full ISO instant, exactly as this view's own `slotStart` reads. */
  reschedule: (id: string, body: { slotStart: string; staffId?: string | null; reason?: string }) =>
    apiClient
      .post<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}/reschedule`, body)
      .then((r) => unwrap(r.data)),

  start: (id: string, body: { note?: string } = {}) =>
    apiClient
      .post<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}/start`, body)
      .then((r) => unwrap(r.data)),

  /** Mints the completion code and sends it to the CUSTOMER. Never returned here. */
  reach: (id: string, body: { note?: string } = {}) =>
    apiClient
      .post<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}/reach`, body)
      .then((r) => unwrap(r.data)),

  /** `otp` only for an AT_CUSTOMER job — the transition table refuses it without one. */
  complete: (id: string, body: { otp?: string; note?: string } = {}) =>
    apiClient
      .post<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}/complete`, body)
      .then((r) => unwrap(r.data)),

  noShow: (id: string, body: { note?: string } = {}) =>
    apiClient
      .post<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}/no-show`, body)
      .then((r) => unwrap(r.data)),

  cancel: (id: string, body: { reason?: string } = {}) =>
    apiClient
      .post<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}/cancel`, body)
      .then((r) => unwrap(r.data)),

  note: (id: string, body: { note?: string }) =>
    apiClient
      .post<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}/note`, body)
      .then((r) => unwrap(r.data)),
};

/**
 * One function per verb, called through a single mutation — see `hooks.ts`.
 * Kept as a lookup here (rather than a switch inside the hook) so adding a verb
 * to `BookingVerb` fails to compile until this map is widened too.
 */
export const bookingVerbCall: Record<
  BookingVerb,
  (id: string, body: Record<string, unknown>) => Promise<PartnerBookingView>
> = {
  accept: (id, body) => bookingApi.accept(id, body),
  reject: (id, body) => bookingApi.reject(id, body as { reason: string }),
  assign: (id, body) => bookingApi.assign(id, body as { staffId: string; note?: string }),
  reschedule: (id, body) => bookingApi.reschedule(id, body as { slotStart: string; staffId?: string | null }),
  start: (id, body) => bookingApi.start(id, body),
  reach: (id, body) => bookingApi.reach(id, body),
  complete: (id, body) => bookingApi.complete(id, body),
  noShow: (id, body) => bookingApi.noShow(id, body),
  cancel: (id, body) => bookingApi.cancel(id, body),
  note: (id, body) => bookingApi.note(id, body as { note?: string }),
  // Billing verbs. Declared so the map stays TOTAL over `BookingVerb` — the
  // transition table reaches COMPLETED/INVOICED, but P6's billing screens own
  // raising the bill and recording payment; a booking never offers these here
  // because `allowedVerbs` only returns them from statuses this vertical does
  // not reach through the Bookings tab's own actions.
  invoice: () => { throw new Error('Raise the bill from Billing, not Bookings.'); },
  markPaid: () => { throw new Error('Record payment from Billing, not Bookings.'); },
};

/**
 * Staff this partner may hand a booking to.
 *
 * Reads `GET /partners/me/staff` (gate 3: `STAFF READ`) rather than a
 * bookings-specific endpoint — there isn't one, and the assign sheet needs
 * exactly the same list the Staff screen manages. Filtered to active,
 * booking-eligible rows client-side: `canTakeBookings: false` is how a partner
 * marks somebody as back-office only, and the transition table's ASSIGNEE role
 * has no opinion on that flag, so nothing server-side stops an assign to
 * somebody who does not take jobs.
 */
export async function listAssignableStaff(): Promise<AssignableStaff[]> {
  const { data } = await apiClient.get<{ success: boolean; data: AssignableStaff[] }>('/partners/me/staff');
  return (data.data || []).filter((s) => s.isActive && s.canTakeBookings);
}
