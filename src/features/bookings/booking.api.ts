// The NAMED export, not `axios.isAxiosError` — the same guard the rest of the
// app uses, imported the way the linter asks for it.
import { isAxiosError } from 'axios';

import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
import {
  AssignableStaff, BookingConflictView, BookingOverrunView, BookingVerb, PagedResult,
  PartnerBookingListFilters, PartnerBookingView,
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

  /**
   * How this job is running against its plan, and what is booked behind it.
   *
   * A plain READ and the one booking endpoint that does not answer with a
   * booking — it returns the partner's own diary arithmetic. Answers for any
   * status: a finished job reports what it did, a live one reports where it is.
   */
  overrun: (id: string) =>
    apiClient
      .get<ApiEnvelope<BookingOverrunView>>(`/partners/me/bookings/${id}/overrun`)
      .then((r) => unwrap(r.data)),

  /**
   * More time on a job that is running long.
   *
   * `minutes` is a DELTA on the current claim — how much longer, never an
   * instant. That is deliberate on the server's side and it matters here more
   * than anywhere: an absolute end computed on a phone is computed in the
   * PHONE's timezone, and the whole slot engine is arithmetic in the partner's.
   * A number of minutes is the same number of minutes everywhere.
   *
   * Refused with 409 `SLOT_TAKEN_AHEAD` when the time behind is genuinely
   * taken, carrying the bookings in the way — see `slotConflictsOf`.
   */
  extend: (id: string, body: { minutes: number; note?: string }) =>
    apiClient
      .post<ApiEnvelope<PartnerBookingView>>(`/partners/me/bookings/${id}/extend`, body)
      .then((r) => unwrap(r.data)),
};

/**
 * The appointments a refusal names, or `[]` when it named none.
 *
 * `apiErrorMessage` gives the sentence and `apiErrorCode` gives the token;
 * neither can reach `data.conflicts`, which is the half of a `SLOT_TAKEN_AHEAD`
 * that is actually useful — "you cannot have another twenty minutes" is a dead
 * end, and "Mrs Sharma at 3:30, BK-0042" is something the partner can ring or
 * move. `BookingConflictError` on the server exists to carry exactly this, so
 * throwing it away in the client would waste the whole point of it.
 *
 * Defensive about the shape rather than trusting it: this is an error path, and
 * a client that crashes while rendering a refusal turns a 409 into a blank
 * screen.
 */
export function slotConflictsOf(error: unknown): BookingConflictView[] {
  if (!isAxiosError(error)) return [];
  const rows = (error.response?.data as { data?: { conflicts?: unknown } } | undefined)?.data?.conflicts;
  if (!Array.isArray(rows)) return [];
  return rows.filter((r): r is BookingConflictView => Boolean(r) && typeof r === 'object');
}

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
  extend: (id, body) => bookingApi.extend(id, body as { minutes: number; note?: string }),
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
