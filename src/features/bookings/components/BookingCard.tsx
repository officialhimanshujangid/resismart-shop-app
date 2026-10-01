import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Surface, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { StatusBadge } from './StatusBadge';
import { BookingVerb, PartnerBookingView } from '../booking.types';
import { VERB_LABEL_KEYS } from '../booking.types';
import { formatDateTime, formatMinutes, formatTime, minutesBetween, Translate } from '../format';
import { formatPaise } from '../../../lib/money';
import { themeColors, radii } from '../../../constants/colors';

/**
 * Verbs this vertical can actually act on.
 *
 * `booking-transitions.ts` also names `invoice` and `markPaid` from COMPLETED /
 * INVOICED — real answers for a MANAGER viewer — but `booking.routes.ts` never
 * mounts a route for either; that is P6's billing engine, reached from the
 * Billing tab. Rendering a button for a verb with no route is the exact failure
 * the spec calls out ("an action that 400s teaches the partner not to trust the
 * app") — here it would 404, which is worse, because there is no controller to
 * even write the refusal sentence.
 */
const ROUTED_VERBS = new Set<BookingVerb>([
  'accept', 'reject', 'assign', 'reschedule', 'start', 'reach', 'complete', 'noShow', 'cancel', 'note',
  // P6 mounted `/:id/invoice` and `/:id/mark-paid`; the note above was written
  // before it and outlived it. While they were excluded, a job finished on a
  // phone stopped dead at COMPLETED — no invoice, no payment, nothing on the
  // customer's balance — and the partner had no way to tell that anything was
  // outstanding.
  'invoice', 'markPaid',
  // `POST /:id/extend` — mounted on the same router as every verb above.
  'extend',
]);

/** Reading order for the action row — the happy path left to right, `cancel` always last. */
const VERB_ORDER: BookingVerb[] = [
  'accept', 'start', 'reach', 'complete', 'invoice', 'markPaid',
  // Directly after `complete`: on a job that is running long the two are the
  // same decision asked from opposite ends — finish now and hand the rest back,
  // or claim more of the diary out loud.
  'extend',
  'assign', 'reschedule', 'reject', 'noShow', 'cancel', 'note',
];

/**
 * How this job is running against the hour it was sold, from fields the booking
 * view ALREADY carries.
 *
 * No request. `slotEnd` (what was agreed), `occupiesUntil` (what the diary is
 * actually blocked for) and `actual` all travel on every partner-side booking
 * response, so a timeline of twenty cards costs twenty sentences and zero calls;
 * `GET /:id/overrun` is for the sheet, where `canExtendByMin` and the
 * appointments behind matter and are worth a round trip.
 *
 * `now` is passed in rather than read here so the card can tick — see the
 * interval in the component. `overrunning` travels beside the sentence rather
 * than being sniffed back out of it: a caller matching on the wording is a
 * caller that breaks the day somebody rewords the copy.
 */
interface ClockLine {
  text: string;
  /** Past its claim RIGHT NOW — the one state on this card that earns a colour. */
  overrunning: boolean;
}

// `t` is handed in — this is a plain function, and the sentence it builds is
// assembled from KEYS rather than concatenated English so a translator can
// reorder it. `clockJoin` is a key too, for the same reason.
function clockLine(booking: PartnerBookingView, now: number, t: Translate): ClockLine | null {
  const { status, slotEnd, occupiesUntil, actual } = booking;

  // Finished. What it actually took, and — the point of the whole feature —
  // whether the unused tail went back on sale.
  if (actual?.endedAt) {
    const took = actual.durationMin;
    const planned = booking.serviceSnapshot.durationMin;
    const handedBack = occupiesUntil ? minutesBetween(occupiesUntil, slotEnd) : 0;
    const parts: string[] = [];
    if (typeof took === 'number') {
      parts.push(t('bookings.card.took', { actual: formatMinutes(took, t), planned: formatMinutes(planned, t) }));
    }
    if (handedBack > 0) parts.push(t('bookings.card.handedBack', { amount: formatMinutes(handedBack, t) }));
    else if (handedBack < 0) parts.push(t('bookings.card.ranTo', { time: formatTime(occupiesUntil as string, t) }));
    return parts.length ? { text: parts.join(t('bookings.card.clockJoin')), overrunning: false } : null;
  }

  if (status !== 'IN_PROGRESS') return null;

  // Live. `occupiesUntil` is what the partner has actually claimed, so an
  // already-extended job counts its overrun from the EXTENDED end — saying
  // "40 minutes over" to somebody who asked for and was given those 40 minutes
  // would be the app arguing with a decision it just carried out.
  //
  // Compared as instants, not as strings. Both arrive as UTC ISO today and
  // would sort correctly, but that is a property of one serializer rather than
  // of the contract, and a clock is the wrong place to depend on it.
  const extended = Boolean(occupiesUntil) && minutesBetween(slotEnd, occupiesUntil as string) > 0;
  const claimEnd = extended ? (occupiesUntil as string) : slotEnd;
  const over = minutesBetween(claimEnd, now);
  if (over > 0) {
    return {
      text: t('bookings.card.runningOver', { amount: formatMinutes(over, t), time: formatTime(claimEnd, t) }),
      overrunning: true,
    };
  }
  const left = -over;
  if (extended) {
    return {
      text: t('bookings.card.extendedTo', { time: formatTime(claimEnd, t), left: formatMinutes(left, t) }),
      overrunning: false,
    };
  }
  return {
    text: t('bookings.card.timeLeft', {
      left: formatMinutes(left, t),
      planned: formatMinutes(booking.serviceSnapshot.durationMin, t),
    }),
    overrunning: false,
  };
}

