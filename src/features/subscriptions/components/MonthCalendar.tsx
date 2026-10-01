import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { addMonths, monthLabel } from '../../p2/dates';
import { monthGrid } from '../logic';

export interface CalendarMark { letter: string; color: string }
export interface LegendItem { letter: string; color: string; label: string }

/** ◀ October 2026 ▶ — 48dp arrows. */
export function MonthSwitcher({
  c, period, onChange, max, testID,
}: { c: ColorScheme; period: string; onChange: (p: string) => void; max?: string; testID?: string }) {
  const { t } = useTranslation();
  const canFwd = !max || period < max;
  return (
    <View style={[styles.switcher, { backgroundColor: c.surface, borderColor: c.divider }]} testID={testID}>
      <Pressable onPress={() => onChange(addMonths(period, -1))} accessibilityRole="button"
        accessibilityLabel={t('p2.subscriptions.month.prev')} style={styles.arrow}>
        <MaterialCommunityIcons name="chevron-left" size={28} color={c.primary} />
      </Pressable>
      <Text style={[styles.monthText, { color: c.textPrimary }]} numberOfLines={1}>{monthLabel(period, t)}</Text>
      <Pressable onPress={() => canFwd && onChange(addMonths(period, 1))} disabled={!canFwd} accessibilityRole="button"
        accessibilityLabel={t('p2.subscriptions.month.next')} style={[styles.arrow, { opacity: canFwd ? 1 : 0.35 }]}>
        <MaterialCommunityIcons name="chevron-right" size={28} color={c.primary} />
      </Pressable>
    </View>
  );
}

/**
 * A month as a 7-column grid (Sunday first) that fits a 320dp phone: each cell
 * is the day number over a one-letter state in its colour, and a legend below
 * says what the letters mean.
 */
export function MonthCalendar({
  c, period, marks, legend, testID,
}: { c: ColorScheme; period: string; marks: Readonly<Record<string, CalendarMark>>; legend: readonly LegendItem[]; testID?: string }) {
  const { t } = useTranslation();
  const weeks = monthGrid(period);
  return (
    <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.divider }]} testID={testID}>
      <View style={styles.week}>
        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
          <Text key={d} style={[styles.dow, { color: c.textSecondary }]} numberOfLines={1}>{t(`common.days.${d}`)}</Text>
        ))}
      </View>
      {weeks.map((w, i) => (
        <View key={i} style={styles.week}>
          {w.map((day, k) => {
            const m = day ? marks[day] : undefined;
            return (
              <View key={day ?? `b${k}`} style={[styles.cell, m ? { backgroundColor: `${m.color}1A` } : null]}
                accessible={!!day} accessibilityLabel={day && m ? `${+day.slice(8, 10)} ${legend.find((l) => l.letter === m.letter)?.label ?? ''}` : undefined}>
                {day ? (
                  <>
                    <Text style={[styles.num, { color: c.textPrimary }]}>{+day.slice(8, 10)}</Text>
                    <Text style={[styles.letter, { color: m?.color ?? c.textDisabled }]}>{m?.letter ?? '·'}</Text>
                  </>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        {legend.map((l) => (
          <View key={l.letter} style={styles.legendItem}>
            <Text style={[styles.letter, { color: l.color }]}>{l.letter}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 11 }} numberOfLines={1}>{l.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, minHeight: 52 },
  arrow: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  monthText: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  box: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 6, gap: 2 },
  week: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', paddingVertical: 2 },
  cell: { flex: 1, minWidth: 0, aspectRatio: 1, maxHeight: 52, margin: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  num: { fontSize: 12, fontWeight: '600' },
  letter: { fontSize: 11, fontWeight: '800' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 4, paddingTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
