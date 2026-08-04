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

  /**
   * COMPLETED → INVOICED, and it does NOT raise the bill.
   *
   * The controller looks for a live document whose `sourceType` is BOOKING and
   * whose `sourceId` is this booking, and answers 409 `NO_BILL_RAISED` when
   * there is none. That is the design: pricing a line, reserving a number and
   * moving a party's balance all live in the billing engine, and a second copy
   * of any of them is a second answer to what the customer owes. So this verb
   * records that the bill covers the job — `startBillForBooking` is what raises
   * the bill in the first place.
   */
  invoice: (id: string, body: { note?: string } = {}) =>
    apiClient
      .post<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}/invoice`, body)
      .then((r) => unwrap(r.data)),

  /**
   * INVOICED → PAID, and it reads rather than asserts: the controller refuses
   * (409 `BILL_NOT_SETTLED`) while any bill for the job is still open. Payment
   * is recorded against the DOCUMENT, which is what moves the party balance and
   * what a receipt prints from.
   *
   * `mark-paid` in the URL, `markPaid` as the verb — the route is hyphenated
   * like every other multi-word path on that router.
   */
  markPaid: (id: string, body: { note?: string } = {}) =>
    apiClient
      .post<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}/mark-paid`, body)
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
  // Billing verbs. These used to throw, on the belief that `booking.routes.ts`
  // mounted no route for either — true when this file was written, and untrue
  // since P6 added `/:id/invoice` and `/:id/mark-paid`. While they threw, a
  // service job finished on a phone could never be invoiced, never marked paid
  // and never settled against the customer's balance.
  invoice: (id, body) => bookingApi.invoice(id, body),
  markPaid: (id, body) => bookingApi.markPaid(id, body),
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
