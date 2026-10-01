/**
 * Partner suite P2 — SUBSCRIPTIONS + TUITION, the shapes the BUILT backend sends
 * (`backend/src/services/subscription*.ts`, `routes/subscription.routes.ts`).
 * Days are IST `YYYY-MM-DD`, periods `YYYY-MM`, money integer paise. Line rates
 * are tax-inclusive (the price the customer agreed to).
 *
 * Note the id spelling: the list rows, the delivery sheet, attendance and the
 * bills list send `id` / `subscriptionId`; the raw documents (a subscription's
 * detail, plans, routes, pauses, holidays, bill rows in the detail) send `_id`.
 */

export const SUBSCRIPTION_KINDS = ['DAIRY', 'TIFFIN', 'NEWSPAPER', 'TUITION', 'OTHER'] as const;
export type SubscriptionKind = typeof SUBSCRIPTION_KINDS[number];
export const SCHEDULE_PATTERNS = ['DAILY', 'ALTERNATE', 'WEEKDAYS'] as const;
export type SchedulePattern = typeof SCHEDULE_PATTERNS[number];
export const BILLING_MODES = ['PER_DELIVERY', 'FIXED_MONTHLY'] as const;
export type BillingMode = typeof BILLING_MODES[number];
export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'ENDED'] as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];
export const BILL_STATUSES = ['CLAIMED', 'DRAFTED', 'ISSUED', 'SKIPPED', 'FAILED'] as const;
export type BillStatus = typeof BILL_STATUSES[number];
export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LEAVE'] as const;
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];
export type RouteKind = 'ROUTE' | 'BATCH';
export type MarkStatus = 'DELIVERED' | 'NOT_DELIVERED' | 'EXTRA';
export type SheetState = 'DUE' | 'PAUSED' | 'HOLIDAY' | 'DELIVERED' | 'NOT_DELIVERED' | 'EXTRA';
export type DayState = 'OUTSIDE' | 'NOT_SCHEDULED' | SheetState;
export type PausedBy = 'CUSTOMER' | 'SHOP';

export const MAX_LINES = 10;
/** `deliveryMarkSchema.entries` ≤ 500. */
export const MAX_MARK_ENTRIES = 500;

export interface SubLine {
  lineKey: string;
  productId?: string;
  itemName: string;
  unit: string;
  qty: number;
  qtyByWeekday?: number[];
  ratePaise: number;
  taxRatePercent?: number;
  hsn?: string;
}
export interface Schedule { pattern: SchedulePattern; weekdays?: number[]; anchorDate?: string }
export interface Billing { mode: BillingMode; monthlyFeePaise?: number; timing?: 'ARREARS' | 'ADVANCE' }

export interface Plan {
  _id: string;
  name: string;
  kind: SubscriptionKind;
  lines: SubLine[];
  billing: Billing;
  defaultSchedule?: Schedule;
  isActive: boolean;
  sortOrder?: number;
}
export interface PlanBody {
  name: string; kind: SubscriptionKind; lines: SubLine[]; billing: Billing; defaultSchedule?: Schedule; isActive?: boolean;
}

/** One stop of a route in walking order (`GET /routes/:id/stops`, 0-based `order`). */
export interface RouteStop { subscriptionId: string; code: string; customerName: string; flatLabel?: string; order: number }

export interface DeliveryRoute {
  _id: string;
  kind: RouteKind;
  name: string;
  staffId?: string;
  timeText?: string;
  isActive: boolean;
  sortOrder?: number;
}

/** `GET /` row. */
export interface SubscriptionRow {
  id: string;
  code: string;
  customerName: string;
  flatLabel?: string;
  title: string;
  kind: SubscriptionKind;
  status: SubscriptionStatus;
  routeName?: string;
  todayState: DayState;
  monthToDate: { deliveries: number; amountPaise: number };
  /** Walking order — read when the server sends it (not every version does). */
  routeSeq?: number;
}
export interface Paged<T> { data: T[]; page: number; limit: number; total: number }

export interface Revision { effectiveFrom: string; lines: SubLine[]; schedule: Schedule; billing: Billing }

