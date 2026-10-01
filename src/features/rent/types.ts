/**
 * The shop's "My shop rent" — the wire shapes of `/api/v1/partners/me/society-rent`
 * (CONTRACT-partner-P4 §10.8), copied from the BUILT backend
 * (`backend/src/services/partner-society-rent.service.ts`), not from the design.
 *
 * Money is integer PAISE. `startDate` / `endDate` are `YYYY-MM-DD`; bill dates
 * are full ISO instants.
 */

/** `lease-rules.ts LEASE_STATUSES`. A shop never sees DRAFT or CANCELLED. */
export type LeaseStatus = 'DRAFT' | 'ACTIVE' | 'NOTICE' | 'ENDED' | 'TERMINATED' | 'CANCELLED';

export interface PartnerRentLease {
  leaseId: string;
  number: string;
  societyName: string;
  unitLabel: string;
  status: LeaseStatus | string;
  startDate: string;
  endDate: string;
  /** Rent per MONTH (a quarterly lease bills three months on one bill). */
  monthlyRentPaise: number;
  frequency?: 'MONTHLY' | 'QUARTERLY' | string;
  dueDay?: number;
  depositHeldPaise: number;
}

export type RentBillKind = 'RENT' | 'LEASE_DEPOSIT';

export interface PartnerRentBill {
  id: string;
  invoiceNumber: string;
  kind: RentBillKind;
  leaseId: string;
  periodLabel: { en: string; hi: string };
  invoiceDate: string;
  dueDate: string;
  totalPaise: number;
  gstPaise: number;
  outstandingPaise: number;
  /** ISSUED | PARTIALLY_PAID | OVERDUE (derived) | PAID | … */
  status: string;
  reverseCharge: boolean;
  overdueDays: number;
}

export type RentListStatus = 'OPEN' | 'PAID' | 'ALL';

export interface PartnerRentList {
  leases: PartnerRentLease[];
  bills: PartnerRentBill[];
  totals: { duePaise: number; overduePaise: number };
  page: number;
  pageSize: number;
  total: number;
}

export interface PartnerRentDetail {
  bill: PartnerRentBill;
  lease: { leaseId: string; number: string; unitLabel: string; societyName: string };
  payTo: {
    payeeName: string;
    upiVpa?: string;
    bank?: { bankName?: string; accountName?: string; accountNumberMasked: string; ifsc?: string };
  };
  /** Only when the society has a UPI id AND something is due. */
  upi?: { uri: string; qrPayload: string; amountPaise: number };
  shareText: string;
}

/** `partnerRentPaidSchema` — strict. */
export const RENT_PAID_MODES = ['UPI', 'BANK_TRANSFER', 'CHEQUE', 'CASH', 'OTHER'] as const;
export type RentPaidMode = typeof RENT_PAID_MODES[number];

export interface RentPaidBody {
  amountPaise: number;
  /** 3–80 characters. */
  reference: string;
  /** `YYYY-MM-DD`. */
  paidOn?: string;
  mode: RentPaidMode;
}
