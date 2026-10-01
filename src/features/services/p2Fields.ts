/**
 * The P2 service fields (CONTRACT-partner-P2 §1.1, B0 `P2-B0-SERVICE-FIELDS`):
 * `bufferMin` 0–120, `sac` 4–8 digits, `taxRatePercent` 0–40 and — JOBS only —
 * `isJob`. Pure, unit-tested.
 *
 * THE HARD RULE: a business with neither APPOINTMENTS nor JOBS sends exactly
 * today's body — none of these keys at all. With a module on:
 *   create — a key only when it has a value (`null` is a 400 on create);
 *   edit   — a value when set, `null` when the service HAD one and it was
 *            cleared (the server `$unset`s it), nothing when it never had one.
 */
import type { PartnerServiceRow } from './types';

export interface P2ServiceDraft {
  bufferMin: number;
  sac: string;
  /** `null` = not set. */
  taxRatePercent: number | null;
  isJob: boolean;
}

export const P2_TAX_RATES = [0, 5, 12, 18, 28, 40] as const;
export const MAX_BUFFER_MIN = 120;

export const p2DraftFromRow = (row: PartnerServiceRow | null): P2ServiceDraft => ({
  bufferMin: row?.bufferMin ?? 0,
  sac: row?.sac ?? '',
  taxRatePercent: typeof row?.taxRatePercent === 'number' ? row.taxRatePercent : null,
  isJob: row?.isJob === true,
});

/** The i18n key of what is wrong, or `null`. */
export function p2Problem(d: P2ServiceDraft, show: boolean): string | null {
  if (!show) return null;
  if (!Number.isInteger(d.bufferMin) || d.bufferMin < 0 || d.bufferMin > MAX_BUFFER_MIN) return 'services.p2.bufferInvalid';
  if (d.sac.trim() && !/^\d{4,8}$/.test(d.sac.trim())) return 'services.p2.sacInvalid';
  if (d.taxRatePercent !== null && !(d.taxRatePercent >= 0 && d.taxRatePercent <= 40)) return 'services.p2.taxInvalid';
  return null;
}

export interface P2BodyPart {
  bufferMin?: number | null;
  sac?: string | null;
  taxRatePercent?: number | null;
  isJob?: boolean | null;
}

/**
 * The keys to add to the body. `show` = APPOINTMENTS or JOBS is on; `jobs` =
 * JOBS is on (only then is `isJob` touched). `initial` is `null` when creating.
 */
export function p2BodyPart(
  d: P2ServiceDraft, initial: PartnerServiceRow | null, show: boolean, jobs: boolean,
): P2BodyPart {
  if (!show) return {};
  const out: P2BodyPart = {};
  const put = <K extends keyof P2BodyPart>(key: K, value: P2BodyPart[K] | undefined, had: boolean) => {
    if (value !== undefined) out[key] = value;
    else if (initial && had) out[key] = null;
  };
  const sac = d.sac.trim();
  put('bufferMin', d.bufferMin > 0 ? d.bufferMin : undefined, typeof initial?.bufferMin === 'number' && initial.bufferMin > 0);
  put('sac', sac || undefined, !!initial?.sac);
  put('taxRatePercent', d.taxRatePercent ?? undefined, typeof initial?.taxRatePercent === 'number');
  if (jobs) put('isJob', d.isJob ? true : undefined, initial?.isJob === true);
  return out;
}
