/**
 * Partner suite P2 — PHARMACY: the pure rules the screens and the reusable
 * billing pieces share. No React, no network, no device time zone — every date
 * is read in IST, the same way the server's `pharmacy-fefo.ts` reads it.
 */
import type { BatchRow, BatchStatus, RxDetails, RxWire, SplitBatchInput } from './types';

const IST_MS = 330 * 60_000;

type T = (key: string, opts?: Record<string, unknown>) => string;

// ─────────────────────────────────────────────────────────── prescription

export const EMPTY_RX: RxDetails = Object.freeze({ patientName: '', doctorName: '' }) as RxDetails;

/**
 * An i18n KEY naming the first missing required field, or null. The server's
 * rule (`rxDetailsSchema`): patient and doctor names are at least 2 letters.
 */
export function rxProblem(v: RxDetails): string | null {
  if ((v.patientName ?? '').trim().length < 2) return 'p2.pharmacy.rx.needPatient';
  if ((v.doctorName ?? '').trim().length < 2) return 'p2.pharmacy.rx.needDoctor';
  return null;
}

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** The `rx` object for the wire: trimmed, empty optionals dropped, rxDate at IST midnight. */
export function rxBody(v: RxDetails): RxWire {
  const out: RxWire = { patientName: (v.patientName ?? '').trim(), doctorName: (v.doctorName ?? '').trim() };
  const opt = ['patientPhone', 'patientAddress', 'doctorRegNo', 'doctorAddress', 'rxNo'] as const;
  for (const k of opt) {
    const s = (v[k] ?? '').trim();
    if (s) out[k] = s;
  }
  const d = (v.rxDate ?? '').trim();
  if (DAY_RE.test(d)) out.rxDate = `${d}T00:00:00+05:30`;
  return out;
}

/** Does a product of this schedule need a prescription at this business? */
export function needsRx(schedule: string | undefined, requireRxFor: readonly string[]): schedule is 'H' | 'H1' {
  return (schedule === 'H' || schedule === 'H1') && requireRxFor.includes(schedule);
}

/** Schedule X: never shown to residents, never sold without the paper register. */
export const isScheduleX = (schedule: string | undefined | null): boolean => schedule === 'X';

// ─────────────────────────────────────────────────────────── batches

export function batchStatusTone(status: BatchStatus | string | undefined): 'good' | 'warn' | 'bad' | 'neutral' {
  if (status === 'EXPIRED') return 'bad';
  if (status === 'NEAR_EXPIRY') return 'warn';
  if (status === 'OK') return 'good';
  return 'neutral';
}

