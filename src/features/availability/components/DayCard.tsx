import React from 'react';
import { View, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { Text, IconButton, Switch } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AvailabilityDay, AvailabilityBreak, DAY_NAMES } from '../types';
import { TimeField } from '../../../components/TimeField';
import { themeColors, radii } from '../../../constants/colors';

const SLOT_CHOICES = [15, 20, 30, 45, 60, 90, 120];

/** One open day's diary rule: hours, slot length, capacity, and an optional break. Closed days collapse to a single toggle row. */
export function DayCard({
  day, breaks, disabled, onToggleOpen, onPatch, onPatchBreaks,
}: {
  day: AvailabilityDay;
  breaks: AvailabilityBreak[];
  disabled?: boolean;
  onToggleOpen: () => void;
  onPatch: (patch: Partial<AvailabilityDay>) => void;
  onPatchBreaks: (breaks: AvailabilityBreak[]) => void;
}) {
  const c = themeColors(useColorScheme() === 'dark');

  const setWindow = (index: number, patch: Partial<{ from: string; to: string }>) => {
    onPatch({ windows: day.windows.map((w, i) => (i === index ? { ...w, ...patch } : w)) });
  };

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
      <Pressable onPress={onToggleOpen} disabled={disabled} style={styles.headerRow}>
        <Text style={[styles.dayName, { color: c.textPrimary }]}>{DAY_NAMES[day.day]}</Text>
        <Switch value={day.isOpen} onValueChange={onToggleOpen} disabled={disabled} />
      </Pressable>

      {day.isOpen && (
        <View style={styles.body}>
          {day.windows.map((w, i) => (
            <View key={i} style={styles.windowRow}>
              <TimeField label="Open" value={w.from} onChangeText={(v) => setWindow(i, { from: v })}
                disabled={disabled} style={styles.timeField} />
              <TimeField label="Close" value={w.to} onChangeText={(v) => setWindow(i, { to: v })}
                disabled={disabled} style={styles.timeField} />
              {day.windows.length > 1 && !disabled && (
                <IconButton icon="trash-can-outline" size={18} iconColor={c.textSecondary}
                  onPress={() => onPatch({ windows: day.windows.filter((_, xi) => xi !== i) })} />
              )}
            </View>
          ))}
          {day.windows.length < 4 && !disabled && (
            <Pressable
              onPress={() => onPatch({ windows: [...day.windows, { from: '16:00', to: '20:00' }] })}
              style={styles.linkRow}
            >
              <MaterialCommunityIcons name="plus" size={15} color={c.primary} />
              <Text style={[styles.linkText, { color: c.primary }]}>Another window</Text>
            </Pressable>
          )}

          <View style={styles.rowGap}>
            <View style={styles.half}>
              <Text style={[styles.smallLabel, { color: c.textSecondary }]}>A booking every</Text>
              <View style={styles.slotChipRow}>
                {SLOT_CHOICES.map((m) => {
                  const active = day.slotMin === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => !disabled && onPatch({ slotMin: m })}
                      style={[styles.slotChip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
                    >
                      <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 11, fontWeight: '700' }}>{m}m</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.capacityRow}>
            <Text style={[styles.smallLabel, { color: c.textSecondary }]}>Customers at once</Text>
            <View style={styles.stepper}>
              <IconButton icon="minus" size={16} iconColor={c.textPrimary} disabled={disabled || day.capacityPerSlot <= 1}
                onPress={() => onPatch({ capacityPerSlot: Math.max(1, day.capacityPerSlot - 1) })} />
              <Text style={[styles.capacityValue, { color: c.textPrimary }]}>{day.capacityPerSlot}</Text>
              <IconButton icon="plus" size={16} iconColor={c.textPrimary} disabled={disabled}
                onPress={() => onPatch({ capacityPerSlot: Math.min(100, day.capacityPerSlot + 1) })} />
            </View>
          </View>

          {breaks.length === 0 ? (
            !disabled && (
              <Pressable onPress={() => onPatchBreaks([{ day: day.day, from: '13:00', to: '14:00' }])} style={styles.linkRow}>
                <MaterialCommunityIcons name="coffee-outline" size={15} color={c.primary} />
                <Text style={[styles.linkText, { color: c.primary }]}>Add a break</Text>
              </Pressable>
            )
          ) : (
            breaks.map((b, i) => (
              <View key={i} style={styles.windowRow}>
                <TimeField label="Break from" value={b.from}
                  onChangeText={(v) => onPatchBreaks(breaks.map((x, xi) => (xi === i ? { ...x, from: v } : x)))}
                  disabled={disabled} style={styles.timeField} />
                <TimeField label="Break to" value={b.to}
                  onChangeText={(v) => onPatchBreaks(breaks.map((x, xi) => (xi === i ? { ...x, to: v } : x)))}
                  disabled={disabled} style={styles.timeField} />
                {!disabled && (
                  <IconButton icon="trash-can-outline" size={18} iconColor={c.textSecondary}
                    onPress={() => onPatchBreaks(breaks.filter((_, xi) => xi !== i))} />
                )}
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  dayName: { fontSize: 14.5, fontWeight: '700' },
  body: { paddingHorizontal: 14, paddingBottom: 12, gap: 4 },
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeField: { flex: 1, marginVertical: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  linkText: { fontSize: 12.5, fontWeight: '700' },
  rowGap: { marginTop: 4 },
  half: { flex: 1 },
  smallLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  slotChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  slotChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  capacityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  capacityValue: { fontSize: 14, fontWeight: '800', minWidth: 20, textAlign: 'center' },
});
