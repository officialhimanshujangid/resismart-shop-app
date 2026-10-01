import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { StatGrid, StatTile } from '../../p1/ui';
import { fmtQty } from '../logic';
import type { AttendanceMonth, MonthResult } from '../types';
import { MonthCalendar } from './MonthCalendar';
import { attendanceMarks, deliveryMarks } from './calendarMarks';

/**
 * One month of a delivery subscription: the calendar from `month.days[].state`,
 * then the bill as it stands (delivered days, amount, per line) — the same
 * computation the monthly bill uses, so it is also the bill preview.
 */
export function DeliveryMonth({ c, month }: { c: ColorScheme; month: MonthResult }) {
  const { t } = useTranslation();
  const { marks, legend } = deliveryMarks(month.days ?? [], c, t);
  return (
    <View style={{ gap: 10 }}>
      <MonthCalendar c={c} period={month.period} marks={marks} legend={legend} testID="month-calendar" />
      <StatGrid>
        <StatTile c={c} label={t('p2.subscriptions.detail.deliveredDays')} value={String(month.deliveredDays)} testID="month-days" />
        <StatTile c={c} label={t('p2.subscriptions.detail.billSoFar')} value={formatPaise(month.amountPaise)} testID="month-amount" />
      </StatGrid>
      {(month.lines ?? []).map((l, i) => (
        <View key={`${l.lineKey}-${l.ratePaise}-${i}`} style={styles.line}>
          <Text style={{ flex: 1, minWidth: 0, color: c.textPrimary }} numberOfLines={2}>
            {`${l.itemName} · ${fmtQty(l.qty)} ${l.unit} × ${formatPaise(l.ratePaise)}`}
          </Text>
          <Text style={{ color: c.textPrimary, fontWeight: '700' }} numberOfLines={1}>{formatPaise(l.amountPaise)}</Text>
        </View>
      ))}
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.subscriptions.detail.previewNote')}</Text>
    </View>
  );
}

/** One month of a tuition student: present / absent / leave, and the calendar. */
export function AttendanceMonthView({ c, data, period }: { c: ColorScheme; data?: AttendanceMonth; period: string }) {
  const { t } = useTranslation();
  const m = data ?? { month: period, present: 0, absent: 0, leave: 0, days: [] };
  const { marks, legend } = attendanceMarks(m, c, t);
  return (
    <View style={{ gap: 10 }}>
      <StatGrid>
        <StatTile c={c} label={t('p2.subscriptions.attendance.PRESENT')} value={String(m.present)} tone={c.success} testID="att-present" />
        <StatTile c={c} label={t('p2.subscriptions.attendance.ABSENT')} value={String(m.absent)} tone={c.error} />
        <StatTile c={c} label={t('p2.subscriptions.attendance.LEAVE')} value={String(m.leave)} tone={c.warning} />
      </StatGrid>
      <MonthCalendar c={c} period={period} marks={marks} legend={legend} testID="attendance-calendar" />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
