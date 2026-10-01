import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { Pill } from '../../p2/ui';
import { ATTENDANCE_STATUSES, AttendanceRowData, AttendanceStatus } from '../types';

/**
 * One student: name (and flat), then three big buttons — Present / Absent /
 * Leave (≥48dp each, wrapping on a 320dp phone). A day that is not a class day
 * for this student is disabled and says "No class".
 */
export function AttendanceRow({
  c, row, value, onChange, disabled,
}: { c: ColorScheme; row: AttendanceRowData; value?: AttendanceStatus; onChange: (s: AttendanceStatus) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const tone = (s: AttendanceStatus) => (s === 'PRESENT' ? c.success : s === 'ABSENT' ? c.error : c.warning);
  const off = !row.classDay || disabled;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider, opacity: row.classDay ? 1 : 0.6 }]}
      testID={`attendance-row-${row.subscriptionId}`}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{row.customerName}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
            {[row.flatLabel, row.code].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {!row.classDay ? <Pill c={c} label={t('p2.subscriptions.attendance.noClass')} /> : null}
        {row.classDay && row.pausedBy ? <Pill c={c} tone="warn" label={t(`p2.subscriptions.pausedBy.${row.pausedBy}`)} /> : null}
      </View>
      <View style={styles.seg}>
        {ATTENDANCE_STATUSES.map((s) => {
          const on = value === s;
          return (
            <Pressable
              key={s}
              onPress={() => onChange(s)}
              disabled={off}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: !!off }}
              accessibilityLabel={`${row.customerName} ${t(`p2.subscriptions.attendance.${s}`)}`}
              testID={`att-${row.subscriptionId}-${s}`}
              style={[styles.btn, { borderColor: tone(s), backgroundColor: on ? tone(s) : 'transparent', opacity: off ? 0.45 : 1 }]}
            >
              <Text style={{ color: on ? c.textInverse : tone(s), fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                {t(`p2.subscriptions.attendance.${s}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: 12, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '700' },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    flexGrow: 1, flexBasis: 84, minHeight: 48, borderRadius: radii.pill, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
  },
});
