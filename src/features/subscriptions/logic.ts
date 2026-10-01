import { parseRupeesToPaise, paiseToInput } from '../../lib/money';
import { addDays, addMonths, daysBetween, monthDays, periodOf, weekdayOf } from '../p2/dates';
import type { PendingMark } from './markQueue';
import type {
  AttendanceRowData, AttendanceStatus, BillOutcome, BillStatus, Billing, BillingMode, CreateSubscriptionBody, DayState,
  EditBody, Revision, ReviseBody, Subscription,
  MarkStatus, Plan, Schedule, SchedulePattern, SheetLine, SheetRow, SheetState, SubLine, SubscriptionKind,
} from './types';
import { MAX_LINES } from './types';

/**
 * Pure rules for the subscriptions screens (unit-tested in
 * `partner-p2-subscriptions-logic.test.ts`). No React, no network.
 */

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

/** 1 → "1", 0.5 → "0.5", 1.25 → "1.25". */
export const fmtQty = (n: number) => String(Math.round(n * 1000) / 1000);

/** "1 L Milk · 1 pc Curd". */
export function lineSummary(lines: readonly { itemName: string; qty: number; unit: string }[]): string {
  return lines.map((l) => `${fmtQty(l.qty)} ${l.unit} ${l.itemName}`.replace(/\s+/g, ' ').trim()).join(' · ');
}

export function stateTone(state: DayState | SheetState): Tone {
  switch (state) {
    case 'DELIVERED': case 'EXTRA': return 'good';
    case 'NOT_DELIVERED': return 'bad';
    case 'DUE': return 'info';
    case 'PAUSED': case 'HOLIDAY': return 'warn';
    default: return 'neutral';
  }
}

export function billTone(status: BillStatus): Tone {
  switch (status) {
    case 'ISSUED': return 'good';
    case 'DRAFTED': return 'info';
    case 'FAILED': return 'bad';
    case 'SKIPPED': return 'warn';
    default: return 'neutral';
  }
}

// ─────────────────────────────────────────────────────── delivery sheet

/** A sheet row as the screen draws it: the server's state with the phone's marks laid over it. */
export interface ViewRow {
  row: SheetRow;
  /** What the row shows now. */
  state: SheetState;
  /** The shown state is still only on the phone / on the wire. */
  unsent: boolean;
  /** …and not yet on the wire: it can be taken back. */
  local: boolean;
  lines: SheetLine[];
}

const UNMARKED: ReadonlySet<SheetState> = new Set(['DUE', 'PAUSED', 'HOLIDAY']);
export const isUnmarked = (s: SheetState) => UNMARKED.has(s);

/**
 * Lay the phone's marks over the fetched rows. `allPending` = "All delivered" is
 * waiting for the route on screen: every DUE row without a mark shows delivered
 * (the server fills only those). `confirmed` = marks the server has taken whose
 * refetch has not landed yet (no flicker back to Due).
 */
export function overlayRows(
  rows: readonly SheetRow[],
  pending: ReadonlyMap<string, PendingMark>,
  allPending: boolean,
  confirmed?: ReadonlyMap<string, PendingMark>,
): ViewRow[] {
  return rows.map((row) => {
    const p = pending.get(row.subscriptionId);
    if (p) {
      return { row, state: p.status, unsent: true, local: p.local, lines: withQty(row.lines, p.qty) };
    }
    const done = confirmed?.get(row.subscriptionId);
    if (done) return { row, state: done.status, unsent: false, local: false, lines: withQty(row.lines, done.qty) };
    if (allPending && row.state === 'DUE') return { row, state: 'DELIVERED', unsent: true, local: false, lines: row.lines };
    return { row, state: row.state, unsent: false, local: false, lines: row.lines };
  });
}

function withQty(lines: readonly SheetLine[], qty?: { lineKey: string; qty: number }[]): SheetLine[] {
  if (!qty?.length) return [...lines];
  const m = new Map(qty.map((q) => [q.lineKey, q.qty]));
  return lines.map((l) => (m.has(l.lineKey) ? { ...l, qty: m.get(l.lineKey) as number } : l));
}

export interface SheetCounts { due: number; delivered: number; notDelivered: number; paused: number }

export function sheetCounts(rows: readonly ViewRow[]): SheetCounts {
  const out: SheetCounts = { due: 0, delivered: 0, notDelivered: 0, paused: 0 };
  for (const r of rows) {
    if (r.state === 'DUE') out.due += 1;
    else if (r.state === 'DELIVERED' || r.state === 'EXTRA') out.delivered += 1;
    else if (r.state === 'NOT_DELIVERED') out.notDelivered += 1;
    else out.paused += 1;
  }
  return out;
}

