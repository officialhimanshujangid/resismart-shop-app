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
] as const;
export type BookingVerb = typeof BOOKING_VERBS[number];

/** What the button says. The server names its own actions — copied, not reworded. */
export const VERB_LABELS: Record<BookingVerb, string> = {
  accept: 'Accept',
  reject: 'Turn it down',
  assign: 'Give it to somebody',
  reschedule: 'Move it',
  start: 'Start the job',
  reach: 'I have reached',
  complete: 'Job is done',
  noShow: 'Nobody turned up',
  cancel: 'Cancel',
  invoice: 'Raise the bill',
  markPaid: 'Mark paid',
  note: 'Add a note',
};

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
  slotEnd: string;
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