export interface Subscription {
  _id: string;
  code: string;
  partyId: string;
  customerName: string;
  flatLabel?: string;
  kind: SubscriptionKind;
  title: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate?: string;
  endedReason?: string;
  revisions: Revision[];
  routeId?: string;
  routeSeq?: number;
  billDay?: number;
  autoIssue?: boolean;
  notes?: string;
}

/** `POST /:id/revise` — a change from `effectiveFrom` (≥ the first unbilled day). */
export interface ReviseBody { effectiveFrom: string; lines?: SubLine[]; schedule?: Schedule; billing?: Billing }
/** `PUT /:id` — only what changed; `null` removes. */
export interface EditBody {
  title?: string; routeId?: string | null; routeSeq?: number; billDay?: number | null; autoIssue?: boolean | null; notes?: string;
}

/** One refused entry of a mark batch (`POST /deliveries/mark` → `refused[]`, also on the all-refused 409 under `data`). */
export interface MarkRefusal { index: number; key: string; code: string; message: string; params?: Record<string, string> }
/** `POST /deliveries/mark` answer. Older servers send only `{saved}`. */
export interface MarkResult {
  saved: number;
  applied?: { index: number; key: string; status: MarkStatus }[];
  refused?: MarkRefusal[];
}

export interface MonthDay { day: string; state: DayState; qtyByLine?: Record<string, number>; pausedBy?: PausedBy }
export interface MonthLine {
  lineKey: string; itemName: string; unit: string; qty: number; ratePaise: number; taxRatePercent?: number; amountPaise: number;
}
export interface MonthResult { period: string; days: MonthDay[]; lines: MonthLine[]; amountPaise: number; deliveredDays: number }

export interface Pause {
  _id: string;
  scope: 'SUBSCRIPTION' | 'SHOP';
  subscriptionId?: string;
  routeId?: string;
  from: string;
  to: string;
  by: PausedBy;
  reason?: string;
  cancelledAt?: string;
}

/** A bill row as the detail sends it (raw). */
export interface SubBillDoc {
  _id: string;
  period: string;
  status: BillStatus;
  number?: string;
  amountPaise?: number;
  deliveredDays?: number;
  errorCode?: string;
}

export interface SubscriptionDetail { subscription: Subscription; month: MonthResult; pauses: Pause[]; bills: SubBillDoc[] }

export interface SheetLine { lineKey: string; itemName: string; qty: number; unit: string }
export interface SheetRow {
  subscriptionId: string;
  code: string;
  customerName: string;
  flatLabel?: string;
  lines: SheetLine[];
  state: SheetState;
  pausedBy?: PausedBy;
}
export interface LoadingItem { itemName: string; unit: string; qty: number }
export interface DeliverySheet { day: string; rows: SheetRow[]; loadingList: LoadingItem[] }

export interface MarkEntry {
  subscriptionId: string;
  status: MarkStatus;
  qty?: { lineKey: string; qty: number }[];
  note?: string;
}

export interface AttendanceRowData {
  subscriptionId: string;
  code: string;
  customerName: string;
  flatLabel?: string;
  classDay: boolean;
  pausedBy?: PausedBy;
  status?: AttendanceStatus;
}
export interface AttendanceSheet { day: string; batchId?: string; rows: AttendanceRowData[] }
export interface AttendanceMonth {
  month: string; present: number; absent: number; leave: number;
  days: { day: string; classDay: boolean; status?: AttendanceStatus }[];
}

/** `GET /bills` row. */
export interface BillRowData {
  id: string;
  subscriptionId: string;
  code?: string;
  customerName?: string;
  title?: string;
  flatLabel?: string;
  period: string;
  status: BillStatus;
  documentId?: string;
  number?: string;
  amountPaise?: number;
  deliveredDays?: number;
  errorCode?: string;
  attempts: number;
}
export interface BillOutcome {
  subscriptionId: string;
  status: BillStatus;
  billId?: string;
  documentId?: string;
  number?: string;
  amountPaise?: number;
  code?: string;
}
export interface BillPreview { lines: MonthLine[]; amountPaise: number; deliveredDays: number }

export interface CreateSubscriptionBody {
  partyId: string;
  planId?: string;
  kind: SubscriptionKind;
  title: string;
  lines: SubLine[];
  schedule: Schedule;
  billing: Billing;
  startDate: string;
  routeId?: string;
  routeSeq?: number;
  notes?: string;
}