/** One tap on the row: a DUE row is marked delivered; any other row opens (quantities, notes). */
export function tapAction(v: ViewRow): 'DELIVERED' | 'EXPAND' {
  return v.state === 'DUE' ? 'DELIVERED' : 'EXPAND';
}

/**
 * The "Not delivered" button. On a not-delivered row it is the undo: a mark still
 * on the phone over an unmarked server row is simply taken back (the row is Due
 * again); otherwise the row is marked delivered (the server keeps one mark per
 * day, and there is no "unmark").
 */
export function notDeliveredAction(v: ViewRow): { kind: 'UNQUEUE' } | { kind: 'MARK'; status: MarkStatus } {
  if (v.state !== 'NOT_DELIVERED') return { kind: 'MARK', status: 'NOT_DELIVERED' };
  if (v.local && isUnmarked(v.row.state)) return { kind: 'UNQUEUE' };
  return { kind: 'MARK', status: 'DELIVERED' };
}

/** The quantities to send with a mark, only when they differ from the scheduled ones. */
export function qtyChanges(lines: readonly SheetLine[], edited: Readonly<Record<string, number>>): { lineKey: string; qty: number }[] | undefined {
  const out = lines
    .filter((l) => edited[l.lineKey] !== undefined && edited[l.lineKey] !== l.qty)
    .map((l) => ({ lineKey: l.lineKey, qty: edited[l.lineKey] }));
  if (!out.length) return undefined;
  // Send every line once one changed, so the mark says the whole delivery.
  return lines.map((l) => ({ lineKey: l.lineKey, qty: edited[l.lineKey] ?? l.qty }));
}

/** The oldest day a mark may be for (the server refuses earlier: DELIVERY_DAY_OUT_OF_RANGE). */
export const markMinDay = (today: string, markBackDays: number) => addDays(today, -Math.max(0, markBackDays));

/** A `?day=` param, kept inside [min, today]. */
export function clampDay(raw: unknown, min: string, today: string): string {
  const d = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;
  if (d > today) return today;
  if (d < min) return min;
  return d;
}

// ─────────────────────────────────────────────────────────── attendance

/** Every class-day row that has no status (or all of them) → PRESENT. */
export function allPresent(
  rows: readonly AttendanceRowData[], current: Readonly<Record<string, AttendanceStatus>>,
): Record<string, AttendanceStatus> {
  const next = { ...current };
  for (const r of rows) if (r.classDay) next[r.subscriptionId] = 'PRESENT';
  return next;
}

/** The entries to save: only class-day rows with a status chosen or changed. */
export function attendanceEntries(
  rows: readonly AttendanceRowData[], chosen: Readonly<Record<string, AttendanceStatus>>,
): { subscriptionId: string; status: AttendanceStatus }[] {
  return rows
    .filter((r) => r.classDay && chosen[r.subscriptionId] && chosen[r.subscriptionId] !== r.status)
    .map((r) => ({ subscriptionId: r.subscriptionId, status: chosen[r.subscriptionId] }));
}

// ───────────────────────────────────────────────────────────── calendar

