import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Surface, Text } from 'react-native-paper';
import { StatusBadge } from './StatusBadge';
import { BookingVerb, PartnerBookingView } from '../booking.types';
import { VERB_LABELS } from '../booking.types';
import { formatDateTime, formatTime } from '../format';
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
]);

/** Reading order for the action row — the happy path left to right, `cancel` always last. */
const VERB_ORDER: BookingVerb[] = [
  'accept', 'start', 'reach', 'complete', 'assign', 'reschedule', 'reject', 'noShow', 'cancel', 'note',
];

export function routedVerbsOf(booking: PartnerBookingView): BookingVerb[] {
  return VERB_ORDER.filter((v) => ROUTED_VERBS.has(v) && booking.allowedVerbs.includes(v));
}

/** Which verbs are destructive/careful enough to ask "are you sure?" before firing with no form. */
const CONFIRM_DIRECTLY = new Set<BookingVerb>(['accept', 'start', 'reach', 'noShow']);
const OUTLINED_VERBS = new Set<BookingVerb>(['reject', 'cancel', 'noShow']);

interface Props {
  booking: PartnerBookingView;
  /** True while THIS booking has a mutation in flight — disables its own buttons only. */
  pending: boolean;
  onQuickAction: (verb: BookingVerb) => void;
  onOpenForm: (verb: BookingVerb) => void;
  compact?: boolean;
  isDark: boolean;
}

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
export function BookingCard({ booking, pending, onQuickAction, onOpenForm, compact, isDark }: Props) {
  const c = themeColors(isDark);
  const verbs = routedVerbsOf(booking);
  const money = formatPaise(booking.pricing.totalPaise);

  return (
    <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.time, { color: c.textPrimary }]}>
            {compact ? formatTime(booking.slotStart) : formatDateTime(booking.slotStart)}
          </Text>
          <Text style={[styles.service, { color: c.textPrimary }]} numberOfLines={1}>
            {booking.serviceSnapshot.name}
          </Text>
        </View>
        <StatusBadge status={booking.status} />
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.customer, { color: c.textSecondary }]} numberOfLines={1}>
          {booking.customer.name}
          {booking.customer.flatLabel ? ` · ${booking.customer.flatLabel}` : ''}
          {booking.customer.societyName ? ` · ${booking.customer.societyName}` : ''}
        </Text>
        <Text style={[styles.money, { color: c.textPrimary }]}>{money}</Text>
      </View>

      {booking.customer.contactMasked && booking.customer.maskNote ? (
        <Text style={[styles.maskNote, { color: c.textDisabled }]}>{booking.customer.maskNote}</Text>
      ) : null}

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
              {VERB_LABELS[verb]}
            </Button>
          ))}
          {pending && <ActivityIndicator size="small" style={{ marginLeft: 4 }} />}
        </View>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 14, gap: 8, marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  time: { fontSize: 13, fontWeight: '700' },
  service: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customer: { fontSize: 13, flex: 1, marginRight: 8 },
  money: { fontSize: 13, fontWeight: '700' },
  maskNote: { fontSize: 11, fontStyle: 'italic' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  actionBtn: { borderRadius: radii.pill },
  actionLabel: { fontSize: 12, marginVertical: 6 },
});
