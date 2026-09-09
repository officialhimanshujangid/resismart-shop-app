/**
 * When this business can be booked — the mobile twin of
 * `frontend/src/app/(dashboard)/dashboard/partner/availability/{draft,shared}.ts`.
 *
 * SCOPE NOTE: this app builds the business's OWN schedule only
 * (`staffId: null`), not per-staff overrides. The web screen lets an owner
 * give one staff member their own hours; that is a secondary need (the
 * business cannot take a SINGLE booking without its own schedule, which is
 * C2's actual severity) and is left for a later pass — see the final report.
 * `PartnerAvailability.staffId` still exists on the wire shape below so a
 * business-scoped row round-trips exactly, it is just never set to anything
 * but `null` from this app.
 *
 * These rows are a RULE, not a diary — "Tuesdays, ten till seven,
 * thirty-minute slots, two customers at once, shut for lunch, closed on
 * these dates". `booking-slots.service.ts` is what turns the rule into
 * bookable slots; nothing here computes one.
 */
import type { Translate } from '../services/duration';

export interface AvailabilityWindow { from: string; to: string }

export interface AvailabilityDay {
  /** 0 = Sunday … 6 = Saturday, matching `Date.getDay()`. */
  day: number;
  isOpen: boolean;
  windows: AvailabilityWindow[];
  slotMin: number;
  capacityPerSlot: number;
}

export interface AvailabilityBreak { day: number; from: string; to: string }

/** `PartnerAvailability`, as `GET /partners/me/availability/one` returns it. */
export interface AvailabilityRow {
  _id: string;
  staffId: string | null;
  timezone: string;
  weekly: AvailabilityDay[];
  breaks: AvailabilityBreak[];
  /** ISO instants at UTC midnight, as the model stores them. */
  blackoutDates: string[];
  advanceBookingDays: number;
  cutoffMin: number;
  isActive: boolean;
}

/**
 * WEEKDAY NAMES ARE I18N KEYS, INDEXED BY THE WIRE VALUE.
 *
 * The wire value is the INDEX — `day: 0…6`, matching `Date.getDay()`, which is
 * what `weekly[].day` carries in both directions and what
 * `booking-slots.service.ts` reads. Nothing here is ever posted; only the
 * position is. So unlike `GST_STATES` in `billing/types.ts`, these are display
 * labels and translating them is correct — the same split that file's header
 * draws between `DOCUMENT_TYPE_LABEL_KEY` and the state table.
 *
 * `common.daysLong` and `common.days` are one catalogue read by every screen:
 * a private array here is how this file and the register screen's weekday
 * picker would end up able to disagree about the same day.
 */
export const DAY_NAME_KEYS = [
  'common.daysLong.0', 'common.daysLong.1', 'common.daysLong.2', 'common.daysLong.3',
  'common.daysLong.4', 'common.daysLong.5', 'common.daysLong.6',
] as const;
export const DAY_SHORT_KEYS = [
  'common.days.0', 'common.days.1', 'common.days.2', 'common.days.3',
  'common.days.4', 'common.days.5', 'common.days.6',
] as const;

export const DEFAULT_SLOT_MIN = 30;
export const DEFAULT_CAPACITY = 1;

/** The shape the editor holds while the schedule is being edited. */
export interface AvailabilityDraft {
  timezone: string;
  /** Always seven entries, indexed by weekday. */
  days: AvailabilityDay[];
  breaks: AvailabilityBreak[];
  /** `'YYYY-MM-DD'` tokens, the shape the API takes and gives back. */
  blackoutDates: string[];
  advanceBookingDays: number;
  cutoffMin: number;
  isActive: boolean;
}

const defaultWindow = (): AvailabilityWindow => ({ from: '10:00', to: '19:00' });

const blankDay = (day: number): AvailabilityDay => ({
  day,
  isOpen: false,
  windows: [defaultWindow()],
  slotMin: DEFAULT_SLOT_MIN,
  capacityPerSlot: DEFAULT_CAPACITY,
});

/** A brand-new schedule: Monday to Saturday, ten till seven — a starting point, not a blank form. */
export function starterDraft(timezone: string): AvailabilityDraft {
  return {
    timezone,
    days: Array.from({ length: 7 }, (_, day) => ({ ...blankDay(day), isOpen: day !== 0 })),
    breaks: [],
    blackoutDates: [],
    advanceBookingDays: 30,
    // Half an hour's notice — also the line the cancellation-forfeit rule
    // turns on, so deliberately not zero.
    cutoffMin: 30,
    isActive: true,
  };
}

