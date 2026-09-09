import { PartnerServiceMode, ServicePriceType } from '../../types/api-contract.generated';

/**
 * Booking status, verb and view shapes.
 *
 * **These are hand-written, and that is the one exception the build spec's rule
 * allows.** `api-contract.generated.ts` (§"Never hand-write a union that file
 * already carries") does not carry `BookingStatus`, `BookingVerb` or the booking
 * view shapes at all — the generator that produces it has not been pointed at
 * `booking.model.ts` / `booking-transitions.ts` / `booking.service.ts` yet. The
 * rule protects against two copies of a union that DOES live in the contract
 * drifting apart; it cannot protect a union the contract has never carried, and
 * refusing to type this screen until the generator catches up is not an option.
 * Reported as an owner decision: regenerate the contract to include these so this
 * file can be deleted in favour of an import.
 *
 * Every value below is copied verbatim from the backend source named above it,
 * so drift is a compile error the day the generator does land, not a silent
 * mismatch discovered by a 400 in production.
 */

// ------------------------------------------------------- backend/src/models/booking.model.ts
export const BOOKING_STATUSES = [
  'REQUESTED', 'ACCEPTED', 'SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS',
  'COMPLETED', 'INVOICED', 'PAID',
  'REJECTED', 'CANCELLED', 'NO_SHOW',
] as const;
export type BookingStatus = typeof BOOKING_STATUSES[number];

export const BOOKING_PAYMENT_MODES = ['CASH', 'ONLINE'] as const;
export type BookingPaymentMode = typeof BOOKING_PAYMENT_MODES[number];

// ------------------------------------------------- backend/src/services/booking-transitions.ts
export const BOOKING_VERBS = [
  'accept', 'reject', 'assign', 'reschedule', 'start', 'reach',
  'complete', 'noShow', 'cancel', 'invoice', 'markPaid', 'note',
  // A self-transition on IN_PROGRESS, and the only thing in the build that can
  // make a booking hold MORE of the diary than was agreed. `complete` never
  // does — it only ever shrinks `occupiesUntil` — so an overrun is either
  // claimed here, out loud, or the next job simply starts late.
  'extend',
] as const;
export type BookingVerb = typeof BOOKING_VERBS[number];

/**
 * WHAT EACH BUTTON SAYS — a catalogue key per verb. The server names its own
 * actions; these are those names, copied and then translated, not reworded.
 *
 * The KEYS are `BOOKING_VERBS` above, which is the WIRE value: the verb is the
 * path segment on `POST /partners/me/bookings/:id/<verb>` and is what
 * `allowedVerbs` comes back as. Those literals never move. Only the labels are
 * translated — the same split `features/billing/types.ts` is the worked example
 * of.
 */
export const VERB_LABEL_KEYS: Record<BookingVerb, string> = {
  accept: 'bookings.verb.accept',
  reject: 'bookings.verb.reject',
  assign: 'bookings.verb.assign',
  reschedule: 'bookings.verb.reschedule',
  start: 'bookings.verb.start',
  reach: 'bookings.verb.reach',
  complete: 'bookings.verb.complete',
  noShow: 'bookings.verb.noShow',
  cancel: 'bookings.verb.cancel',
  invoice: 'bookings.verb.invoice',
  markPaid: 'bookings.verb.markPaid',
  note: 'bookings.verb.note',
  extend: 'bookings.verb.extend',
};

/** = `MAX_EXTEND_MIN` in `booking-transitions.ts`. A typo guard, not a business rule. */
export const MAX_EXTEND_MIN = 120;

