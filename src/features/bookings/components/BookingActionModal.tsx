import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Text, TextInput } from 'react-native-paper';
import { AssignableStaff, BookingVerb, PartnerBookingView } from '../booking.types';
import { VERB_LABELS } from '../booking.types';
import { useAssignableStaff } from '../hooks';
import { themeColors, radii } from '../../../constants/colors';

/**
 * The one modal for every verb that needs MORE than a confirmation tap:
 * `reject` (a reason the customer reads), `assign` (a staff picker), `reschedule`
 * (a new slot) and `complete` on an AT_CUSTOMER job (the code the customer reads
 * out). One component rather than four, because they share the same sheet
 * chrome and the same "submit disabled until valid" shape, and four copies of
 * that shape is four places to fix the same bug.
 */

interface Props {
  visible: boolean;
  verb: BookingVerb | null;
  booking: PartnerBookingView | null;
  isDark: boolean;
  submitting: boolean;
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

export function BookingActionModal({ visible, verb, booking, isDark, submitting, onDismiss, onSubmit }: Props) {
  const c = themeColors(isDark);
  const [reason, setReason] = useState('');
  const [otp, setOtp] = useState('');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [slot, setSlot] = useState<Date | null>(null);

  const days = useMemo(() => nextDays(14), []);
  const slots = useMemo(() => timeSlots(days[dayIndex] ?? new Date()), [days, dayIndex]);

  const staffQuery = useAssignableStaff(visible && verb === 'assign');

  // Reset per-open so a dismissed reject does not prefill the next reject.
  React.useEffect(() => {
    if (!visible) return;
    setReason('');
    setOtp('');
    setStaffId(null);
    setDayIndex(0);
    setSlot(null);
  }, [visible, verb, booking?.id]);

  if (!verb || !booking) return null;

  const staffName = (s: AssignableStaff) => (typeof s.userId === 'string' ? s.designation : s.userId.name);

  const canSubmit = (() => {
    if (verb === 'reject') return reason.trim().length >= 3;
    if (verb === 'assign') return Boolean(staffId);
    if (verb === 'reschedule') return Boolean(slot);
    if (verb === 'complete') return booking.mode !== 'AT_CUSTOMER' || /^\d{6}$/.test(otp);
    return true;
  })();

  const submit = () => {
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
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 13, marginBottom: 8 },
  input: { marginTop: 10 },
  hint: { fontSize: 13, marginTop: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { marginBottom: 4 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
  footerBtn: { flex: 1 },
});
