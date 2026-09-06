import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Text, TextInput } from 'react-native-paper';
import { AssignableStaff, BookingConflictView, BookingVerb, PartnerBookingView } from '../booking.types';
import { MAX_EXTEND_MIN, VERB_LABELS } from '../booking.types';
import { useAssignableStaff, useBookingOverrun } from '../hooks';
import { formatMinutes, formatTime } from '../format';
import { themeColors, radii } from '../../../constants/colors';

/**
 * The one modal for every verb that needs MORE than a confirmation tap:
 * `reject` (a reason the customer reads), `assign` (a staff picker), `reschedule`
 * (a new slot), `complete` on an AT_CUSTOMER job (the code the customer reads
 * out) and `extend` (how much longer, against what is booked behind). One
 * component rather than five, because they share the same sheet chrome and the
 * same "submit disabled until valid" shape, and five copies of that shape is
 * five places to fix the same bug.
 */

/**
 * The bites of extra time worth offering, in minutes.
 *
 * Chips rather than a free text field for the same reason the reschedule picker
 * is chips: this is typed one-handed by somebody standing in a customer's flat.
 * `MAX_EXTEND_MIN` (120) is the server's ceiling and the largest chip here; the
 * list is filtered again at render against `canExtendByMin`, so no chip on
 * screen is one the server would refuse.
 */
const EXTEND_CHIPS = [10, 15, 20, 30, 45, 60, 90, MAX_EXTEND_MIN];

/** One appointment in the way, said as a partner would say it to themselves. */
function conflictLine(x: BookingConflictView): string {
  return `${formatTime(x.slotStart)} · ${x.customerName} · ${x.serviceName} (${x.code})`;
}

interface Props {
  visible: boolean;
  verb: BookingVerb | null;
  booking: PartnerBookingView | null;
  isDark: boolean;
  submitting: boolean;
  /**
   * The appointments a refusal named, when the last submit was refused.
   *
   * Passed IN rather than caught here because the mutation lives with the
   * caller. It is what turns a 409 `SLOT_TAKEN_AHEAD` from "Could not do that"
   * into a list of people and times the partner can ring or move — the whole
   * reason `BookingConflictError` carries a body at all. Shown in the sheet, not
   * an alert, so the sheet stays open and a smaller number is one tap away.
   */
  conflicts?: BookingConflictView[];
  onDismiss: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}

/**
 * Slot choices for reschedule, built from plain arithmetic rather than a native
 * date/time picker.
 *
 * `@react-native-community/datetimepicker` is not installed anywhere in this
 * repo (checked both apps), and adding a new native module for one screen is
 * exactly the kind of dependency decision the build spec asks to be justified,
 * not assumed — see the thermal-printer note in P9_BUILD_SPEC.md §4.4 for the
 * same principle applied to a bigger case. A chip grid needs nothing native and
 * works today in Expo Go.
 */
function nextDays(count: number): Date[] {
  const out: Date[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d);
  }
  return out;
}

function timeSlots(day: Date): Date[] {
  const out: Date[] = [];
  for (let h = 8; h <= 20; h++) {
    for (const m of [0, 30]) {
      if (h === 20 && m === 30) continue;
      const d = new Date(day);
      d.setHours(h, m, 0, 0);
      out.push(d);
    }
  }
  return out;
}

