import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, useColorScheme, Pressable, Alert } from 'react-native';
import { Text, Switch, Snackbar, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { partnerApi } from '../../../src/api/partner.api';
import { qk } from '../../../src/lib/queryKeys';
import { DateField } from '../../../src/components/DateField';
import { SkeletonList } from '../../../src/components/ui'; // M22 — skeleton, not a lone spinner
import { PressableScale, Rise } from '../../../src/theme/motion'; // M22
import { useAssignableStaff } from '../../../src/features/bookings/hooks'; // P9A Q7
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useAvailabilityRows, useRemoveStaffHours, useSaveAvailability, DayCard,
  AvailabilityDraft, AvailabilityWindow,
  starterDraft, draftFromRow, bodyFromDraft, draftProblem, deviceTimezone,
} from '../../../src/features/availability';

/**
 * C2 — the working-hours editor. Mirrors web `availability/page.tsx` +
 * `WeekEditor`: the business's OWN schedule and — P9A (Owner 2026-10-10,
 * Phase 9 Q7) — one staff member's own hours ("Whose hours" chips, "Give own
 * hours", "Back on the business's hours"), the same API the website uses.
 *
 * Without a schedule saved here `booking-slots.service.ts` has nothing to
 * build a slot from, so a service partner literally cannot receive a single
 * booking — this is why C2 is rated critical.
 */

const TIMEZONE_CHOICES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Colombo', 'Asia/Kathmandu', 'Asia/Singapore', 'Europe/London', 'UTC',
];

/**
 * THE CHOICE TABLES CARRY I18N KEYS, NOT LABELS — `*_LABEL_KEY` shape, the
 * worked example being `src/features/billing/types.ts`.
 *
 * `value` is the WIRE VALUE in every table below and must not be disturbed:
 * `advanceBookingDays` and `cutoffMin` are whole numbers `PUT` back to
 * `/partners/me/availability` and read by `booking-slots.service.ts` — the
 * cutoff is also the line the cancellation-forfeit rule turns on. Only
 * `labelKey` is read by a person.
 */
const ADVANCE_CHOICES = [
  { value: 0, labelKey: 'availability.advance.d0' },
  { value: 7, labelKey: 'availability.advance.d7' },
  { value: 14, labelKey: 'availability.advance.d14' },
  { value: 30, labelKey: 'availability.advance.d30' },
  { value: 90, labelKey: 'availability.advance.d90' },
  { value: 365, labelKey: 'availability.advance.d365' },
];

const CUTOFF_CHOICES = [
  { value: 0, labelKey: 'availability.cutoff.m0' },
  { value: 30, labelKey: 'availability.cutoff.m30' },
  { value: 60, labelKey: 'availability.cutoff.m60' },
  { value: 120, labelKey: 'availability.cutoff.m120' },
  { value: 240, labelKey: 'availability.cutoff.m240' },
  { value: 1440, labelKey: 'availability.cutoff.m1440' },
];

interface PresetSpec {
  labelKey: string;
  open: number[];
  windows: AvailabilityWindow[];
}

/**
 * `open` (weekday indices) and `windows` (`HH:MM` strings) are both wire
 * values — they land straight in `weekly[]`. Only `labelKey` is display.
 */
const PRESETS: PresetSpec[] = [
  { labelKey: 'availability.preset.monSat', open: [1, 2, 3, 4, 5, 6], windows: [{ from: '10:00', to: '19:00' }] },
  { labelKey: 'availability.preset.monFri', open: [1, 2, 3, 4, 5], windows: [{ from: '09:00', to: '18:00' }] },
  { labelKey: 'availability.preset.everyDay', open: [0, 1, 2, 3, 4, 5, 6], windows: [{ from: '09:00', to: '21:00' }] },
];

