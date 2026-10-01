import type { PartnerAccessModule } from '../../types/api-contract.generated';
import type { DocumentLineInput, PartnerDocumentLine } from '../billing/types';
import type { BookingStatus, PartnerBookingView } from '../bookings/booking.types';
import { istDayOf } from '../p2/dates';
import type { JobGateStatus, JobGateView, JobQuoteStatus, JobStage } from './types';

/**
 * Pure rules for the Jobs screens (unit-tested in `partner-p2-jobs-logic.test.ts`).
 * The stage sets are the server's own (`job.service.ts`); the server decides
 * again on every call — these only decide which buttons to DRAW.
 */

export const QUOTABLE_STAGES: readonly JobStage[] = ['QUOTE_PENDING', 'QUOTED', 'DECLINED'];
export const VISITABLE_STAGES: readonly JobStage[] = ['QUOTE_PENDING', 'QUOTED', 'APPROVED', 'IN_WORK', 'COMPLETED'];

export type Can = (key: PartnerAccessModule, level: 'READ' | 'FULL') => boolean;

export interface JobActions {
  sendQuote: boolean;
  addVisit: boolean;
  raiseBill: boolean;
  close: boolean;
  refreshGate: boolean;
}

/** Which job buttons to draw for this stage and this person. */
export function jobActions(stage: JobStage, can: Can): JobActions {
  const manage = can('BOOKINGS_MANAGE', 'FULL');
  const bill = can('INVOICING_MANAGE', 'FULL');
  return {
    sendQuote: QUOTABLE_STAGES.includes(stage) && can('JOBS_QUOTE', 'FULL') && bill,
    addVisit: VISITABLE_STAGES.includes(stage) && manage,
    raiseBill: stage === 'COMPLETED' && bill,
    close: stage !== 'CLOSED' && manage,
    refreshGate: stage !== 'CLOSED' && manage,
  };
}

/** May this person start a quote at all (the list's "New quote")? */
export const mayQuote = (can: Can) => can('JOBS_QUOTE', 'FULL') && can('INVOICING_MANAGE', 'FULL');

// ───────────────────────────────────────────────────────── the gate card

export interface GateText {
  /** Draw the six digits big — only for an ACTIVE pass that came with its code. */
  showCode: boolean;
  /** `p2.jobs.gate.<key>` — the sentence under (or instead of) the code. */
  key: string;
  /** The server's reason, shown as it arrives (NOT_AVAILABLE / FAILED / REVOKED). */
  reason?: string;
  /** Whether "Refresh gate pass" makes sense for this state. */
  refreshable: boolean;
}

const GATE_KEY: Record<JobGateStatus, string> = {
  NONE: 'none',
  ACTIVE: 'active',
  NOT_AVAILABLE: 'notAvailable',
  REVOKED: 'revoked',
  USED: 'used',
  FAILED: 'failed',
};

/** The gate card's words for a gate view. Unknown statuses read as "none". */
export function gateText(gate: JobGateView | undefined | null): GateText {
  const status = (gate?.status && gate.status in GATE_KEY ? gate.status : 'NONE') as JobGateStatus;
  if (status === 'ACTIVE') {
    const code = gate?.code && /^\d{4,8}$/.test(gate.code) ? gate.code : undefined;
    return { showCode: !!code, key: code ? 'active' : 'activeNoCode', refreshable: true };
  }
  if (status === 'NONE') {
    return { showCode: false, key: gate?.consent ? 'noneConsented' : 'none', refreshable: !!gate?.consent };
  }
  const reason = gate?.reason && gate.reason.trim() ? gate.reason.trim() : undefined;
  return {
    showCode: false,
    key: GATE_KEY[status],
    ...(reason && status !== 'USED' ? { reason } : {}),
    refreshable: status === 'FAILED' || status === 'REVOKED',
  };
}

