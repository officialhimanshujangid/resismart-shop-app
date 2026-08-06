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

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

const DAY_LABEL = DAY_NAMES;

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
 */
export function draftProblem(draft: AvailabilityDraft): string | null {
  const open = draft.days.filter((d) => d.isOpen);
  if (!open.length) {
    return draft.isActive
      ? 'Every day is closed, so nobody can book anything. Open at least one day, or switch off "Taking bookings" below if that is what you meant.'
      : null;
  }
  for (const d of open) {
    if (!d.windows.length) return `You have not said what hours you are open on ${DAY_LABEL[d.day]}.`;
    for (const w of d.windows) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(w.from) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.to)) {
        return `Those opening hours on ${DAY_LABEL[d.day]} are not a time.`;
      }
      if (w.from >= w.to) {
        return `On ${DAY_LABEL[d.day]} you close before you open. A window like that produces no slots at all.`;
      }
    }
    const sorted = [...d.windows].sort((a, b) => a.from.localeCompare(b.from));
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].from < sorted[i - 1].to) {
        return `Your opening hours on ${DAY_LABEL[d.day]} overlap each other.`;
      }
    }
    const shortest = Math.min(...d.windows.map((w) => minutesBetween(w.from, w.to)));
    if (d.slotMin > shortest) {
      return `On ${DAY_LABEL[d.day]} a slot is longer than the time you are open, so there is nothing to book.`;
    }
  }
  for (const b of draft.breaks) {
    if (b.from >= b.to) {
      return `That break on ${DAY_LABEL[b.day]} ends before it starts, which blocks nothing while looking like a lunch hour.`;
    }
  }
  return null;
}
