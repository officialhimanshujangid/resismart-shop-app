import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, useColorScheme, Pressable } from 'react-native';
import { Text, ActivityIndicator, Switch, Snackbar, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { partnerApi } from '../../../src/api/partner.api';
import { qk } from '../../../src/lib/queryKeys';
import { DateField } from '../../../src/components/DateField';
import {
  useAvailability, useSaveAvailability, DayCard,
  AvailabilityDraft, AvailabilityWindow,
  starterDraft, draftFromRow, bodyFromDraft, draftProblem, deviceTimezone,
} from '../../../src/features/availability';

/**
 * C2 — the working-hours editor. Mirrors web `availability/page.tsx` +
 * `WeekEditor` for the business's OWN schedule (per-staff overrides are out
 * of scope here — see `src/features/availability/types.ts`'s header).
 *
 * Without a schedule saved here `booking-slots.service.ts` has nothing to
 * build a slot from, so a service partner literally cannot receive a single
 * booking — this is why C2 is rated critical.
 */

const TIMEZONE_CHOICES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Colombo', 'Asia/Kathmandu', 'Asia/Singapore', 'Europe/London', 'UTC',
];

const ADVANCE_CHOICES = [
  { value: 0, label: 'Today only' },
  { value: 7, label: 'A week ahead' },
  { value: 14, label: 'A fortnight' },
  { value: 30, label: 'A month' },
  { value: 90, label: 'Three months' },
  { value: 365, label: 'A year' },
];

const CUTOFF_CHOICES = [
  { value: 0, label: 'No notice' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 1440, label: 'A full day' },
];

interface PresetSpec {
  label: string;
  open: number[];
  windows: AvailabilityWindow[];
}

const PRESETS: PresetSpec[] = [
  { label: 'Mon–Sat, 10–7', open: [1, 2, 3, 4, 5, 6], windows: [{ from: '10:00', to: '19:00' }] },
  { label: 'Mon–Fri, 9–6', open: [1, 2, 3, 4, 5], windows: [{ from: '09:00', to: '18:00' }] },
  { label: 'Every day, 9–9', open: [0, 1, 2, 3, 4, 5, 6], windows: [{ from: '09:00', to: '21:00' }] },
];