/** The weeks of a month, Sunday first, `null` for the blanks. */
export function monthGrid(period: string): (string | null)[][] {
  const days = monthDays(period);
  const cells: (string | null)[] = [...Array(weekdayOf(days[0])).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** The previous month — what a bill run is usually for. */
export const defaultBillPeriod = (today: string) => addMonths(periodOf(today), -1);

export const isPeriod = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

// ───────────────────────────────────────────────────────────────── bills

export function billRunSummary(results: readonly BillOutcome[]): Partial<Record<BillStatus, number>> {
  const out: Partial<Record<BillStatus, number>> = {};
  for (const r of results) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

/** Retry is offered on a row that did not become an issued invoice. */
export const canRetryBill = (status: BillStatus) => status === 'FAILED' || status === 'SKIPPED' || status === 'DRAFTED';

// ─────────────────────────────────────────────────── pauses / holidays

export type RangeProblem = 'MISSING' | 'ORDER' | 'TOO_LONG' | null;

export function rangeProblem(from: string, to: string, maxDays: number): RangeProblem {
  if (!from || !to) return 'MISSING';
  if (to < from) return 'ORDER';
  if (daysBetween(from, to) + 1 > maxDays) return 'TOO_LONG';
  return null;
}

// ─────────────────────────────────────────────────────── the line editor

export interface LineDraft { lineKey: string; itemName: string; unit: string; qty: string; rate: string }

/** 'L1', 'L2' … — the next free short key. */
export function nextLineKey(lines: readonly { lineKey: string }[]): string {
  const used = new Set(lines.map((l) => l.lineKey));
  let n = lines.length + 1;
  while (used.has(`L${n}`)) n += 1;
  return `L${n}`;
}

export const emptyLine = (lines: readonly { lineKey: string }[]): LineDraft =>
  ({ lineKey: nextLineKey(lines), itemName: '', unit: '', qty: '1', rate: '' });

export const lineToDraft = (l: SubLine): LineDraft =>
  ({ lineKey: l.lineKey, itemName: l.itemName, unit: l.unit, qty: fmtQty(l.qty), rate: paiseToInput(l.ratePaise) });

export type LinesProblem = 'NONE' | 'TOO_MANY' | 'NAME' | 'UNIT' | 'QTY' | 'RATE' | null;

/** Draft lines → the server's SubLine[] (rates tax-inclusive), or what is wrong. */
export function draftToLines(
  drafts: readonly LineDraft[],
  /** The lines being edited: what this editor does not show (product link, tax rate, HSN, per-weekday qty) is kept. */
  base: readonly SubLine[] = [],
): { lines: SubLine[]; problem: null } | { lines: null; problem: Exclude<LinesProblem, null> } {
  const kept = new Map(base.map((l) => [l.lineKey, l]));
  if (!drafts.length) return { lines: null, problem: 'NONE' };
  if (drafts.length > MAX_LINES) return { lines: null, problem: 'TOO_MANY' };
  const lines: SubLine[] = [];
  for (const d of drafts) {
    if (!d.itemName.trim()) return { lines: null, problem: 'NAME' };
    if (!d.unit.trim()) return { lines: null, problem: 'UNIT' };
    const qty = Number(d.qty.replace(',', '.'));
    if (!Number.isFinite(qty) || qty < 0 || qty > 1000) return { lines: null, problem: 'QTY' };
    const rate = parseRupeesToPaise(d.rate);
    if (rate === null || rate < 0) return { lines: null, problem: 'RATE' };
    const old = kept.get(d.lineKey);
    lines.push({
      ...(old?.productId ? { productId: old.productId } : {}),
      ...(old?.qtyByWeekday?.length === 7 ? { qtyByWeekday: old.qtyByWeekday } : {}),
      ...(old?.hsn ? { hsn: old.hsn } : {}),
      lineKey: d.lineKey,
      itemName: d.itemName.trim(),
      unit: d.unit.trim(),
      qty,
      ratePaise: rate,
      taxRatePercent: old?.taxRatePercent ?? 0,
    });
  }
  return { lines, problem: null };
}

// ───────────────────────────────────────────────── schedule and billing

export interface ScheduleDraft { pattern: SchedulePattern; weekdays: number[] }

export function draftToSchedule(d: ScheduleDraft): Schedule | null {
  if (d.pattern === 'WEEKDAYS') {
    const w = [...new Set(d.weekdays)].sort((a, b) => a - b);
    return w.length ? { pattern: 'WEEKDAYS', weekdays: w } : null;
  }
  return { pattern: d.pattern };
}

export const scheduleToDraft = (s?: Schedule): ScheduleDraft =>
  ({ pattern: s?.pattern ?? 'DAILY', weekdays: s?.weekdays ? [...s.weekdays] : [] });

export interface BillingDraft { mode: BillingMode; fee: string }

export function draftToBilling(d: BillingDraft): Billing | null {
  if (d.mode === 'PER_DELIVERY') return { mode: 'PER_DELIVERY', timing: 'ARREARS' };
  const fee = parseRupeesToPaise(d.fee);
  if (fee === null || fee <= 0) return null;
  return { mode: 'FIXED_MONTHLY', monthlyFeePaise: fee, timing: 'ARREARS' };
}

export const billingToDraft = (b?: Billing): BillingDraft =>
  ({ mode: b?.mode ?? 'PER_DELIVERY', fee: b?.monthlyFeePaise ? paiseToInput(b.monthlyFeePaise) : '' });

/** A plan's defaults for a new subscription. */
export function prefillFromPlan(p: Plan): {
  kind: SubscriptionKind; title: string; lines: LineDraft[]; schedule: ScheduleDraft; billing: BillingDraft;
} {
  return {
    kind: p.kind,
    title: p.name,
    lines: p.lines.map(lineToDraft),
    schedule: scheduleToDraft(p.defaultSchedule),
    billing: billingToDraft(p.billing),
  };
}

export interface NewSubscriptionDraft {
  partyId: string | null;
  planId: string | null;
  kind: SubscriptionKind;
  title: string;
  lines: LineDraft[];
  schedule: ScheduleDraft;
  billing: BillingDraft;
  startDate: string;
  routeId: string | null;
  routeSeq: string;
  notes: string;
}

export type NewProblem = 'CUSTOMER' | 'TITLE' | 'START' | 'SCHEDULE' | 'FEE' | 'SEQ' | Exclude<LinesProblem, null>;

/** The create body, or the first thing to fix. */
export function buildCreateBody(
  d: NewSubscriptionDraft, planLines: readonly SubLine[] = [],
): { body: CreateSubscriptionBody; problem: null } | { body: null; problem: NewProblem } {
  if (!d.partyId) return { body: null, problem: 'CUSTOMER' };
  const title = d.title.trim();
  if (title.length < 2 || title.length > 80) return { body: null, problem: 'TITLE' };
  const l = draftToLines(d.lines, planLines);
  if (l.problem !== null) return { body: null, problem: l.problem };
  const schedule = draftToSchedule(d.schedule);
  if (!schedule) return { body: null, problem: 'SCHEDULE' };
  const billing = draftToBilling(d.billing);
  if (!billing) return { body: null, problem: 'FEE' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate)) return { body: null, problem: 'START' };
  let routeSeq: number | undefined;
  if (d.routeId && d.routeSeq.trim()) {
    const n = Number(d.routeSeq.trim());
    if (!Number.isInteger(n) || n < 0 || n > 100000) return { body: null, problem: 'SEQ' };
    routeSeq = n;
  }
  const notes = d.notes.trim().slice(0, 300);
  return {
    body: {
      partyId: d.partyId,
      ...(d.planId ? { planId: d.planId } : {}),
      kind: d.kind,
      title,
      lines: l.lines as SubLine[],
      schedule,
      billing,
      startDate: d.startDate,
      ...(d.routeId ? { routeId: d.routeId } : {}),
      ...(routeSeq !== undefined ? { routeSeq } : {}),
      ...(notes ? { notes } : {}),
    },
    problem: null,
  };
}

/** The revision in force on `day` (the last with effectiveFrom ≤ day), else the first. */
export function revisionOn<R extends { effectiveFrom: string }>(revisions: readonly R[], day: string): R | undefined {
  const sorted = [...revisions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let hit: R | undefined;
  for (const r of sorted) if (r.effectiveFrom <= day) hit = r;
  return hit ?? sorted[0];
}

/** A short schedule text key + params ("Daily", "Alternate days", "Mon, Wed, Fri"). */
export function scheduleText(s: Schedule | undefined, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!s) return '';
  if (s.pattern === 'DAILY') return t('p2.subscriptions.schedule.DAILY');
  if (s.pattern === 'ALTERNATE') return t('p2.subscriptions.schedule.ALTERNATE');
  return (s.weekdays ?? []).map((w) => t(`common.days.${w}`)).join(', ');
}

// ─────────────────────────────────────── change / edit a subscription

export type ReviseProblem = 'START' | 'NOTHING' | 'SCHEDULE' | 'FEE' | Exclude<LinesProblem, null>;

const sameLines = (a: readonly SubLine[], b: readonly SubLine[]) =>
  a.length === b.length && a.every((l, i) => l.lineKey === b[i].lineKey && l.itemName === b[i].itemName
    && l.unit === b[i].unit && l.qty === b[i].qty && l.ratePaise === b[i].ratePaise);

const sameSchedule = (a: Schedule, b?: Schedule) =>
  !!b && a.pattern === b.pattern
  && (a.pattern !== 'WEEKDAYS' || [...(a.weekdays ?? [])].sort().join() === [...(b.weekdays ?? [])].sort().join());

const sameBilling = (a: Billing, b?: Billing) =>
  !!b && a.mode === b.mode && (a.mode !== 'FIXED_MONTHLY' || a.monthlyFeePaise === b.monthlyFeePaise);

/**
 * `POST /:id/revise` body: only the parts that changed (an unchanged ALTERNATE
 * schedule is not re-sent, so its day parity is not re-counted), or what to fix.
 */
export function buildReviseBody(
  current: Revision | undefined,
  d: { effectiveFrom: string; lines: LineDraft[]; schedule: ScheduleDraft; billing: BillingDraft },
): { body: ReviseBody; problem: null } | { body: null; problem: ReviseProblem } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.effectiveFrom)) return { body: null, problem: 'START' };
  const l = draftToLines(d.lines, current?.lines ?? []);
  if (l.problem !== null) return { body: null, problem: l.problem };
  const schedule = draftToSchedule(d.schedule);
  if (!schedule) return { body: null, problem: 'SCHEDULE' };
  const billing = draftToBilling(d.billing);
  if (!billing) return { body: null, problem: 'FEE' };
  const body: ReviseBody = { effectiveFrom: d.effectiveFrom };
  if (!current || !sameLines(l.lines, current.lines)) body.lines = l.lines;
  if (!sameSchedule(schedule, current?.schedule)) body.schedule = schedule;
  if (!sameBilling(billing, current?.billing)) body.billing = billing;
  if (!body.lines && !body.schedule && !body.billing) return { body: null, problem: 'NOTHING' };
  return { body, problem: null };
}

