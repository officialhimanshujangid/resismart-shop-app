import { parseRupeesToPaise, paiseToInput } from '../../lib/money';
import type { CollectionPlan, KhataCadence, KhataSettingsBody, PartyCredit, PartyCreditMode } from './api';

/**
 * Khata's pure rules — tested directly. The server validates the same things
 * (`khataSettingsSchema`); these only stop the app sending what it would refuse.
 */

/**
 * What goes into the phone's share sheet for a SHARE reminder: the server's
 * sentence, then the statement link and the UPI link on their own lines —
 * each only once, even if the server already put it in the sentence.
 */
export function shareMessage(r: { text: string; url?: string; upiUri?: string }): string {
  const parts = [r.text.trim()];
  if (r.url && !r.text.includes(r.url)) parts.push(r.url);
  if (r.upiUri && !r.text.includes(r.upiUri)) parts.push(r.upiUri);
  return parts.filter(Boolean).join('\n');
}

export interface KhataForm {
  hasLimit: boolean;
  limit: string;
  days: string;
  mode: PartyCreditMode;
  cadence: KhataCadence;
  nextDate: string;
  weekday: number;
  dayOfMonth: number;
  autoRemind: boolean;
}

export function formFrom(credit?: PartyCredit, plan?: CollectionPlan): KhataForm {
  return {
    hasLimit: typeof credit?.limitPaise === 'number',
    limit: typeof credit?.limitPaise === 'number' ? paiseToInput(credit.limitPaise) : '',
    days: typeof credit?.days === 'number' ? String(credit.days) : '',
    mode: credit?.mode ?? 'WARN',
    cadence: plan?.cadence ?? 'NONE',
    nextDate: plan?.nextDate ? plan.nextDate.slice(0, 10) : '',
    weekday: plan?.weekday ?? 1,
    dayOfMonth: plan?.dayOfMonth ?? 1,
    autoRemind: plan?.autoRemind ?? false,
  };
}

export type KhataFormError = 'limit' | 'days' | 'nextDate' | 'dayOfMonth';

/** The request body, or the first field that is wrong. */
export function buildKhataBody(f: KhataForm, isoOf: (ymd: string) => string | undefined): { body?: KhataSettingsBody; error?: KhataFormError } {
  let credit: KhataSettingsBody['credit'] = null;
  const days = f.days.trim() ? Number(f.days) : undefined;
  if (days !== undefined && (!Number.isInteger(days) || days < 0 || days > 365)) return { error: 'days' };
  if (f.hasLimit) {
    const limitPaise = parseRupeesToPaise(f.limit);
    if (limitPaise === null) return { error: 'limit' };
    credit = { limitPaise, days: days ?? null, mode: f.mode };
  } else if (days !== undefined) {
    credit = { limitPaise: null, days, mode: f.mode };
  }

  let collectionPlan: KhataSettingsBody['collectionPlan'] = null;
  if (f.cadence !== 'NONE' || f.autoRemind) {
    if (f.cadence === 'ON_DATE' && !f.nextDate) return { error: 'nextDate' };
    if (f.cadence === 'MONTHLY' && (f.dayOfMonth < 1 || f.dayOfMonth > 28)) return { error: 'dayOfMonth' };
    collectionPlan = {
      cadence: f.cadence,
      autoRemind: f.autoRemind,
      nextDate: f.nextDate ? isoOf(f.nextDate) ?? null : null,
      ...(f.cadence === 'WEEKLY' ? { weekday: f.weekday } : {}),
      ...(f.cadence === 'MONTHLY' ? { dayOfMonth: f.dayOfMonth } : {}),
    };
  }
  return { body: { credit, collectionPlan } };
}
