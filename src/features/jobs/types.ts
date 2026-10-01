import type { DocumentLineInput, PartnerDocumentLine, PartnerDocumentRecord, PartnerDocumentTotals } from '../billing/types';
import type { BookingStatus, PartnerBookingView } from '../bookings/booking.types';

/**
 * Partner suite P2 — JOBS, as the BUILT backend answers it
 * (`backend/src/services/job.service.ts`, `job-gate.service.ts`,
 * `job-invoice.service.ts`, `controllers/job.controller.ts`). Base
 * `/partners/me/jobs`. Customer names arrive already masked while the first
 * visit is not yet accepted — draw what arrives, never unmask.
 */

export const JOB_STAGES = [
  'QUOTE_PENDING', 'QUOTED', 'APPROVED', 'DECLINED', 'IN_WORK', 'COMPLETED', 'INVOICED', 'CLOSED',
] as const;
export type JobStage = typeof JOB_STAGES[number];

export const JOB_QUOTE_STATUSES = ['SENT', 'APPROVED', 'DECLINED', 'SUPERSEDED', 'EXPIRED'] as const;
export type JobQuoteStatus = typeof JOB_QUOTE_STATUSES[number];

export const JOB_GATE_STATUSES = ['NONE', 'ACTIVE', 'NOT_AVAILABLE', 'REVOKED', 'USED', 'FAILED'] as const;
export type JobGateStatus = typeof JOB_GATE_STATUSES[number];

/** `JobVisitSummary` — the next open visit of a job. */
export interface JobVisitSummary { bookingId: string; slotStart: string; status: BookingStatus }

/** One row of `GET /partners/me/jobs` (`PartnerJobRow`). */
export interface JobRow {
  id: string;
  code: string;
  stage: JobStage;
  customerName: string;
  flatLabel?: string;
  serviceName: string;
  lastQuote?: { number: string; totalPaise: number; status: JobQuoteStatus };
  nextVisit?: JobVisitSummary;
  gateStatus: JobGateStatus | string;
}

export interface JobListResult { data: JobRow[]; page: number; limit: number; total: number }

export interface JobListQuery { stage?: JobStage; q?: string; page?: number; limit?: number }

/** `partnerJobView` — the job itself (no pass id, no resident id). */
export interface JobView {
  id: string;
  code: string;
  stage: JobStage;
  serviceName: string;
  customerName: string;
  flatLabel?: string;
  partyId: string;
  primaryBookingId: string;
  bookingIds: string[];
  approvedQuoteDocumentId?: string;
  invoiceId?: string;
  closedAt?: string;
  closeReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** A quote in the detail: the job's quote row + its QUOTATION document's lines and totals. */
export interface JobQuoteView {
  id: string;
  documentId: string;
  number: string;
  totalPaise: number;
  validUntil: string;
  status: JobQuoteStatus;
  sentAt: string;
  sentByName: string;
  decidedAt?: string;
  declineReason?: string;
  documentStatus?: string;
  lines: PartnerDocumentLine[];
  totals?: PartnerDocumentTotals;
}

/** `PartnerGateView` — the six digits only while the pass is ACTIVE. */
export interface JobGateView {
  status: JobGateStatus;
  consent: boolean;
  code?: string;
  validFrom?: string;
  validTo?: string;
  visitorName?: string;
  reason?: string;
}

export interface JobInvoiceSummary { documentId: string; number?: string; grandPaise: number; status: string }

/** `GET /partners/me/jobs/:id` (`PartnerJobDetail`). */
export interface JobDetail {
  job: JobView;
  visits: PartnerBookingView[];
  quotes: JobQuoteView[];
  gate: JobGateView;
  invoice?: JobInvoiceSummary;
}

// ── writes

/** `jobQuoteSchema` (strict): lines are the P1 document line shape — never a tax figure. */
export interface JobQuoteBody { lines: DocumentLineInput[]; validDays?: number; notes?: string; terms?: string }
export interface JobQuoteResult { job: JobView; gate: JobGateView; quote: PartnerDocumentRecord }

/** `jobVisitSchema` (strict). `slotStart` is ISO with the IST offset. */
export interface JobVisitBody { slotStart: string; staffId?: string; note?: string }
export interface JobVisitResult { job: JobView; visit: PartnerBookingView }

/** `jobInvoiceSchema` (strict). */
export interface JobInvoiceBody { extraLines?: DocumentLineInput[]; notes?: string }
export interface JobInvoiceResult { job: JobView; document: PartnerDocumentRecord; aboveQuotePaise: number }

export interface JobCloseResult { job: JobView }