// ------------------------------------------------------ backend/src/services/booking.service.ts
export interface BookingAddress {
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface BookingServiceSnapshot {
  name: string;
  pricePaise: number;
  priceType: ServicePriceType;
  durationMin: number;
}

export interface BookingTimelineEntry {
  status: BookingStatus;
  at: string;
  byName: string;
  note?: string;
}

export interface PartnerBookingCustomerView {
  /**
   * The `PartnerParty` this job was booked against — the business's own customer
   * record, created idempotently when the booking was made.
   *
   * Not masked, and it is not a resident identifier: it is a row in the
   * PARTNER's own ledger. Carried so a bill raised for this job attaches to the
   * customer the job already created; billing against a name typed into the
   * Billing screen makes a SECOND party and splits the balance across two
   * ledgers, each internally consistent and neither right.
   */
  partyId?: string;
  name: string;
  societyName?: string;
  contactMasked: boolean;
  phone?: string;
  flatLabel?: string;
  address?: BookingAddress;
  maskNote?: string;
}

export interface PartnerBookingCancellation {
  by: 'CUSTOMER' | 'PARTNER' | 'SYSTEM';
  reason?: string;
  refundPaise: number;
  at: string;
}

/** `GET/POST /partners/me/bookings/...` — the ONE shape every partner-side call returns. */
export interface PartnerBookingView {
  id: string;
  code: string;
  status: BookingStatus;
  mode: PartnerServiceMode;
  serviceId: string;
  serviceSnapshot: BookingServiceSnapshot;
  slotStart: string;
  /**
   * When the appointment was AGREED to finish. A promise, and it never moves
   * except by `reschedule`.
   */
  slotEnd: string;
  /**
   * What the diary is actually blocked for — a CLAIM, not a promise, and the
   * field every occupancy query on the server reads.
   *
   * Equal to `slotEnd` for the whole life of an ordinary booking. The two come
   * apart in two places: a job that finishes early SHRINKS this, handing the
   * rest of the hour back to the next resident, and `extend` is the one verb
   * that can grow it. Optional here because a response from a server that
   * predates the field carries neither it nor `actual`; every reader falls back
   * to `slotEnd`, which is what it is initialised to anyway.
   */
  occupiesUntil?: string;
  /** When the work really started and stopped, once anybody has said. */
  actual?: {
    startedAt?: string;
    endedAt?: string;
    /** `endedAt - startedAt`, whole minutes. Absent on a job completed without a start. */
    durationMin?: number;
  };
  assignedStaffId?: string;
  /** Withheld while the customer is masked — see `customer.contactMasked`. */
  answers?: Record<string, unknown>;
  pricing: {
    basePaise: number;
    visitChargePaise: number;
    advancePaise: number;
    totalPaise: number;
  };
  payment: { mode: BookingPaymentMode; status: string; paidAt?: string };
  cancellation?: PartnerBookingCancellation;
  timeline: BookingTimelineEntry[];
  completedAt?: string;
  /** Whether the completion code has been SENT. Never the code — the server refuses to return it. */
  completionOtpSentAt?: string;
  /** What THIS viewer may do to THIS booking right now. Draw only these buttons. */
  allowedVerbs: BookingVerb[];
  customer: PartnerBookingCustomerView;
  createdAt: string;
  updatedAt: string;
}

/**
 * One appointment standing in the way of a job that wants to run on.
 *
 * Arrives in two places and is the same shape in both: on
 * `GET /:id/overrun` as `conflicts[]` (what is behind this job, whether or not
 * it is currently in the way) and on a 409 `SLOT_TAKEN_AHEAD` from
 * `POST /:id/extend` as `data.conflicts[]` (what refused it). `customerName` is
 * masked by the same rule the booking serializer applies.
 */
export interface BookingConflictView {
  id: string;
  code: string;
  serviceName: string;
  slotStart: string;
  slotEnd: string;
  customerName: string;
}

/**
 * `GET /partners/me/bookings/:id/overrun` — how a job is running against the
 * hour it was sold, and what is behind it.
 *
 * A READ, deliberately separate from the `extend` verb, so the partner sees the
 * choice BEFORE making it: "this is running over — add time, move what's next,
 * or leave it" with the consequence already worked out, rather than discovering
 * the conflict after pressing something. "Leave it" needs no endpoint — it is
 * `complete`, which records the overrun truthfully and never takes time it was
 * not given.
 */
export interface BookingOverrunView {
  bookingId: string;
  code: string;
  status: BookingStatus;
  slotStart: string;
  slotEnd: string;
  occupiesUntil: string;
  /** The planned length, from the snapshot taken when the customer agreed. */
  plannedMin: number;
  actual?: PartnerBookingView['actual'];
  /** Minutes past the agreed end RIGHT NOW — 0 while the job is still inside its hour. */
  runningOverMin: number;
  /** Minutes still to run before the agreed end. 0 once it is over. */
  remainingMin: number;
  /**
   * The largest extension that would be accepted right now, capped at
   * `MAX_EXTEND_MIN`. `0` means the time immediately behind is full, and
   * `conflicts` says by what.
   */
  canExtendByMin: number;
  conflicts: BookingConflictView[];
  /** How many fit in one slot here — a salon with three chairs is not blocked by one job. */
  capacity: number;
}

export interface PagedResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export interface PartnerBookingListFilters {
  status?: string;
  from?: string;
  to?: string;
  staffId?: string;
  code?: string;
  page?: number;
  limit?: number;
}

// ------------------------------------------------------- backend/src/models/partner-staff.model.ts
/** The slice of `GET /partners/me/staff` the assign sheet needs. */
export interface AssignableStaff {
  _id: string;
  designation: string;
  canTakeBookings: boolean;
  isActive: boolean;
  userId: { _id: string; name: string; email?: string; phone?: string } | string;
}