const dayLabel = (d: Date, idx: number) => {
  if (idx === 0) return 'Today';
  if (idx === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
};

export function BookingActionModal({
  visible, verb, booking, isDark, submitting, conflicts, onDismiss, onSubmit,
}: Props) {
  const c = themeColors(isDark);
  const [reason, setReason] = useState('');
  const [otp, setOtp] = useState('');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [slot, setSlot] = useState<Date | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);

  const days = useMemo(() => nextDays(14), []);
  const slots = useMemo(() => timeSlots(days[dayIndex] ?? new Date()), [days, dayIndex]);

  const staffQuery = useAssignableStaff(visible && verb === 'assign');
  /**
   * Asked only while the extend sheet is open, and asked FRESH every time.
   *
   * The partner is about to decide how much of their own diary to claim, and
   * `canExtendByMin` is the number that decides whether that is even possible.
   * A cached one is a wrong one — see `useBookingOverrun`.
   */
  const overrunQuery = useBookingOverrun(booking?.id, visible && verb === 'extend');
  const overrun = overrunQuery.data;

  // Reset per-open so a dismissed reject does not prefill the next reject.
  React.useEffect(() => {
    if (!visible) return;
    setReason('');
    setOtp('');
    setStaffId(null);
    setDayIndex(0);
    setSlot(null);
    setMinutes(null);
  }, [visible, verb, booking?.id]);

  if (!verb || !booking) return null;

  /**
   * The chips actually on offer.
   *
   * Clamped to `canExtendByMin`, which the server worked out by walking forward
   * from the current claim to the moment the things already booked would fill
   * the slot — NOT simply "the next booking", because with a capacity of three
   * two appointments in the next hour still leave room to run into it. Offering
   * a chip past that boundary would be offering a refusal.
   *
   * The boundary itself is offered too, when it is not already a chip. Without
   * it a partner with eleven minutes of room would be shown "10 min" and no way
   * to ask for the eleventh — and one with seven would be shown an empty row
   * with nothing said, because the smallest chip is ten.
   *
   * Empty while the answer is still outstanding, so nothing is tappable before
   * anybody knows what would be accepted.
   */
  const extendOptions = ((): number[] => {
    if (!overrun) return [];
    const room = overrun.canExtendByMin;
    const fit = EXTEND_CHIPS.filter((m) => m <= room);
    return fit.includes(room) || room <= 0 ? fit : [...fit, room];
  })();

  const staffName = (s: AssignableStaff) => (typeof s.userId === 'string' ? s.designation : s.userId.name);

  const canSubmit = (() => {
    if (verb === 'reject') return reason.trim().length >= 3;
    if (verb === 'assign') return Boolean(staffId);
    if (verb === 'reschedule') return Boolean(slot);
    if (verb === 'complete') return booking.mode !== 'AT_CUSTOMER' || /^\d{6}$/.test(otp);
    if (verb === 'extend') return minutes !== null;
    return true;
  })();

  const submit = () => {
    // `minutes` is a DELTA on the current claim and never an instant — see
    // `bookingApi.extend`. `note` rides along where the partner typed one.
    if (verb === 'extend') {
      return onSubmit({ minutes, ...(reason.trim() ? { note: reason.trim() } : {}) });
    }
    if (verb === 'reject') return onSubmit({ reason: reason.trim() });
    if (verb === 'assign') return onSubmit({ staffId });
    if (verb === 'reschedule') return onSubmit({ slotStart: slot?.toISOString() });
    if (verb === 'complete') {
      return onSubmit(booking.mode === 'AT_CUSTOMER' ? { otp } : {});
    }
    if (verb === 'cancel') return onSubmit({ reason: reason.trim() || undefined });
    if (verb === 'note') return onSubmit({ note: reason.trim() });
    return onSubmit({});
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: c.surface }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { color: c.textPrimary }]}>{VERB_LABELS[verb]}</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {booking.code} · {booking.serviceSnapshot.name}
          </Text>

          <ScrollView style={{ maxHeight: 380 }}>
            {verb === 'reject' && (
              <TextInput
                mode="outlined"
                label="Why can't you take this one?"
                value={reason}
                onChangeText={setReason}
                multiline
                style={styles.input}
              />
            )}

            {verb === 'cancel' && (
              <TextInput
                mode="outlined"
                label="Reason (optional)"
                value={reason}
                onChangeText={setReason}
                multiline
                style={styles.input}
              />
            )}

            {verb === 'note' && (
              <TextInput
                mode="outlined"
                label="Note for your team"
                value={reason}
                onChangeText={setReason}
                multiline
                style={styles.input}
              />
            )}

            {verb === 'complete' && booking.mode === 'AT_CUSTOMER' && (
              <>
                <Text style={[styles.hint, { color: c.textSecondary }]}>
                  {booking.completionOtpSentAt
                    ? 'Ask the customer for the 6-digit code sent to them.'
                    : 'Mark "I have reached" first — that is what sends the code.'}
                </Text>
                <TextInput
                  mode="outlined"
                  label="6-digit code"
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.input}
                />
              </>
            )}

            {verb === 'assign' && (
              <>
                {staffQuery.isLoading && (
                  <Text style={[styles.hint, { color: c.textSecondary }]}>Loading your team…</Text>
                )}
                {staffQuery.isError && (
                  <Text style={[styles.hint, { color: c.error }]}>
                    You don&apos;t have access to the staff list. Ask an admin to assign this one.
                  </Text>
                )}
                {staffQuery.data?.length === 0 && !staffQuery.isLoading && !staffQuery.isError && (
                  <Text style={[styles.hint, { color: c.textSecondary }]}>
                    Nobody on staff is set to take bookings yet — add that from Staff settings.
                  </Text>
                )}
                <View style={styles.chipWrap}>
                  {(staffQuery.data ?? []).map((s) => (
                    <Chip
                      key={s._id}
                      selected={staffId === s._id}
                      onPress={() => setStaffId(s._id)}
                      style={styles.chip}
                    >
                      {staffName(s)}
                    </Chip>
                  ))}
                </View>
              </>
            )}

            {verb === 'extend' && (
              <>
                {/* Where the job actually is, before the partner is asked to
                    decide anything. `getBookingOverrun` answers for any status,
                    so this is never a guess made on the phone. */}
                {overrunQuery.isPending && (
                  <Text style={[styles.hint, { color: c.textSecondary }]}>
                    Checking what is booked behind this one…
                  </Text>
                )}
                {overrunQuery.isError && (
                  <Text style={[styles.hint, { color: c.error }]}>
                    We could not check what is behind this job, so we cannot say how much room there is.
                  </Text>
                )}
                {overrun && (
                  <Text style={[styles.hint, { color: overrun.runningOverMin > 0 ? c.warning : c.textSecondary }]}>
                    {overrun.runningOverMin > 0
                      ? `This job is ${formatMinutes(overrun.runningOverMin)} past its agreed end.`
                      : `${formatMinutes(overrun.remainingMin)} left of the booked time.`}
                    {' '}
                    {overrun.capacity > 1
                      ? `You can take ${overrun.capacity} at a time here.`
                      : 'Your diary holds one job at a time here.'}
                  </Text>
                )}

                {/* Nothing to offer, and the honest reason why. `reschedule` is
                    the verb that moves what is behind — no second one was
                    invented for it, so the sentence names it rather than
                    offering a button that would be a duplicate of one already
                    on the card. */}
                {overrun && overrun.canExtendByMin === 0 ? (
                  <Text style={[styles.hint, { color: c.warning }]}>
                    There is no room to run on — the time behind this job is taken. Move what is next with
                    “{VERB_LABELS.reschedule}”, or finish up and let it start late.
                  </Text>
                ) : (
                  <>
                    <Text style={[styles.hint, { color: c.textSecondary, marginTop: 10 }]}>
                      How much longer?
                      {overrun ? ` Up to ${formatMinutes(overrun.canExtendByMin)}.` : ''}
                    </Text>
                    <View style={styles.chipWrap}>
                      {extendOptions.map((m) => (
                        <Chip
                          key={m}
                          selected={minutes === m}
                          onPress={() => setMinutes(m)}
                          style={styles.chip}
                        >
                          {formatMinutes(m)}
                        </Chip>
                      ))}
                    </View>
                  </>
                )}

                {/* What is behind, named — whether or not it is currently in the
                    way. A partner deciding to run twenty minutes over wants to
                    know whose appointment they are eating into before they do
                    it, not after. */}
                {overrun && overrun.conflicts.length > 0 && (
                  <>
                    <Text style={[styles.hint, { color: c.textSecondary, marginTop: 10 }]}>
                      Booked after this one:
                    </Text>
                    {overrun.conflicts.map((x) => (
                      <Text key={x.id} style={[styles.hint, { color: c.textSecondary }]}>
                        • {conflictLine(x)}
                      </Text>
                    ))}
                  </>
                )}

                {/* The refusal, once there has been one. Names and times, not
                    "Could not do that" — see the `conflicts` prop. */}
                {conflicts && conflicts.length > 0 && (
                  <>
                    <Text style={[styles.hint, { color: c.error, marginTop: 10 }]}>
                      That much would run into work already booked:
                    </Text>
                    {conflicts.map((x) => (
                      <Text key={x.id} style={[styles.hint, { color: c.error }]}>
                        • {conflictLine(x)}
                      </Text>
                    ))}
                    <Text style={[styles.hint, { color: c.textSecondary }]}>
                      Ask for less time, move those with “{VERB_LABELS.reschedule}”, or finish up and let
                      the next one start late.
                    </Text>
                  </>
                )}

                <TextInput
                  mode="outlined"
                  label="Why (optional — your team sees this)"
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  style={styles.input}
                />
              </>
            )}

            {verb === 'reschedule' && (
              <>
                <Text style={[styles.hint, { color: c.textSecondary }]}>Day</Text>
                <View style={styles.chipWrap}>
                  {days.map((d, i) => (
                    <Chip
                      key={d.toISOString()}
                      selected={dayIndex === i}
                      onPress={() => {
                        setDayIndex(i);
                        setSlot(null);
                      }}
                      style={styles.chip}
                    >
                      {dayLabel(d, i)}
                    </Chip>
                  ))}
                </View>
                <Text style={[styles.hint, { color: c.textSecondary, marginTop: 10 }]}>Time</Text>
                <View style={styles.chipWrap}>
                  {slots.map((t) => (
                    <Chip
                      key={t.toISOString()}
                      selected={slot?.getTime() === t.getTime()}
                      onPress={() => setSlot(t)}
                      style={styles.chip}
                    >
                      {t.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </Chip>
                  ))}
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Button mode="outlined" onPress={onDismiss} disabled={submitting} style={styles.footerBtn}>
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={submit}
              disabled={!canSubmit || submitting}
              loading={submitting}
              style={styles.footerBtn}
            >
              {VERB_LABELS[verb]}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, padding: 20, gap: 4 },
  title: { fontSize: 18, fontWeight: '600' },
  subtitle: { fontSize: 13, marginBottom: 8 },
  input: { marginTop: 10 },
  hint: { fontSize: 13, marginTop: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { marginBottom: 4 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
  footerBtn: { flex: 1 },
});