export default function AvailabilityScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const mayManage = can('BOOKINGS_MANAGE', 'FULL');

  // P9A Q7: every schedule at once — the business's own (`staffId: null`) and each person's own hours.
  const rowsQuery = useAvailabilityRows();
  const saveAvailability = useSaveAvailability();
  const removeStaffHours = useRemoveStaffHours();
  // The job picker's own list (BOOKINGS_MANAGE: FULL), active people who take bookings only.
  const staffQuery = useAssignableStaff(mayManage);
  const bookableStaff = staffQuery.data ?? [];
  /** `null` = the business's own hours; a staff id = that person's own hours. */
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(() => rowsQuery.data ?? [], [rowsQuery.data]);
  const rowFor = (staffId: string | null) => rows.find((r) => (r.staffId || null) === staffId) ?? null;
  const businessRow = rowFor(null);
  const overrideIds = useMemo(() => new Set(rows.map((r) => r.staffId).filter(Boolean) as string[]), [rows]);
  const selectedName = bookableStaff.find((p) => p.id === selected)?.name ?? '';

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
      setSnackbar(t(next ? 'availability.live.on' : 'availability.live.off'));
    } catch (e: unknown) {
      setSnackbar(apiErrorMessage(e, t('availability.live.failed')));
    } finally {
      setSavingAvailableNow(false);
    }
  };

  const [draft, setDraft] = useState<AvailabilityDraft | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [newBlackout, setNewBlackout] = useState('');
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // Seeded whenever the selection or the loaded rows change (keyed on the ROW, so
  // a save that returns fresh data re-seeds the form from what the server stored).
  useEffect(() => {
    if (!rowsQuery.isSuccess) return;
    const row = (rowsQuery.data ?? []).find((r) => (r.staffId || null) === selected) ?? null;
    const shop = (rowsQuery.data ?? []).find((r) => !r.staffId) ?? null;
    const fallbackTz = row?.timezone || shop?.timezone || deviceTimezone();
    if (row) {
      const next = draftFromRow(row, fallbackTz);
      setDraft(next);
      setBaseline(JSON.stringify(next));
    } else if (selected === null) {
      const next = starterDraft(fallbackTz);
      setDraft(next);
      setBaseline(null); // nothing saved yet — reads as unsaved, because it is
    } else {
      // P9A Q7: a person with no hours of their own follows the business.
      setDraft(null);
      setBaseline(null);
    }
  }, [rowsQuery.isSuccess, rowsQuery.data, selected]);

  const dirty = useMemo(() => Boolean(draft) && JSON.stringify(draft) !== baseline, [draft, baseline]);
  // `t` is a dependency: `draftProblem` renders its sentence through the
  // translator, so the message has to be rebuilt when the language changes.
  const problem = useMemo(() => (draft ? draftProblem(draft, t) : null), [draft, t]);

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
    saveAvailability.mutate(bodyFromDraft(draft, selected), {
      onSuccess: (row) => {
        const next = draftFromRow(row, draft.timezone);
        setDraft(next);
        setBaseline(JSON.stringify(next));
        setSnackbar(t(selected ? 'availability.staff.savedTheirs' : 'availability.screen.saved'));
      },
      onError: (e: unknown) => setSnackbar(apiErrorMessage(e)),
    });
  };

  /** P9A Q7: start this person's own hours from the business's week (the common case is "the shop's hours, minus Thursday"). */
  const giveOwnHours = () => {
    const tz = businessRow?.timezone || deviceTimezone();
    setDraft(businessRow ? draftFromRow(businessRow, tz) : starterDraft(tz));
    setBaseline(null);
  };

  /** P9A Q7: drop this person's own hours — they follow the business again. */
  const backOnBusinessHours = () => {
    if (!selected) return;
    Alert.alert(
      t('availability.staff.dropTitle', { name: selectedName || t('availability.staff.someone') }),
      t('availability.staff.dropBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('availability.staff.dropConfirm'),
          style: 'destructive',
          onPress: () => removeStaffHours.mutate(selected, {
            onSuccess: () => setSnackbar(t('availability.staff.dropped')),
            onError: (e: unknown) => setSnackbar(apiErrorMessage(e)),
          }),
        },
      ],
    );
  };

  if (rowsQuery.isLoading || (selected === null && !draft && !rowsQuery.isError)) {
    return (
      <View style={[styles.root, { backgroundColor: c.background, padding: 16 }]}>
        <SkeletonList rows={5} testID="availability-loading" />
      </View>
    );
  }

  if (rowsQuery.isError) {
    return (
      <View style={[styles.center, { backgroundColor: c.background, padding: 24 }]}>
        <Text style={{ color: c.textSecondary, textAlign: 'center', marginBottom: 12 }}>
          {t('availability.screen.loadFailed')}
        </Text>
        <Button mode="contained" onPress={() => rowsQuery.refetch()}>{t('common.tryAgain')}</Button>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Rise index={0}>
        <Text style={[styles.intro, { color: c.textSecondary }]}>
          {t('availability.screen.intro')}
        </Text>
        </Rise>

        {/*
          Says WHY nothing on this screen responds, in the words Orders already
          uses (`(tabs)/orders.tsx`). Every chip below reads `mayManage` too, so
          a viewer's tap is refused by the control itself rather than swallowed
          by an `onPress` that quietly evaluates to `false` — which is what this
          screen did, leaving a view-only staff member tapping a preset over and
          over with nothing on screen to explain the silence.
        */}
        {!mayManage && (
          <View style={[styles.readOnlyBanner, { backgroundColor: c.surfaceVariant }]}>
            <Text style={[styles.readOnlyText, { color: c.textSecondary }]}>
              {t('availability.screen.readOnly')}
            </Text>
          </View>
        )}

        {mayManage && meQuery.data && selected === null && (
          <Rise index={1}>
          <View
            style={[
              styles.liveBox,
              { backgroundColor: availableNow ? c.success + '18' : c.surfaceVariant, borderColor: availableNow ? c.success : c.divider },
            ]}
          >
            <View style={styles.activeRow}>
              <Text style={{ color: c.textPrimary, fontSize: 13.5, fontWeight: '600', flexShrink: 1 }}>
                {t('availability.live.title')}
              </Text>
              <Switch value={availableNow} onValueChange={setLiveAvailability} disabled={savingAvailableNow} />
            </View>
            <Text style={[styles.hint, { color: c.textSecondary }]}>
              {t('availability.live.hint')}
            </Text>
          </View>
          </Rise>
        )}

        {/* ------------------------------------------ P9A Q7: whose hours these are */}
        {mayManage && bookableStaff.length > 0 && (
          <Rise index={2}>
            <Text style={[styles.sectionLabel, { color: c.textSecondary, marginTop: 10 }]}>{t('availability.staff.whose')}</Text>
            <View style={styles.chipRow} accessibilityRole="radiogroup">
              {[{ id: null as string | null, label: t('availability.staff.business') },
                ...bookableStaff.map((p) => ({
                  id: p.id as string | null,
                  label: overrideIds.has(p.id) ? p.name : t('availability.staff.follows', { name: p.name }),
                }))].map((o) => {
                const active = selected === o.id;
                return (
                  <PressableScale
                    key={o.id ?? 'business'}
                    onPress={() => setSelected(o.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    testID={`hours-whose-${o.id ?? 'business'}`}
                    style={[styles.optionChip, styles.whoseChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
                  >
                    <MaterialCommunityIcons name={o.id ? 'account-clock-outline' : 'storefront-outline'} size={15} color={active ? c.textInverse : c.textSecondary} />
                    <Text style={{ color: active ? c.textInverse : c.textPrimary, fontSize: 12, fontWeight: '600', flexShrink: 1 }}>{o.label}</Text>
                  </PressableScale>
                );
              })}
            </View>
            <Text style={[styles.hint, { color: c.textSecondary }]}>{t('availability.staff.whoseHint')}</Text>
          </Rise>
        )}

        {selected !== null && !draft ? (
          <Rise index={3}>
            <View style={[styles.followsBox, { backgroundColor: c.surface, borderColor: c.divider }]} testID="hours-follows-business">
              <MaterialCommunityIcons name="account-clock-outline" size={26} color={c.primary} />
              <Text style={{ color: c.textPrimary, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
                {t('availability.staff.followsTitle', { name: selectedName })}
              </Text>
              <Text style={[styles.hint, { color: c.textSecondary, textAlign: 'center' }]}>{t('availability.staff.followsBody')}</Text>
              <Button mode="contained" icon="clock-edit-outline" onPress={giveOwnHours} style={styles.saveBtn} testID="hours-give-own">
                {t('availability.staff.giveOwn')}
              </Button>
            </View>
          </Rise>
        ) : draft ? (<>
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('availability.screen.presetsLabel')}</Text>
        <View style={[styles.chipRow, !mayManage && styles.readOnlyRow]}>
          {PRESETS.map((p) => (
            <PressableScale
              key={p.labelKey}
              onPress={() => applyPreset(p)}
              disabled={!mayManage}
              style={[styles.presetChip, { borderColor: mayManage ? c.primary : c.divider }]}
            >
              <Text style={{ color: mayManage ? c.primary : c.textSecondary, fontSize: 12, fontWeight: '600' }}>{t(p.labelKey)}</Text>
            </PressableScale>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: c.textSecondary, marginTop: 14 }]}>
          {openCount === 0
            ? t('availability.screen.allClosed')
            : t('availability.screen.openCount', { count: openCount })}
        </Text>
        {draft.days.map((d, i) => (
          <Rise key={d.day} index={Math.min(i + 2, 6)}>
          <DayCard
            day={d}
            breaks={draft.breaks.filter((b) => b.day === d.day)}
            disabled={!mayManage}
            onToggleOpen={() => toggleDay(d.day)}
            onPatch={(patch) => patchDay(d.day, patch)}
            onPatchBreaks={(list) => patchBreaksForDay(d.day, list)}
          />
          </Rise>
        ))}

        <Text style={[styles.sectionLabel, { color: c.textSecondary, marginTop: 8 }]}>{t('availability.screen.blackoutLabel')}</Text>
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          {t('availability.screen.blackoutHint')}
        </Text>
        <View style={styles.chipRow}>
          {draft.blackoutDates.length === 0 && (
            <Text style={{ color: c.textSecondary, fontSize: 12, fontStyle: 'italic' }}>{t('availability.screen.blackoutNone')}</Text>
          )}
          {draft.blackoutDates.map((dstr) => (
            <View key={dstr} style={[styles.blackoutChip, { backgroundColor: c.surfaceVariant }]}>
              <Text style={{ color: c.textPrimary, fontSize: 11.5, fontWeight: '600', flexShrink: 1 }}>{dstr}</Text>
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
            <DateField label={t('availability.screen.blackoutAdd')} value={newBlackout} onChangeText={setNewBlackout} mode="date" style={styles.blackoutField} />
            <Button mode="outlined" onPress={addBlackout} disabled={!newBlackout} compact style={styles.addBtn}>
              {t('common.add')}
            </Button>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: c.textSecondary, marginTop: 14 }]}>{t('availability.screen.advanceLabel')}</Text>
        <View style={[styles.chipRow, !mayManage && styles.readOnlyRow]}>
          {ADVANCE_CHOICES.map((choice) => {
            const active = draft.advanceBookingDays === choice.value;
            return (
              <Pressable
                key={choice.value}
                onPress={() => setDraft({ ...draft, advanceBookingDays: choice.value })}
                disabled={!mayManage}
                style={[styles.optionChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
              >
                <Text style={{ color: active ? c.textInverse : c.textSecondary, fontSize: 12, fontWeight: '600' }}>{t(choice.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: c.textSecondary, marginTop: 14 }]}>{t('availability.screen.cutoffLabel')}</Text>
        <View style={[styles.chipRow, !mayManage && styles.readOnlyRow]}>
          {CUTOFF_CHOICES.map((choice) => {
            const active = draft.cutoffMin === choice.value;
            return (
              <Pressable
                key={choice.value}
                onPress={() => setDraft({ ...draft, cutoffMin: choice.value })}
                disabled={!mayManage}
                style={[styles.optionChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
              >
                <Text style={{ color: active ? c.textInverse : c.textSecondary, fontSize: 12, fontWeight: '600' }}>{t(choice.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          {t('availability.screen.cutoffHint')}
        </Text>

        <Text style={[styles.sectionLabel, { color: c.textSecondary, marginTop: 14 }]}>{t('availability.screen.timezoneLabel')}</Text>
        <View style={[styles.chipRow, !mayManage && styles.readOnlyRow]}>
          {timezoneChoices.map((tz) => {
            const active = draft.timezone === tz;
            return (
              <Pressable
                key={tz}
                onPress={() => setDraft({ ...draft, timezone: tz })}
                disabled={!mayManage}
                style={[styles.optionChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
              >
                <Text style={{ color: active ? c.textInverse : c.textSecondary, fontSize: 12, fontWeight: '600' }}>{tz}</Text>
              </Pressable>
            );
          })}
        </View>
        {/* The IANA zone id itself (`Asia/Kolkata`) is the wire value — it is
            `PUT` back as `timezone` and is what every hour above is resolved
            against, so it stays exactly as it is in both languages. */}
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          {t('availability.screen.timezoneHint')}
        </Text>

        <View style={[styles.activeBox, { backgroundColor: draft.isActive ? c.surfaceVariant : c.warning + '18', borderColor: draft.isActive ? c.divider : c.warning }]}>
          <View style={styles.activeRow}>
            {/* The same phrase `availability.problem.allClosed` quotes back at
                the partner — one label for one switch, in both languages. */}
            <Text style={{ color: c.textPrimary, fontSize: 13.5, fontWeight: '600', flexShrink: 1 }}>{t('availability.screen.takingBookings')}</Text>
            <Switch value={draft.isActive} onValueChange={(v) => setDraft({ ...draft, isActive: v })} disabled={!mayManage} />
          </View>
          <Text style={[styles.hint, { color: c.textSecondary }]}>
            {t(draft.isActive ? 'availability.screen.takingOnHint' : 'availability.screen.takingOffHint')}
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
            {t(saveAvailability.isPending ? 'common.saving' : 'availability.screen.saveHours')}
          </Button>
        )}
        {/* P9A Q7: only for a person who HAS their own hours (the business's own schedule has no delete). */}
        {mayManage && selected !== null && rowFor(selected) && (
          <Button
            mode="outlined"
            icon="backup-restore"
            onPress={backOnBusinessHours}
            loading={removeStaffHours.isPending}
            disabled={removeStaffHours.isPending}
            textColor={c.error}
            style={[styles.saveBtn, { borderColor: c.error }]}
            testID="hours-back-on-business"
          >
            {t('availability.staff.backOnBusiness')}
          </Button>
        )}
        </>) : null}
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
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, marginBottom: 8 },
  hint: { fontSize: 11.5, lineHeight: 16, marginTop: 4, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  /** Dims a whole chip row for a viewer while leaving the CHOSEN chip readable — it is still the answer they came to read. */
  readOnlyRow: { opacity: 0.65 },
  readOnlyBanner: { borderRadius: radii.sm, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 10 },
  readOnlyText: { fontSize: 11.5, fontWeight: '600' },
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
  // P9A Q7
  whoseChip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', minHeight: 40 },
  followsBox: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 18, alignItems: 'center', gap: 6, marginTop: 6 },
});