export type AutoIssueChoice = 'DEFAULT' | 'YES' | 'NO';
export interface EditDraft {
  title: string; routeId: string | null; routeSeq: string; billDay: string; autoIssue: AutoIssueChoice; notes: string;
}
export type EditProblem = 'TITLE' | 'SEQ' | 'BILL_DAY' | 'NOTHING';

export const editDraftOf = (s: Subscription): EditDraft => ({
  title: s.title,
  routeId: s.routeId ? String(s.routeId) : null,
  routeSeq: s.routeSeq !== undefined && s.routeSeq !== null ? String(s.routeSeq) : '',
  billDay: s.billDay ? String(s.billDay) : '',
  autoIssue: s.autoIssue === true ? 'YES' : s.autoIssue === false ? 'NO' : 'DEFAULT',
  notes: s.notes ?? '',
});

/** `PUT /:id` body with only what changed (`null` = back to the shop's setting / no route). */
export function buildEditBody(s: Subscription, d: EditDraft): { body: EditBody; problem: null } | { body: null; problem: EditProblem } {
  const was = editDraftOf(s);
  const body: EditBody = {};
  const title = d.title.trim();
  if (title !== was.title) {
    if (title.length < 2 || title.length > 80) return { body: null, problem: 'TITLE' };
    body.title = title;
  }
  if (d.routeId !== was.routeId) body.routeId = d.routeId;
  if (d.routeId && d.routeSeq.trim() !== was.routeSeq) {
    const n = Number(d.routeSeq.trim());
    if (!d.routeSeq.trim() || !Number.isInteger(n) || n < 0 || n > 100000) return { body: null, problem: 'SEQ' };
    body.routeSeq = n;
  }
  if (d.billDay.trim() !== was.billDay) {
    if (!d.billDay.trim()) body.billDay = null;
    else {
      const n = Number(d.billDay.trim());
      if (!Number.isInteger(n) || n < 1 || n > 28) return { body: null, problem: 'BILL_DAY' };
      body.billDay = n;
    }
  }
  if (d.autoIssue !== was.autoIssue) body.autoIssue = d.autoIssue === 'DEFAULT' ? null : d.autoIssue === 'YES';
  if (d.notes.trim() !== was.notes.trim()) body.notes = d.notes.trim().slice(0, 300);
  if (!Object.keys(body).length) return { body: null, problem: 'NOTHING' };
  return { body, problem: null };
}

// ───────────────────────────────────────────────── walking order

/**
 * The starting order of a route's subscriptions: by `routeSeq` when the server
 * sends it, else by today's sheet (which is in walking order), else by code.
 */
export function initialOrder(
  rows: readonly { id: string; code: string; routeSeq?: number }[], sheetOrder: readonly string[] = [],
): string[] {
  const pos = new Map(sheetOrder.map((id, i) => [id, i]));
  const rank = (r: { id: string; routeSeq?: number }) =>
    (typeof r.routeSeq === 'number' ? r.routeSeq : pos.has(r.id) ? 1e6 + (pos.get(r.id) as number) : 2e6);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code)).map((r) => r.id);
}

/** Move the item at `i` one place up (-1) or down (+1). */
export function moveItem<T>(list: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