export default function AvailabilityScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const mayManage = can('BOOKINGS_MANAGE', 'FULL');

  const availabilityQuery = useAvailability();
  const saveAvailability = useSaveAvailability();

  // L1 — the live "available now" switch. Its own tiny GET/PUT pair, kept
  // apart from the weekly-schedule draft below: it is a live flag a shop
  // flips on the way out the door, not part of the hours they save once and
  // rarely touch — the same reasoning `starterDraft`/`bodyFromDraft` apply to
  // the schedule does not fit a field that must react the instant it changes.
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: qk.partner.me(), queryFn: partnerApi.me });
  const [savingAvailableNow, setSavingAvailableNow] = useState(false);
  const availableNow = meQuery.data?.partner.availableNow ?? false;

  const setLiveAvailability = async (next: boolean) => {
    setSavingAvailableNow(true);
    try {
      await partnerApi.setAvailableNow(next);
      queryClient.setQueryData(qk.partner.me(), (prev: typeof meQuery.data) =>
        prev ? { ...prev, partner: { ...prev.partner, availableNow: next } } : prev,
      );
      setSnackbar(next ? 'You are marked available for an immediate job.' : 'You are no longer marked available right now.');
    } catch (e: unknown) {
      setSnackbar(apiErrorMessage(e, 'Could not update your live availability'));
    } finally {
      setSavingAvailableNow(false);
    }
  };

  const [draft, setDraft] = useState<AvailabilityDraft | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [newBlackout, setNewBlackout] = useState('');
  const [snackbar, setSnackbar] = useState<string | null>(null);

  useEffect(() => {
    if (!availabilityQuery.isSuccess) return;
    const row = availabilityQuery.data;
    const fallbackTz = row?.timezone || deviceTimezone();
    if (row) {
      const next = draftFromRow(row, fallbackTz);
      setDraft(next);
      setBaseline(JSON.stringify(next));
    } else {
      const next = starterDraft(fallbackTz);
      setDraft(next);
      setBaseline(null); // nothing saved yet — reads as unsaved, because it is
    }
  }, [availabilityQuery.isSuccess, availabilityQuery.data]);

  const dirty = useMemo(() => Boolean(draft) && JSON.stringify(draft) !== baseline, [draft, baseline]);
  const problem = useMemo(() => (draft ? draftProblem(draft) : null), [draft]);

  const timezoneChoices = useMemo(() => {
    const set = new Set(TIMEZONE_CHOICES);
    set.add(deviceTimezone());
    if (draft?.timezone) set.add(draft.timezone);
    return [...set].sort();
  }, [draft?.timezone]);

  const openCount = draft ? draft.days.filter((d) => d.isOpen).length : 0;

  const patchDay = (day: number, patch: Partial<AvailabilityDraft['days'][number]>) => {
    if (!draft) return;
    setDraft({ ...draft, days: draft.days.map((d) => (d.day === day ? { ...d, ...patch } : d)) });
  };

  const toggleDay = (day: number) => {
    if (!draft) return;
    const wasOpen = draft.days.find((d) => d.day === day)?.isOpen ?? false;
    setDraft({
      ...draft,
      days: draft.days.map((d) => (d.day === day ? { ...d, isOpen: !wasOpen } : d)),
      breaks: wasOpen ? draft.breaks.filter((b) => b.day !== day) : draft.breaks,
    });
  };

  const patchBreaksForDay = (day: number, list: { from: string; to: string }[]) => {
    if (!draft) return;
    setDraft({
      ...draft,
      breaks: [...draft.breaks.filter((b) => b.day !== day), ...list.map((b) => ({ day, from: b.from, to: b.to }))],
    });
  };

  const applyPreset = (preset: PresetSpec) => {
    if (!draft) return;
    const open = new Set(preset.open);
    setDraft({
      ...draft,
      days: draft.days.map((d) => ({
        ...d,
        isOpen: open.has(d.day),
        windows: preset.windows.map((w) => ({ ...w })),
      })),
    });
  };

  const addBlackout = () => {
    if (!draft || !newBlackout) return;
    if (draft.blackoutDates.includes(newBlackout)) { setNewBlackout(''); return; }
    setDraft({ ...draft, blackoutDates: [...draft.blackoutDates, newBlackout].sort() });
    setNewBlackout('');
  };

  const save = () => {
    if (!draft || problem) return;
    saveAvailability.mutate(bodyFromDraft(draft), {
      onSuccess: (row) => {
        const next = draftFromRow(row, draft.timezone);
        setDraft(next);
        setBaseline(JSON.stringify(next));
        setSnackbar('Your working hours are saved');
      },
      onError: (e: unknown) => setSnackbar(apiErrorMessage(e)),
    });
  };

  if (availabilityQuery.isLoading || !draft) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (availabilityQuery.isError) {
    return (
      <View style={[styles.center, { backgroundColor: c.background, padding: 24 }]}>
        <Text style={{ color: c.textSecondary, textAlign: 'center', marginBottom: 12 }}>
          We could not load your working hours.
        </Text>
        <Button mode="contained" onPress={() => availabilityQuery.refetch()}>Try again</Button>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.intro, { color: c.textSecondary }]}>
          When residents can book you. Pick a week below, adjust anything that is not right, and save
          — this is what decides the times they are offered.
        </Text>

        {mayManage && meQuery.data && (
          <View
            style={[
              styles.liveBox,
              { backgroundColor: availableNow ? c.success + '18' : c.surfaceVariant, borderColor: availableNow ? c.success : c.divider },
            ]}
          >
            <View style={styles.activeRow}>
              <Text style={{ color: c.textPrimary, fontSize: 13.5, fontWeight: '700' }}>
                Available for an immediate job right now
              </Text>
              <Switch value={availableNow} onValueChange={setLiveAvailability} disabled={savingAvailableNow} />
            </View>
            <Text style={[styles.hint, { color: c.textSecondary }]}>
              A live switch, separate from the weekly hours below. Turn it on when you can head out on a job
              straight away — residents looking for someone right now see you first. It does not change your
              schedule, and stays on until you turn it off.
            </Text>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>START FROM A COMMON WEEK</Text>
        <View style={styles.chipRow}>
          {PRESETS.map((p) => (
            <Pressable
              key={p.label}
              onPress={() => mayManage && applyPreset(p)}
              style={[styles.presetChip, { borderColor: c.primary }]}
            >
              <Text style={{ color: c.primary, fontSize: 12, fontWeight: '700' }}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: c.textSecondary, marginTop: 14 }]}>
          {openCount === 0 ? 'Nothing is bookable while every day is closed' : `Open ${openCount} of 7 days`}
        </Text>
        {draft.days.map((d) => (
          <DayCard
            key={d.day}
            day={d}
            breaks={draft.breaks.filter((b) => b.day === d.day)}
            disabled={!mayManage}
            onToggleOpen={() => toggleDay(d.day)}
            onPatch={(patch) => patchDay(d.day, patch)}
            onPatchBreaks={(list) => patchBreaksForDay(d.day, list)}
          />
        ))}

        <Text style={[styles.sectionLabel, { color: c.textSecondary, marginTop: 8 }]}>DAYS YOU ARE SHUT</Text>
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          Festivals, holidays, a day off. Nothing can be booked on these, whatever the week above says.
        </Text>
        <View style={styles.chipRow}>
          {draft.blackoutDates.length === 0 && (
            <Text style={{ color: c.textDisabled, fontSize: 12, fontStyle: 'italic' }}>None yet</Text>
          )}
          {draft.blackoutDates.map((dstr) => (
            <View key={dstr} style={[styles.blackoutChip, { backgroundColor: c.surfaceVariant }]}>
              <Text style={{ color: c.textPrimary, fontSize: 11.5, fontWeight: '700' }}>{dstr}</Text>
              {mayManage && (
                <Pressable onPress={() => setDraft({ ...draft, blackoutDates: draft.blackoutDates.filter((x) => x !== dstr) })}>
                  <Text style={{ color: c.textSecondary, fontSize: 13, marginLeft: 6 }}>✕</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
        {mayManage && (
          <View style={styles.addBlackoutRow}>
            <DateField label="Add a day" value={newBlackout} onChangeText={setNewBlackout} mode="date" style={styles.blackoutField} />
            <Button mode="outlined" onPress={addBlackout} disabled={!newBlackout} compact style={styles.addBtn}>
              Add
            </Button>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: c.textSecondary, marginTop: 14 }]}>HOW FAR AHEAD</Text>
        <View style={styles.chipRow}>
          {ADVANCE_CHOICES.map((choice) => {
            const active = draft.advanceBookingDays === choice.value;
            return (
              <Pressable
                key={choice.value}
                onPress={() => mayManage && setDraft({ ...draft, advanceBookingDays: choice.value })}
                style={[styles.optionChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
              >
                <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12, fontWeight: '700' }}>{choice.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: c.textSecondary, marginTop: 14 }]}>NOTICE BEFORE A SLOT</Text>
        <View style={styles.chipRow}>
          {CUTOFF_CHOICES.map((choice) => {
            const active = draft.cutoffMin === choice.value;
            return (
              <Pressable
                key={choice.value}
                onPress={() => mayManage && setDraft({ ...draft, cutoffMin: choice.value })}
                style={[styles.optionChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
              >
                <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12, fontWeight: '700' }}>{choice.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          The notice does two jobs: nothing can be booked inside it, and a customer who cancels inside it loses the advance.
        </Text>

        <Text style={[styles.sectionLabel, { color: c.textSecondary, marginTop: 14 }]}>TIMES ON THIS SCREEN ARE</Text>
        <View style={styles.chipRow}>
          {timezoneChoices.map((tz) => {
            const active = draft.timezone === tz;
            return (
              <Pressable
                key={tz}
                onPress={() => mayManage && setDraft({ ...draft, timezone: tz })}
                style={[styles.optionChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
              >
                <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12, fontWeight: '700' }}>{tz}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          Every hour above is read in this zone — including on a phone set to a different one.
        </Text>

        <View style={[styles.activeBox, { backgroundColor: draft.isActive ? c.surfaceVariant : c.warning + '18', borderColor: draft.isActive ? c.divider : c.warning }]}>
          <View style={styles.activeRow}>
            <Text style={{ color: c.textPrimary, fontSize: 13.5, fontWeight: '700' }}>Taking bookings</Text>
            <Switch value={draft.isActive} onValueChange={(v) => setDraft({ ...draft, isActive: v })} disabled={!mayManage} />
          </View>
          <Text style={[styles.hint, { color: c.textSecondary }]}>
            {draft.isActive
              ? 'Switch this off to stop new bookings without losing the hours you have set.'
              : 'No new bookings are being taken. Everything you have set up is kept.'}
          </Text>
        </View>

        {problem && (
          <View style={[styles.problemBox, { backgroundColor: c.warning + '18', borderColor: c.warning }]}>
            <Text style={{ color: c.textPrimary, fontSize: 12.5, lineHeight: 18 }}>{problem}</Text>
          </View>
        )}

        {mayManage && (
          <Button
            mode="contained"
            onPress={save}
            loading={saveAvailability.isPending}
            disabled={saveAvailability.isPending || !!problem || (!dirty && baseline !== null)}
            style={styles.saveBtn}
          >
            {saveAvailability.isPending ? 'Saving…' : 'Save these hours'}
          </Button>
        )}
      </ScrollView>

      <Snackbar visible={Boolean(snackbar)} onDismiss={() => setSnackbar(null)} duration={4000}>
        {snackbar}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, paddingBottom: 40, gap: 4 },
  intro: { fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8 },
  hint: { fontSize: 11.5, lineHeight: 16, marginTop: 4, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  presetChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: 1.5 },
  optionChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  blackoutChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill },
  addBlackoutRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  blackoutField: { flex: 1 },
  addBtn: { borderRadius: radii.card },
  liveBox: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 4 },
  activeBox: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginTop: 16 },
  activeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  problemBox: { borderRadius: radii.md, borderWidth: 1, padding: 12, marginTop: 14 },
  saveBtn: { borderRadius: radii.card, marginTop: 16 },
});
