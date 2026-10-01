import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { STATUS_LABEL_KEYS } from '../../bookings/format';
import { istTimeOf } from '../../p2/dates';
import { Pill } from '../../p2/ui';
import { statusTone } from '../logic';
import type { CalendarBooking, CalendarTimeOff } from '../types';

/** One booking in a staff section: the time big, then who and what, the status and small markers. */
export function BookingCard({ c, b, onPress }: { c: ColorScheme; b: CalendarBooking; onPress: () => void }) {
  const { t } = useTranslation();
  const range = `${istTimeOf(b.slotStart)}–${istTimeOf(b.slotEnd)}`;
  const statusKey = (STATUS_LABEL_KEYS as Record<string, string>)[b.status];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${range} ${b.customerName}`}
      testID={`appt-booking-${b.id}`}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}
    >
      <Text style={[styles.time, { color: c.textPrimary }]} numberOfLines={1}>{range}</Text>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{b.customerName}</Text>
        {b.serviceName ? <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>{b.serviceName}</Text> : null}
        <View style={styles.meta}>
          <Pill c={c} label={statusKey ? t(statusKey) : b.status} tone={statusTone(b.status)} />
          {b.seriesId ? (
            <MaterialCommunityIcons name="repeat" size={16} color={c.textSecondary} accessibilityLabel={t('p2.appointments.cal.seriesMark')} />
          ) : null}
          {b.packagePurchaseId ? (
            <MaterialCommunityIcons name="ticket-confirmation-outline" size={16} color={c.textSecondary} accessibilityLabel={t('p2.appointments.cal.packageMark')} />
          ) : null}
          {b.jobId ? (
            <MaterialCommunityIcons name="hammer-wrench" size={16} color={c.textSecondary} accessibilityLabel={t('p2.appointments.cal.jobMark')} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** A grey, dashed block: "Time off 14:00–18:00 · reason". */
export function TimeOffCard({ c, block, from, to }: { c: ColorScheme; block: CalendarTimeOff; from: string; to: string }) {
  const { t } = useTranslation();
  const text = block.reason
    ? t('p2.appointments.cal.timeOffReason', { from, to, reason: block.reason })
    : t('p2.appointments.cal.timeOff', { from, to });
  return (
    <View
      style={[styles.off, { backgroundColor: c.surfaceVariant, borderColor: c.textDisabled }]}
      testID={`appt-timeoff-${block.id}`}
    >
      <MaterialCommunityIcons name="cancel" size={18} color={c.textSecondary} />
      <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600', flex: 1, minWidth: 0 }} numberOfLines={2}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth,
    padding: 12, minHeight: 64,
  },
  time: { fontSize: 16, fontWeight: '700', minWidth: 92 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  off: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radii.card, borderWidth: 1, borderStyle: 'dashed',
    paddingHorizontal: 12, paddingVertical: 10, minHeight: 48,
  },
});