/** The IST day of an instant, `YYYY-MM-DD`; '' when unreadable. */
export function istDayOfIso(iso: string | Date | undefined | null): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** An expiry as the strip prints it: 'MM/YYYY', read in IST ('' when unreadable). */
export function expiryLabel(iso: string | Date | undefined | null): string {
  const day = istDayOfIso(iso);
  if (!day) return '';
  return `${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

/** The expiry month of an instant for an edit field, `YYYY-MM` in IST. */
export function expiryMonthOf(iso: string | undefined | null): string {
  return istDayOfIso(iso).slice(0, 7);
}

/**
 * What a person typed for an expiry → `YYYY-MM` (what the server wants), or null.
 * Accepts `2027-03`, `03/2027`, `3/2027`, `03/27`, `03-2027`.
 */
export function parseExpiryMonth(input: string): string | null {
  const s = String(input ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (m) return monthOk(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})[/-](\d{4}|\d{2})$/.exec(s);
  if (m) {
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return monthOk(y, Number(m[1]));
  }
  return null;
}

function monthOk(y: number, mo: number): string | null {
  if (!(mo >= 1 && mo <= 12) || y < 2000 || y > 2099) return null;
  return `${y}-${String(mo).padStart(2, '0')}`;
}

/** A quantity for reading: at most 3 decimals, no trailing zeros. */
export function fmtQty(n: number | undefined | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '0';
  return String(Math.round(n * 1000) / 1000);
}

/** "Expired 3 days ago" / "Expires today" / "12 days left". */
export function daysLabel(days: number, t: T): string {
  if (days < 0) return t('p2.pharmacy.days.expiredAgo', { count: -days });
  if (days === 0) return t('p2.pharmacy.days.today');
  return t('p2.pharmacy.days.left', { count: days });
}

/** A near-expiry bucket's server label → words: 'EXPIRED' → "Expired", '≤30' → "Within 30 days". */
export function bucketLabel(label: string, t: T): string {
  if (label === 'EXPIRED') return t('p2.pharmacy.bucket.expired');
  const m = /^≤(\d+)$/.exec(label);
  if (m) return t('p2.pharmacy.bucket.within', { days: Number(m[1]) });
  return label;
}

/**
 * Which of the server's buckets a row belongs to — the server's own
 * `bucketFor`: expired → 'EXPIRED', else the smallest '≤N' with days ≤ N.
 * null when none fits (the row is then shown under no heading).
 */
export function bucketOfRow(daysToExpiry: number, labels: readonly string[]): string | null {
  if (daysToExpiry < 0) return labels.includes('EXPIRED') ? 'EXPIRED' : null;
  const limits = labels
    .map((l) => /^≤(\d+)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  const hit = limits.find((n) => daysToExpiry <= n);
  return hit === undefined ? null : `≤${hit}`;
}

/** Rows grouped under the server's buckets, in the buckets' order; empty groups dropped. */
export function groupByBucket(rows: readonly BatchRow[], labels: readonly string[]): { label: string; rows: BatchRow[] }[] {
  const groups = labels.map((label) => ({ label, rows: [] as BatchRow[] }));
  for (const r of rows) {
    const b = bucketOfRow(r.daysToExpiry, labels);
    const g = groups.find((x) => x.label === b);
    if (g) g.rows.push(r);
  }
  return groups.filter((g) => g.rows.length > 0);
}

/**
 * The batch detail route. There is no `GET /batches/:id`, so the product id
 * rides along (the screen reads the batch from the product's batches).
 */
export const batchPath = (b: Pick<BatchRow, 'id' | 'productId'>): string =>
  `/pharmacy/batch/${b.id}?productId=${encodeURIComponent(b.productId)}`;

export const productPath = (productId: string): string => `/pharmacy/product/${productId}`;

/** The batch picker's order: earliest expiry first, ties by batch number. */
export function sortForPick(rows: readonly BatchRow[]): BatchRow[] {
  return [...rows].sort((a, b) =>
    new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime() || a.batchNo.localeCompare(b.batchNo));
}

// ─────────────────────────────────────────────────────────── split

export interface SplitDraftRow {
  batchNo: string;
  /** What was typed; parsed with `parseExpiryMonth`. */
  expiry: string;
  /** Rupees as typed, optional. */
  mrp: string;
  qty: string;
}

export const EMPTY_SPLIT_ROW: SplitDraftRow = Object.freeze({ batchNo: '', expiry: '', mrp: '', qty: '' }) as SplitDraftRow;

export interface Problem { key: string; params?: Record<string, string | number> }

const toPaise = (s: string): number | null => {
  const cleaned = s.replace(/[₹,\s]/g, '');
  if (!cleaned) return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const toQty = (s: string): number => {
  const n = Number(String(s ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
};

/** Sum of the typed quantities. */
export const splitSum = (rows: readonly SplitDraftRow[]): number =>
  Math.round(rows.reduce((n, r) => n + toQty(r.qty), 0) * 1000) / 1000;

/**
 * The first problem with a split draft, checked on the phone before the
 * request (the server checks again: BATCH_SPLIT_EXCEEDS_UNBATCHED).
 */
export function splitProblem(rows: readonly SplitDraftRow[], unbatchedQty: number): Problem | null {
  if (rows.length < 1) return { key: 'p2.pharmacy.split.problem.none' };
  if (rows.length > 50) return { key: 'p2.pharmacy.split.problem.tooMany' };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const row = i + 1;
    const no = r.batchNo.trim();
    if (!no || no.length > 30) return { key: 'p2.pharmacy.split.problem.batchNo', params: { row } };
    if (!parseExpiryMonth(r.expiry)) return { key: 'p2.pharmacy.split.problem.expiry', params: { row } };
    if (r.mrp.trim() && toPaise(r.mrp) === null) return { key: 'p2.pharmacy.split.problem.mrp', params: { row } };
    if (!(toQty(r.qty) > 0)) return { key: 'p2.pharmacy.split.problem.qty', params: { row } };
  }
  const sum = splitSum(rows);
  if (sum > unbatchedQty + 1e-9) {
    return { key: 'p2.pharmacy.split.problem.tooMuch', params: { sum: fmtQty(sum), max: fmtQty(unbatchedQty) } };
  }
  return null;
}

/** The split draft → the wire rows (call only when `splitProblem` is null). */
export function splitBody(rows: readonly SplitDraftRow[]): SplitBatchInput[] {
  return rows.map((r) => {
    const mrp = r.mrp.trim() ? toPaise(r.mrp) : null;
    return {
      batchNo: r.batchNo.trim().toUpperCase(),
      expiryDate: parseExpiryMonth(r.expiry) as string,
      ...(mrp !== null ? { mrpPaise: mrp } : {}),
      qty: toQty(r.qty),
    };
  });
}

// ─────────────────────────────────────────────────────────── correction

export interface CorrectionDraft {
  mrp: string;
  /** `YYYY-MM-DD` or '' (cleared). */
  mfgDay: string;
  expiry: string;
  note: string;
}

export function correctionDraftOf(b: BatchRow): CorrectionDraft {
  return {
    mrp: typeof b.mrpPaise === 'number' ? (b.mrpPaise / 100).toFixed(2) : '',
    mfgDay: istDayOfIso(b.mfgDate),
    expiry: expiryMonthOf(b.expiryDate),
    note: '',
  };
}

/**
 * The correction body with only what changed, or a problem. `mrp` / `mfgDay`
 * emptied where the batch had one → `null` (cleared). Always carries `note`.
 */
export function correctionBody(
  b: BatchRow, d: CorrectionDraft,
): { body: { mrpPaise?: number | null; mfgDate?: string | null; expiryDate?: string; note: string } } | { problem: Problem } {
  const note = d.note.trim();
  const body: { mrpPaise?: number | null; mfgDate?: string | null; expiryDate?: string; note: string } = { note };
  const was = correctionDraftOf(b);
  if (d.mrp.trim() !== was.mrp) {
    if (!d.mrp.trim()) body.mrpPaise = null;
    else {
      const p = toPaise(d.mrp);
      if (p === null) return { problem: { key: 'p2.pharmacy.correct.badMrp' } };
      if (p !== b.mrpPaise) body.mrpPaise = p;
    }
  }
  if (d.mfgDay !== was.mfgDay) body.mfgDate = d.mfgDay ? `${d.mfgDay}T00:00:00+05:30` : null;
  if (d.expiry.trim() !== was.expiry) {
    const m = parseExpiryMonth(d.expiry);
    if (!m) return { problem: { key: 'p2.pharmacy.correct.badExpiry' } };
    if (m !== was.expiry) body.expiryDate = m;
  }
  if (Object.keys(body).length === 1) return { problem: { key: 'p2.pharmacy.correct.nothing' } };
  if (note.length < 3 || note.length > 200) return { problem: { key: 'p2.pharmacy.correct.needNote' } };
  return { body };
}
