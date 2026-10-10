import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import type { AvailabilityRow } from '../../availability/types';
import { ChoiceChips, DayStepper } from '../../p2/ui';
import { istDayOf } from '../../p2/dates';
import { currentSlot, pickableSlots } from '../logic';
import { PressableScale, Rise } from '../../../theme/motion'; // M22

/**
 * When: a big "Now" chip (the slot running now, today only), then the day's
 * grid as chips, and ◀ day ▶ for another day. Only starts ON the business's
 * grid are offered — anything else the server refuses (BOOKING_SLOT_NOT_OFFERED).
 */
export function SlotPicker({
  c, availability, day, onDay, time, onTime, durationMin, now = new Date(), allowNow = true, testID,
}: {
  c: ColorScheme;
  availability: AvailabilityRow | null | undefined;
  day: string;
  onDay: (d: string) => void;
  time?: string;
  onTime: (hhmm: string) => void;
  durationMin?: number;
  now?: Date;
  allowNow?: boolean;
  testID?: string;
}) {
  const { t } = useTranslation();
  const today = istDayOf(now);
  const running = allowNow && day === today ? currentSlot(availability, now, durationMin) : null;
  const slots = pickableSlots(availability, day, now, durationMin).filter((s) => s !== running);
  const nowOn = !!running && time === running;

  return (
    <View style={{ gap: 10 }} testID={testID}>
      <DayStepper c={c} day={day} onChange={onDay} min={today} testID="appt-slot-day" />
      {running ? (
        <PressableScale
          haptic
          onPress={() => onTime(running)}
          accessibilityRole="radio"
          accessibilityState={{ selected: nowOn }}
          accessibilityLabel={t('p2.appointments.new.nowAt', { time: running })}
          testID="appt-now"
          style={[styles.now, { backgroundColor: nowOn ? c.primary : c.surfaceVariant, borderColor: c.primary }]}
        >
          <MaterialCommunityIcons name="clock-fast" size={22} color={nowOn ? c.textInverse : c.primary} />
          <Text style={{ color: nowOn ? c.textInverse : c.primary, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
            {t('p2.appointments.new.nowAt', { time: running })}
          </Text>
        </PressableScale>
      ) : null}
      {availability === null ? (
        <Text style={{ color: c.warning, fontSize: 13 }}>{t('p2.appointments.new.noSchedule')}</Text>
      ) : slots.length ? (
        // M22 — the day's slots slide in when the day changes (re-keyed by day).
        <Rise key={day}>
          <ChoiceChips c={c} options={slots.map((s) => ({ key: s, label: s }))} value={time ? [time] : []} onChange={(v) => v[0] && onTime(v[0])} testID="appt-slots" />
        </Rise>
      ) : !running ? (
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('p2.appointments.new.noSlots')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  now: {
    flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', minHeight: 56,
    paddingHorizontal: 20, borderRadius: radii.pill, borderWidth: 1.5, maxWidth: '100%',
  },
});
