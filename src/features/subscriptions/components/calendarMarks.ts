import type { ColorScheme } from '../../../constants/colors';
import type { AttendanceMonth, DayState, MonthDay } from '../types';
import type { CalendarMark, LegendItem } from './MonthCalendar';

type T = (k: string, o?: Record<string, unknown>) => string;

const DELIVERY_STATES: DayState[] = ['DUE', 'DELIVERED', 'EXTRA', 'NOT_DELIVERED', 'PAUSED', 'HOLIDAY'];

const colorOf = (c: ColorScheme, s: string) => {
  switch (s) {
    case 'DELIVERED': case 'EXTRA': case 'PRESENT': return c.success;
    case 'NOT_DELIVERED': case 'ABSENT': return c.error;
    case 'PAUSED': case 'HOLIDAY': case 'LEAVE': return c.warning;
    default: return c.info;
  }
};

/** A subscription's month (`month.days[].state`) as calendar letters + the legend. */
export function deliveryMarks(days: readonly MonthDay[], c: ColorScheme, t: T): { marks: Record<string, CalendarMark>; legend: LegendItem[] } {
  const marks: Record<string, CalendarMark> = {};
  for (const d of days) {
    if (!DELIVERY_STATES.includes(d.state)) continue;
    marks[d.day] = { letter: t(`p2.subscriptions.calendar.letter.${d.state}`), color: colorOf(c, d.state) };
  }
  const legend = DELIVERY_STATES.map((s) => ({
    letter: t(`p2.subscriptions.calendar.letter.${s}`), color: colorOf(c, s), label: t(`p2.subscriptions.state.${s}`),
  }));
  return { marks, legend };
}

/** A student's month from `GET /:id/attendance`. */
export function attendanceMarks(m: AttendanceMonth, c: ColorScheme, t: T): { marks: Record<string, CalendarMark>; legend: LegendItem[] } {
  const marks: Record<string, CalendarMark> = {};
  for (const d of m.days ?? []) {
    if (d.status) marks[d.day] = { letter: t(`p2.subscriptions.calendar.letter.${d.status}`), color: colorOf(c, d.status) };
    else if (d.classDay) marks[d.day] = { letter: t('p2.subscriptions.calendar.letter.CLASS'), color: c.info };
  }
  const legend = (['PRESENT', 'ABSENT', 'LEAVE', 'CLASS'] as const).map((s) => ({
    letter: t(`p2.subscriptions.calendar.letter.${s}`),
    color: s === 'CLASS' ? c.info : colorOf(c, s),
    label: s === 'CLASS' ? t('p2.subscriptions.calendar.classDay') : t(`p2.subscriptions.attendance.${s}`),
  }));
  return { marks, legend };
}
