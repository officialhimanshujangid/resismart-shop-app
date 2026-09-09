import React, { useState } from 'react';
import { View, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { TextInput, HelperText } from 'react-native-paper';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../constants/colors';

/** `t` as these helpers need it — a key in, a sentence out. */
type Translate = (key: string, vars?: Record<string, string | number>) => string;

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

/**
 * The month NAMES come from `common.months`, not from a private array and not
 * from `toLocaleDateString`.
 *
 * A private array is how this file and the invoice screen ended up able to
 * disagree about the same month; `Intl` is ruled out for the reason
 * `src/i18n/index.ts#formatI18nDate` gives at length — this app runs on Hermes,
 * Android's ICU coverage cannot be relied on, and the failure is a Hindi screen
 * quietly rendering English months with nothing to reveal it. One catalogue,
 * read by both, is deterministic on every platform.
 *
 * The MACHINE formats below (`fmtDateOnly`, `fmtTimeOnly`, `fmtDateTime`) are
 * untouched and must stay that way: they are this component's contract with its
 * parents ("YYYY-MM-DD", 24-hour "HH:MM") and are parsed, not read.
 */
const pad2 = (n: number) => String(n).padStart(2, '0');

function fmtDateOnly(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function fmtTimeOnly(d: Date) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function fmtDateTime(d: Date) { return `${fmtDateOnly(d)} ${fmtTimeOnly(d)}`; }

function fmtDisplayDate(d: Date, t: Translate) {
  return t('components.date.display', {
    day: d.getDate(),
    month: t(`common.months.${d.getMonth() + 1}`),
    year: d.getFullYear(),
  });
}
function fmtDisplayTime(d: Date, t: Translate) {
  let h = d.getHours();
  const m = pad2(d.getMinutes());
  const meridiem = t(h >= 12 ? 'common.pm' : 'common.am');
  h = h % 12; if (h === 0) h = 12;
  return t('components.date.time', { hour: h, minute: m, meridiem });
}

/**
 * This component's OWN value string → `Date`, for seeding/reading the picker.
 * Empty or unparsable input falls back to "now" (never throws).
 */
// `raw`, not `t` — this file threads a translator through every other helper.
function parseValue(value: string, mode: DateFieldMode): Date {
  const raw = (value ?? '').trim();
  if (!raw) return new Date();
  if (mode === 'time') {
    const m = /^(\d{1,2}):(\d{2})/.exec(raw);
    if (!m) return new Date();
    const d = new Date();
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d;
  }
  // 'date' → "YYYY-MM-DD"; 'datetime' → "YYYY-MM-DD HH:MM" (space-separated).
  const norm = raw.includes(' ') ? raw.replace(' ', 'T') : raw;
  const d = new Date(norm);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function formatValue(d: Date, mode: DateFieldMode): string {
  if (mode === 'time') return fmtTimeOnly(d);
  if (mode === 'datetime') return fmtDateTime(d);
  return fmtDateOnly(d);
}

// `raw`, not `t` — the local used to shadow the translator this now takes.
function formatDisplay(value: string, mode: DateFieldMode, t: Translate): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  const d = parseValue(raw, mode);
  if (mode === 'time') return fmtDisplayTime(d, t);
  if (mode === 'datetime') {
    return t('components.date.dateTime', { date: fmtDisplayDate(d, t), time: fmtDisplayTime(d, t) });
  }
  return fmtDisplayDate(d, t);
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
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const [open, setOpen] = useState(false);
  const display = formatDisplay(value, mode, t);
  const iconName = mode === 'time' ? 'clock-outline' : 'calendar';
  const emptyPlaceholder = placeholder ?? t(
    mode === 'time'
      ? 'components.date.selectTime'
      : mode === 'datetime' ? 'components.date.selectDateTime' : 'components.date.selectDate',
  );

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