/** `'2026-08-15T00:00:00.000Z'` → `'2026-08-15'`. Safe: the model stores UTC midnight. */
export const blackoutToYmd = (iso: string): string => String(iso || '').slice(0, 10);

export function draftFromRow(row: AvailabilityRow, fallbackTimezone: string): AvailabilityDraft {
  const byDay = new Map((row.weekly || []).map((d) => [d.day, d]));
  return {
    timezone: row.timezone || fallbackTimezone,
    days: Array.from({ length: 7 }, (_, day) => {
      const stored = byDay.get(day);
      if (!stored) return blankDay(day);
      return {
        day,
        isOpen: stored.isOpen !== false,
        windows: stored.windows?.length ? stored.windows.map((w) => ({ ...w })) : [defaultWindow()],
        slotMin: stored.slotMin || DEFAULT_SLOT_MIN,
        capacityPerSlot: stored.capacityPerSlot || DEFAULT_CAPACITY,
      };
    }),
    breaks: (row.breaks || []).map((b) => ({ ...b })),
    blackoutDates: (row.blackoutDates || []).map(blackoutToYmd).filter(Boolean),
    advanceBookingDays: row.advanceBookingDays ?? 30,
    cutoffMin: row.cutoffMin ?? 30,
    isActive: row.isActive !== false,
  };
}

/**
 * What goes on the wire. `staffId: null` — this app writes the business's
 * own schedule only (see the file header).
 *
 * A CLOSED day is sent with `windows: []`; it keeps its old hours in the
 * draft (so reopening it does not lose them) but must not send them while
 * `isOpen: false`, or the day the flag gets flipped server-side the shop
 * opens on hours it never agreed to. Breaks on closed days are dropped for
 * the same reason.
 */
export function bodyFromDraft(draft: AvailabilityDraft) {
  const openDays = new Set(draft.days.filter((d) => d.isOpen).map((d) => d.day));
  return {
    staffId: null,
    timezone: draft.timezone,
    weekly: draft.days.map((d) => ({
      day: d.day,
      isOpen: d.isOpen,
      windows: d.isOpen ? d.windows.map((w) => ({ from: w.from, to: w.to })) : [],
      slotMin: d.slotMin,
      capacityPerSlot: d.capacityPerSlot,
    })),
    breaks: draft.breaks.filter((b) => openDays.has(b.day)),
    blackoutDates: draft.blackoutDates,
    advanceBookingDays: draft.advanceBookingDays,
    cutoffMin: draft.cutoffMin,
    isActive: draft.isActive,
  };
}

/** The zone this screen is drawn in when no schedule has been saved yet — the device's own, not a hardcoded `Asia/Kolkata`. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

const minutesBetween = (from: string, to: string): number => {
  const [fh, fm] = from.split(':');
  const [th, tm] = to.split(':');
  return (Number(th) * 60 + Number(tm)) - (Number(fh) * 60 + Number(fm));
};

/**
 * The reason this schedule cannot be saved, or `null`. Every check here is
 * also refused by the model/validator (`booking.validator.ts`); restated so
 * the partner is told before the request round-trips, in the field's own
 * language rather than a Mongoose sentence.
 *
 * `t` is handed in — this is a plain function, not a component, and the one
 * caller (`availability/index.tsx`) already holds a translator. The same shape
 * `bookings/format.ts` uses, and for the same reason: a module-level `t` would
 * freeze the language at import.
 */
export function draftProblem(draft: AvailabilityDraft, t: Translate): string | null {
  const dayName = (day: number) => t(DAY_NAME_KEYS[day]);
  const open = draft.days.filter((d) => d.isOpen);
  if (!open.length) {
    return draft.isActive ? t('availability.problem.allClosed') : null;
  }
  for (const d of open) {
    if (!d.windows.length) return t('availability.problem.noHours', { day: dayName(d.day) });
    for (const w of d.windows) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(w.from) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.to)) {
        return t('availability.problem.notATime', { day: dayName(d.day) });
      }
      if (w.from >= w.to) {
        return t('availability.problem.closeBeforeOpen', { day: dayName(d.day) });
      }
    }
    const sorted = [...d.windows].sort((a, b) => a.from.localeCompare(b.from));
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].from < sorted[i - 1].to) {
        return t('availability.problem.overlap', { day: dayName(d.day) });
      }
    }
    const shortest = Math.min(...d.windows.map((w) => minutesBetween(w.from, w.to)));
    if (d.slotMin > shortest) {
      return t('availability.problem.slotTooLong', { day: dayName(d.day) });
    }
  }
  for (const b of draft.breaks) {
    if (b.from >= b.to) {
      return t('availability.problem.breakBackwards', { day: dayName(b.day) });
    }
  }
  return null;
}
