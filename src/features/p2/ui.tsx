import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator as RNActivityIndicator, Pressable, ScrollView, StyleSheet, useColorScheme, View,
} from 'react-native';
import { IconButton, Modal, Portal, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii, themeColors } from '../../constants/colors';
import { usePartnerEntitlements } from '../../hooks';
import type { PartnerAccessModule, PartnerModule } from '../../types/api-contract.generated';
import { partiesApi } from '../../api/parties.api';
import type { PartnerPartyRecord } from '../billing/types';
import { useDebouncedValue } from '../billing/useDebouncedValue';
import { categoryModulesOf, P2Module } from './modules';
import { addDays, dayLabel, istToday } from './dates';

/**
 * Shared pieces for the P2 screens (pharmacy, subscriptions, appointments,
 * jobs). The Owner's layout rules hold for every one: nothing stretched to the
 * full width that should not be, no row that runs off a 320dp screen, touch
 * targets of at least 48dp, and no empty gaps on a phone.
 */

// ───────────────────────────────────────────────────────────── the gate

/**
 * The `_layout.tsx` of a P2 area: the base modules ON, the business-type module
 * EFFECTIVE, and the person holding at least one of `anyOf`. Anything else goes
 * back to Today — a door that does not open is never drawn (the More rows and
 * the notification routes check the same three things).
 */
export function P2Gate({
  module, base, anyOf,
}: { module: P2Module; base: readonly PartnerModule[]; anyOf: readonly [PartnerAccessModule, 'READ' | 'FULL'][] }) {
  const c = themeColors(useColorScheme() === 'dark');
  const { ready, can, hasModule, entitlements } = usePartnerEntitlements();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        <RNActivityIndicator color={c.primary} />
      </View>
    );
  }
  const open = base.every((m) => hasModule(m))
    && categoryModulesOf(entitlements).includes(module)
    && anyOf.some(([m, level]) => can(m, level));
  if (!open) return <Redirect href="/(app)/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}

// ─────────────────────────────────────────────────────────── day stepper

/**
 * ◀ Today ▶ — the day a sheet is for. 48dp arrows; the label says Today /
 * Yesterday / Tomorrow before it says a date. `min`/`max` stop the arrows
 * (marking reaches back `markBackDays` and never into the future).
 */
