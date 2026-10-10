import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { ColorScheme } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { bookingApi } from '../../bookings/booking.api';
import type { PartnerBookingView } from '../../bookings/booking.types';
import { Sheet } from '../../p2/ui';
import { addDays, dayTimeLabel, istToday } from '../../p2/dates';
import { jobKeys } from '../api';
import { PICKABLE_BOOKING_STATUSES, pickableBookings } from '../logic';
import { SkeletonList } from '../../../components/ui';

/**
 * "New quote" → pick the booking the quote is for: open bookings (accepted,
 * scheduled, rescheduled, under way), today and later, soonest first. One tap
 * on a row goes to the quote screen.
 */
export function BookingPickerSheet({
  c, visible, onDismiss, onPick,
}: { c: ColorScheme; visible: boolean; onDismiss: () => void; onPick: (b: PartnerBookingView) => void }) {
  const { t } = useTranslation();
  const today = istToday();
  const q = useQuery({
    queryKey: jobKeys.pickBookings(),
    queryFn: () => bookingApi.list({ status: PICKABLE_BOOKING_STATUSES.join(','), from: addDays(today, -1), limit: 100 }),
    enabled: visible,
  });
  const rows = pickableBookings(Array.isArray(q.data?.data) ? q.data.data : [], today);

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('p2.jobs.pick.title')} testID="job-pick-sheet">
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.jobs.pick.hint')}</Text>
      {q.isPending ? <SkeletonList rows={2} /> : null}
      {q.isError ? <Text style={{ color: c.error }}>{apiErrorMessage(q.error, t('p2.common.loadFailed'))}</Text> : null}
      {!q.isPending && !q.isError && rows.length === 0 ? (
        <Text style={{ color: c.textSecondary }}>{t('p2.jobs.pick.empty')}</Text>
      ) : null}
      {rows.map((b) => (
        <Pressable
          key={b.id}
          onPress={() => onPick(b)}
          accessibilityRole="button"
          accessibilityLabel={`${b.code} ${b.customer?.name ?? ''}`}
          style={[styles.row, { borderBottomColor: c.divider }]}
          testID={`job-pick-${b.id}`}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.textPrimary, fontWeight: '700' }} numberOfLines={1}>
              {`${b.code} · ${b.customer?.name ?? ''}`}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
              {`${b.serviceSnapshot?.name ?? ''} · ${dayTimeLabel(b.slotStart, t)}`}
            </Text>
          </View>
        </Pressable>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
});