export function routedVerbsOf(booking: PartnerBookingView): BookingVerb[] {
  return VERB_ORDER.filter((v) => ROUTED_VERBS.has(v) && booking.allowedVerbs.includes(v));
}

/** Which verbs are destructive/careful enough to ask "are you sure?" before firing with no form. */
// `invoice` and `markPaid` are here rather than in a form: neither takes any
// input the partner has to type. Both simply ask the server to read the billing
// engine and record what it finds, and their refusals are sentences about the
// bill, not about a field.
const CONFIRM_DIRECTLY = new Set<BookingVerb>(['accept', 'start', 'reach', 'noShow', 'invoice', 'markPaid']);
const OUTLINED_VERBS = new Set<BookingVerb>(['reject', 'cancel', 'noShow']);

interface Props {
  booking: PartnerBookingView;
  /** True while THIS booking has a mutation in flight — disables its own buttons only. */
  pending: boolean;
  onQuickAction: (verb: BookingVerb) => void;
  onOpenForm: (verb: BookingVerb) => void;
  compact?: boolean;
  isDark: boolean;
  /**
   * Open (or raise) the bill for a finished job. Drawn only when handed in and
   * only on COMPLETED / INVOICED / PAID — a job not yet done has nothing to bill.
   */
  onTaxInvoice?: () => void;
  /** True while that open/raise is in flight for THIS card. */
  taxInvoiceBusy?: boolean;
  /**
   * The shop is not GST registered, so the bill it raises is a bill of supply
   * (`documentTypeLabelKey` in `features/billing/types.ts`) — the button says so.
   */
  billOfSupply?: boolean;
  /**
   * P2 JOBS: "Send quote" for an open booking. Handed in only when the business
   * has the Jobs module and the person may quote; drawn only on the statuses
   * below. Absent = nothing changes.
   */
  onSendQuote?: () => void;
}

/** The statuses a job quote can be started from (the Jobs "Pick a booking" set). */
const QUOTABLE_BOOKING_STATUSES = new Set<string>(['ACCEPTED', 'SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS']);

/** The statuses a job can be billed in — `BILLABLE_BOOKING_STATUSES` on the server. */
const BILLABLE_STATUSES = new Set<string>(['COMPLETED', 'INVOICED', 'PAID']);

/**
 * One booking, drawn once and reused by both the Today timeline and the
 * Bookings tab.
 *
 * Buttons are drawn ONLY from `booking.allowedVerbs`, filtered to
 * `ROUTED_VERBS` above. That list is computed server-side, per THIS viewer, by
 * the same `allowedVerbs()` the transition table publishes — see
 * `booking.routes.ts`'s note on why the route floor is READ and not MANAGE: a
 * technician who is the ASSIGNEE gets `start`/`reach`/`complete` here and
 * nothing else, without this component asking a separate "may I manage
 * bookings" question that could disagree with the table.
 */