export function DayStepper({
  c, day, onChange, min, max, testID,
}: { c: ColorScheme; day: string; onChange: (d: string) => void; min?: string; max?: string; testID?: string }) {
  const { t } = useTranslation();
  const canBack = !min || day > min;
  const canFwd = !max || day < max;
  return (
    <View style={[styles.dayRow, { backgroundColor: c.surface, borderColor: c.divider }]} testID={testID}>
      <Pressable
        onPress={() => canBack && onChange(addDays(day, -1))}
        disabled={!canBack}
        accessibilityRole="button"
        accessibilityLabel={t('p2.common.prevDay')}
        style={[styles.dayBtn, { opacity: canBack ? 1 : 0.35 }]}
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color={c.primary} />
      </Pressable>
      <Pressable
        onPress={() => onChange(istToday())}
        accessibilityRole="button"
        accessibilityLabel={t('p2.common.goToday')}
        style={styles.dayLabelBox}
      >
        <Text style={[styles.dayLabel, { color: c.textPrimary }]} numberOfLines={1}>{dayLabel(day, t)}</Text>
      </Pressable>
      <Pressable
        onPress={() => canFwd && onChange(addDays(day, 1))}
        disabled={!canFwd}
        accessibilityRole="button"
        accessibilityLabel={t('p2.common.nextDay')}
        style={[styles.dayBtn, { opacity: canFwd ? 1 : 0.35 }]}
      >
        <MaterialCommunityIcons name="chevron-right" size={28} color={c.primary} />
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────── status pill

export function Pill({
  c, label, tone = 'neutral', testID,
}: { c: ColorScheme; label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info'; testID?: string }) {
  const color = tone === 'good' ? c.success : tone === 'warn' ? c.warning : tone === 'bad' ? c.error : tone === 'info' ? c.info : c.textSecondary;
  return (
    <View style={[styles.pill, { backgroundColor: `${color}1A`, borderColor: `${color}55` }]} testID={testID}>
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────── the sheet

/**
 * A bottom-ish modal with a title, a close button, a scrolling body and an
 * optional footer (the one primary action). Used for every P2 form that is not
 * worth a screen of its own.
 */
export function Sheet({
  visible, onDismiss, title, children, footer, testID,
}: {
  visible: boolean; onDismiss: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; testID?: string;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={[styles.sheet, { backgroundColor: c.surface }]}>
        <View testID={testID} style={{ maxHeight: '100%' }}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: c.textPrimary }]} numberOfLines={2}>{title}</Text>
            <IconButton icon="close" onPress={onDismiss} accessibilityLabel={t('common.close')} />
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={[styles.sheetFoot, { borderTopColor: c.divider }]}>{footer}</View> : null}
        </View>
      </Modal>
    </Portal>
  );
}

// ─────────────────────────────────────────────────────────── party picker

export interface PickedParty { id: string; name: string; phone?: string }

/**
 * Pick one of this business's customers: type two letters, tap a name. The
 * chosen one shows as a card with a ✕ to change it. Never creates a party —
 * that stays on the Parties screen, so a typo cannot make a second ledger.
 */
export function PartyPicker({
  c, value, onChange, label, testID,
}: { c: ColorScheme; value: PickedParty | null; onChange: (p: PickedParty | null) => void; label?: string; testID?: string }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 300);
  const [rows, setRows] = useState<PartnerPartyRecord[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (value || debounced.trim().length < 2) { setRows([]); return; }
    let alive = true;
    setBusy(true);
    partiesApi.search(debounced.trim(), 'CUSTOMER')
      .then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [debounced, value]);

  if (value) {
    return (
      <View style={[styles.partyCard, { backgroundColor: c.surfaceVariant }]} testID={testID}>
        <MaterialCommunityIcons name="account" size={22} color={c.primary} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>{value.name}</Text>
          {value.phone ? <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>{value.phone}</Text> : null}
        </View>
        <IconButton icon="close-circle" size={22} onPress={() => { onChange(null); setQ(''); }} accessibilityLabel={t('p2.common.changeCustomer')} />
      </View>
    );
  }
  return (
    <View testID={testID}>
      <TextInput
        mode="outlined"
        label={label ?? t('p2.common.customer')}
        placeholder={t('p2.common.searchCustomer')}
        value={q}
        onChangeText={setQ}
        outlineStyle={{ borderRadius: radii.field }}
        style={{ backgroundColor: 'transparent' }}
        left={<TextInput.Icon icon="magnify" />}
        right={busy ? <TextInput.Icon icon={() => <RNActivityIndicator size="small" />} /> : undefined}
      />
      {rows.map((p) => (
        <Pressable
          key={p._id}
          onPress={() => onChange({ id: p._id, name: p.name, phone: p.phone })}
          accessibilityRole="button"
          style={[styles.partyRow, { borderBottomColor: c.divider }]}
        >
          <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>{p.name}</Text>
          {p.phone ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>{p.phone}</Text> : null}
        </Pressable>
      ))}
      {debounced.trim().length >= 2 && !busy && rows.length === 0 ? (
        <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 6 }}>{t('p2.common.noCustomerFound')}</Text>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────── choice chips

/**
 * A wrapping set of big (44dp) option chips — weekdays, reasons, statuses.
 * `multi` toggles; otherwise one is picked.
 */
export function ChoiceChips<T extends string | number>({
  c, options, value, onChange, multi, testID,
}: {
  c: ColorScheme;
  options: { key: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  multi?: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.chips} testID={testID}>
      {options.map((o) => {
        const on = value.includes(o.key);
        return (
          <Pressable
            key={String(o.key)}
            onPress={() => onChange(multi ? (on ? value.filter((v) => v !== o.key) : [...value, o.key]) : [o.key])}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={multi ? { checked: on } : { selected: on }}
            accessibilityLabel={o.label}
            style={[styles.chip, { backgroundColor: on ? c.primary : c.surfaceVariant, borderColor: on ? c.primary : c.divider }]}
          >
            <Text style={{ color: on ? c.textInverse : c.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dayRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  dayBtn: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  dayLabelBox: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  dayLabel: { fontSize: 16, fontWeight: '700' },
  pill: { alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, maxWidth: '100%' },
  pillText: { fontSize: 11.5, fontWeight: '700' },
  sheet: { marginHorizontal: 12, marginVertical: 24, borderRadius: radii.card, maxHeight: '92%', alignSelf: 'center', width: '94%', maxWidth: 560 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  sheetFoot: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  partyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radii.card, paddingLeft: 12, minHeight: 52 },
  partyRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 48 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
