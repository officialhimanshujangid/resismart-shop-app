import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { blockRangeOn, StaffSection } from '../logic';
import { BookingCard, TimeOffCard } from './BookingCard';

/**
 * One person's day. On a phone it is a section (name, then the cards); on a
 * tablet a column (≥220dp) of the horizontal diary. A day with nothing in it
 * collapses to one "Free all day" line — never an empty box.
 */
export function StaffSectionView({
  c, section, day, column, onOpen,
}: { c: ColorScheme; section: StaffSection; day: string; column?: boolean; onOpen: (bookingId: string) => void }) {
  const { t } = useTranslation();
  // Time off and bookings share one timeline, in start order.
  type Node = { kind: 'off'; o: StaffSection['timeOff'][number] } | { kind: 'booking'; b: StaffSection['bookings'][number] };
  const ordered: { at: number; node: Node }[] = [
    ...section.timeOff.map((o) => ({ at: new Date(o.from).getTime(), node: { kind: 'off' as const, o } })),
    ...section.bookings.map((b) => ({ at: new Date(b.slotStart).getTime(), node: { kind: 'booking' as const, b } })),
  ].sort((x, y) => x.at - y.at);

  if (section.free) {
    return (
      <View
        style={[styles.freeRow, column && styles.column, { backgroundColor: c.surface, borderColor: c.divider }]}
        testID={`appt-section-${section.key}`}
      >
        <Text style={{ color: c.textPrimary, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>{section.name}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 13, marginLeft: 'auto' }} numberOfLines={1}>
          {t('p2.appointments.cal.freeAllDay')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[{ gap: 8 }, column && styles.column]} testID={`appt-section-${section.key}`}>
      <View style={styles.head}>
        <MaterialCommunityIcons name={section.staffId ? 'account' : 'account-question-outline'} size={18} color={c.primary} />
        <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 15, flex: 1, minWidth: 0 }} numberOfLines={1}>
          {section.name}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>
          {t('p2.appointments.cal.bookings', { count: section.bookings.length })}
        </Text>
      </View>
      {ordered.map(({ node }) => (node.kind === 'off'
        ? <TimeOffCard key={`o-${node.o.id}`} c={c} block={node.o} {...blockRangeOn(node.o, day)} />
        : <BookingCard key={`b-${node.b.id}`} c={c} b={node.b} onPress={() => onOpen(node.b.id)} />))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  freeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, minHeight: 48,
  },
  column: { width: 240, minWidth: 220, alignSelf: 'flex-start' },
});
