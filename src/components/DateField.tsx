import React, { useState } from 'react';
import { View, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { TextInput, HelperText } from 'react-native-paper';
import DateTimePickerModal from 'react-native-modal-datetime-picker';

import { themeColors, radii } from '../constants/colors';

export type DateFieldMode = 'date' | 'time' | 'datetime';

export interface DateFieldProps {
  label: string;
  /** Same string the raw `AppInput` this replaces held — see the format table below. */
  value: string;
  /** Named `onChangeText` (not `onChange`) to match `AppInput`'s existing
   *  signature, so `<AppInput value={x} onChangeText={setX} />` → `<DateField .../>`
   *  is a prop-for-prop swap. */
  onChangeText: (value: string) => void;
  /** Default 'date'. */
  mode?: DateFieldMode;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
  style?: object;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');

function fmtDateOnly(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function fmtTimeOnly(d: Date) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function fmtDateTime(d: Date) { return `${fmtDateOnly(d)} ${fmtTimeOnly(d)}`; }

function fmtDisplayDate(d: Date) { return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
function fmtDisplayTime(d: Date) {
  let h = d.getHours();
  const m = pad2(d.getMinutes());
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/**
 * This component's OWN value string → `Date`, for seeding/reading the picker.
 * Empty or unparsable input falls back to "now" (never throws).
 */
function parseValue(value: string, mode: DateFieldMode): Date {
  const t = (value ?? '').trim();
  if (!t) return new Date();
  if (mode === 'time') {
    const m = /^(\d{1,2}):(\d{2})/.exec(t);
    if (!m) return new Date();
    const d = new Date();
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d;
  }
  // 'date' → "YYYY-MM-DD"; 'datetime' → "YYYY-MM-DD HH:MM" (space-separated).
  const norm = t.includes(' ') ? t.replace(' ', 'T') : t;
  const d = new Date(norm);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function formatValue(d: Date, mode: DateFieldMode): string {
  if (mode === 'time') return fmtTimeOnly(d);
  if (mode === 'datetime') return fmtDateTime(d);
  return fmtDateOnly(d);
}

function formatDisplay(value: string, mode: DateFieldMode): string {
  const t = (value ?? '').trim();
  if (!t) return '';
  const d = parseValue(t, mode);
  if (mode === 'time') return fmtDisplayTime(d);
  if (mode === 'datetime') return `${fmtDisplayDate(d)}, ${fmtDisplayTime(d)}`;
  return fmtDisplayDate(d);
}

/**
 * `AppInput`-shaped field that opens the native date/time picker on tap
 * instead of the keyboard — for C6 (invoice `documentDate`/`dueDate`/
 * `validUntil`) and any future raw date input in this app.
 *
 * VALUE FORMATS EMITTED (a parent's existing parse/submit logic needs no
 * change when swapping a text field for this):
 *   mode="date"     → "YYYY-MM-DD"
 *   mode="time"     → "HH:MM"            (24-hour, e.g. "09:00")
 *   mode="datetime" → "YYYY-MM-DD HH:MM" (24-hour, space-separated)
 *
 * Empty `value` shows `placeholder` and opens the picker seeded on "now" —
 * nothing is written until the user confirms, so an optional field (e.g.
 * `validUntil`) stays empty until touched.
 */
export function DateField({
  label, value, onChangeText, mode = 'date', error, placeholder, disabled = false,
  minimumDate, maximumDate, style,
}: DateFieldProps) {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const [open, setOpen] = useState(false);
  const display = formatDisplay(value, mode);
  const iconName = mode === 'time' ? 'clock-outline' : 'calendar';
  const emptyPlaceholder = placeholder ?? (mode === 'time' ? 'Select time' : mode === 'datetime' ? 'Select date & time' : 'Select date');

  return (
    <View style={[styles.container, style]}>
      <Pressable onPress={() => !disabled && setOpen(true)} disabled={disabled}>
        <View pointerEvents="none">
          <TextInput
            label={label}
            value={display}
            placeholder={emptyPlaceholder}
            editable={false}
            disabled={disabled}
            mode="outlined"
            error={!!error}
            outlineStyle={styles.outline}
            style={[styles.input, { backgroundColor: c.surface }]}
            textColor={c.textPrimary}
            right={<TextInput.Icon icon={iconName} color={c.textSecondary} />}
          />
        </View>
      </Pressable>
      {!!error && (
        <HelperText type="error" visible={!!error} style={styles.helperText}>
          {error}
        </HelperText>
      )}

      <DateTimePickerModal
        isVisible={open}
        mode={mode}
        date={parseValue(value, mode)}
        is24Hour
        isDarkModeEnabled={isDark}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onConfirm={(d) => { setOpen(false); onChangeText(formatValue(d, mode)); }}
        onCancel={() => setOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  input: {
    fontSize: 15,
  },
  outline: {
    borderRadius: radii.field,
    borderWidth: 1.5,
  },
  helperText: {
    marginTop: -2,
    fontSize: 12,
  },
});
