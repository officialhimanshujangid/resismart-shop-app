import React from 'react';
import { DateField, DateFieldProps } from './DateField';

/**
 * `DateField` pinned to `mode="time"` — a named component for pure time
 * inputs so a call site reads "this is a time" without a `mode` prop to
 * notice. Emits "HH:MM" (24-hour), identical to a raw text field it replaces.
 */
export function TimeField(props: Omit<DateFieldProps, 'mode'>) {
  return <DateField {...props} mode="time" />;
}