/** Icon for the list's gate column. */
export function gateIcon(status: string): { icon: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } {
  switch (status) {
    case 'ACTIVE': return { icon: 'shield-check', tone: 'good' };
    case 'USED': return { icon: 'shield-check-outline', tone: 'neutral' };
    case 'FAILED': return { icon: 'shield-alert', tone: 'bad' };
    case 'REVOKED': return { icon: 'shield-off-outline', tone: 'warn' };
    case 'NOT_AVAILABLE': return { icon: 'shield-remove-outline', tone: 'neutral' };
    default: return { icon: 'shield-outline', tone: 'neutral' };
  }
}

// ───────────────────────────────────────────────────────── pills

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

export function stageTone(stage: JobStage): Tone {
  switch (stage) {
    case 'QUOTE_PENDING': return 'warn';
    case 'QUOTED': return 'info';
    case 'APPROVED':
    case 'IN_WORK': return 'info';
    case 'COMPLETED': return 'good';
    case 'INVOICED': return 'good';
    case 'DECLINED': return 'bad';
    default: return 'neutral';
  }
}

export function quoteTone(status: JobQuoteStatus | string): Tone {
  switch (status) {
    case 'SENT': return 'info';
    case 'APPROVED': return 'good';
    case 'DECLINED': return 'bad';
    case 'EXPIRED': return 'warn';
    default: return 'neutral';
  }
}

/** The list's stage chips, in the order a shop works through a job. `''` = all. */
export const STAGE_FILTERS: readonly ('' | JobStage)[] = [
  '', 'QUOTE_PENDING', 'QUOTED', 'APPROVED', 'IN_WORK', 'COMPLETED', 'INVOICED', 'CLOSED', 'DECLINED',
];

// ───────────────────────────────────────────────────────── booking picker

export const PICKABLE_BOOKING_STATUSES: readonly BookingStatus[] = ['ACCEPTED', 'SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS'];

/**
 * The bookings "Pick a booking" offers: open, and today or later (an
 * IN_PROGRESS one from yesterday that is still running is kept). Soonest first.
 */
export function pickableBookings(rows: readonly PartnerBookingView[], today: string): PartnerBookingView[] {
  return rows
    .filter((b) => PICKABLE_BOOKING_STATUSES.includes(b.status)
      && (b.status === 'IN_PROGRESS' || istDayOf(b.slotStart) >= today))
    .sort((a, b) => Date.parse(a.slotStart) - Date.parse(b.slotStart));
}

// ───────────────────────────────────────────────────────── lines

/**
 * A priced document line (from an earlier quote) back into the INPUT shape —
 * only the fields `documentLineSchema` accepts, never a tax figure.
 */
export function inputFromDocumentLine(l: PartnerDocumentLine): DocumentLineInput {
  return {
    ...(l.itemId ? { itemId: String(l.itemId) } : {}),
    itemName: l.itemName,
    ...(l.description ? { description: l.description } : {}),
    ...(l.hsn ? { hsn: l.hsn } : {}),
    qty: l.qty,
    ...(l.unit ? { unit: l.unit } : {}),
    ratePaise: l.ratePaise,
    ...(l.discountPaise ? { discountPaise: l.discountPaise } : {}),
    taxInclusive: l.taxInclusive ?? true,
    taxRatePercent: l.taxRatePercent ?? 0,
    ...(l.cessRatePercent ? { cessRatePercent: l.cessRatePercent } : {}),
  };
}

/** Strip the screen's own bookkeeping (`key`, `catalogRatePaise`) before the wire. */
export function wireLines<T extends DocumentLineInput & { key?: string; catalogRatePaise?: number }>(lines: readonly T[]): DocumentLineInput[] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return lines.map(({ key, catalogRatePaise, ...rest }) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) out[k] = v;
    return out as unknown as DocumentLineInput;
  });
}

/** The latest quote's lines (the one the shop is about to re-send), or none. */
export function prefillFromQuotes(quotes: readonly { lines: PartnerDocumentLine[] }[] | undefined): DocumentLineInput[] {
  const last = quotes && quotes.length ? quotes[quotes.length - 1] : undefined;
  return (last?.lines ?? []).map(inputFromDocumentLine);
}

export const clampValidDays = (n: number) => Math.min(30, Math.max(1, Math.round(Number.isFinite(n) ? n : 7)));