export function BookingCard({
  booking, pending, onQuickAction, onOpenForm, compact, isDark, onTaxInvoice, taxInvoiceBusy, billOfSupply, onSendQuote,
}: Props) {
  const { t } = useTranslation();
  const c = themeColors(isDark);
  const verbs = routedVerbsOf(booking);
  const money = formatPaise(booking.pricing.totalPaise);

  /**
   * A minute hand, and ONLY while a job is actually running.
   *
   * "You are running over" is worth nothing if it appears the next time
   * something else happens to refetch. The partner has to see it while the job
   * is under way and the next customer is still on their way, so a live card
   * re-renders every half minute; every other card mounts no timer at all. The
   * value is a tick counter rather than a stored `Date` — nothing reads it, and
   * `Date.now()` at render is what the sentence is computed against.
   */
  const live = booking.status === 'IN_PROGRESS';
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [live]);

  const clock = clockLine(booking, Date.now(), t);

  return (
    <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.time, { color: c.textPrimary }]}>
            {compact ? formatTime(booking.slotStart, t) : formatDateTime(booking.slotStart, t)}
          </Text>
          <Text style={[styles.service, { color: c.textPrimary }]} numberOfLines={1}>
            {booking.serviceSnapshot.name}
          </Text>
        </View>
        <StatusBadge status={booking.status} />
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.customer, { color: c.textSecondary }]} numberOfLines={1}>
          {/* Name, flat and society are the customer's own details as the server
              stored them — data on the booking, not copy. */}
          {booking.customer.name}
          {booking.customer.flatLabel ? t('bookings.card.flatSuffix', { flat: booking.customer.flatLabel }) : ''}
          {booking.customer.societyName ? t('bookings.card.societySuffix', { society: booking.customer.societyName }) : ''}
        </Text>
        <Text style={[styles.money, { color: c.textPrimary }]}>{money}</Text>
      </View>

      {booking.customer.contactMasked && booking.customer.maskNote ? (
        <Text style={[styles.maskNote, { color: c.textDisabled }]}>{booking.customer.maskNote}</Text>
      ) : null}

      {/* The clock. Drawn on the COMPACT card too — a partner scanning today's
          timeline is exactly the person who needs to see a job running over
          before the next customer arrives, and the compact card is the one on
          the Today screen. */}
      {clock && (
        <Text style={[styles.clock, { color: clock.overrunning ? c.warning : c.textSecondary }]}>
          {clock.text}
        </Text>
      )}

      {!compact && verbs.length > 0 && (
        <View style={styles.actions}>
          {verbs.map((verb) => (
            <Button
              key={verb}
              mode={OUTLINED_VERBS.has(verb) ? 'outlined' : 'contained-tonal'}
              compact
              disabled={pending}
              loading={pending}
              onPress={() => (CONFIRM_DIRECTLY.has(verb) ? onQuickAction(verb) : onOpenForm(verb))}
              style={styles.actionBtn}
              labelStyle={styles.actionLabel}
              textColor={verb === 'reject' || verb === 'cancel' ? c.error : undefined}
            >
              {t(VERB_LABEL_KEYS[verb])}
            </Button>
          ))}
          {pending && <ActivityIndicator size="small" style={{ marginLeft: 4 }} />}
        </View>
      )}

      {!compact && onTaxInvoice && BILLABLE_STATUSES.has(booking.status) && (
        <View style={styles.actions}>
          <Button
            mode="outlined"
            compact
            icon="file-document-outline"
            disabled={taxInvoiceBusy}
            loading={taxInvoiceBusy}
            onPress={onTaxInvoice}
            style={styles.actionBtn}
            labelStyle={styles.actionLabel}
          >
            {billOfSupply ? t('bookings.card.billOfSupply') : t('bookings.card.taxInvoice')}
          </Button>
        </View>
      )}

      {!compact && onSendQuote && QUOTABLE_BOOKING_STATUSES.has(booking.status) && (
        <View style={styles.actions}>
          <Button
            mode="outlined"
            compact
            icon="file-document-edit-outline"
            onPress={onSendQuote}
            style={styles.actionBtn}
            labelStyle={styles.actionLabel}
            testID={`booking-send-quote-${booking.id}`}
          >
            {t('p2.jobs.actions.sendQuote')}
          </Button>
        </View>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 14, gap: 8, marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  time: { fontSize: 13, fontWeight: '600' },
  service: { fontSize: 16, fontWeight: '600', marginTop: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customer: { fontSize: 13, flex: 1, marginRight: 8 },
  money: { fontSize: 13, fontWeight: '600' },
  maskNote: { fontSize: 11, fontStyle: 'italic' },
  clock: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  actionBtn: { borderRadius: radii.pill },
  actionLabel: { fontSize: 12, marginVertical: 6 },
});
