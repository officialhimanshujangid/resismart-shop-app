import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { OrderStatus } from '../types';
import { ORDER_STATUS_LABELS } from '../backend-mirror';
import { ColorScheme } from '../../../constants/colors';

/** One colour family per stage of the order's life, not per exact status —
 *  a partner scanning a list cares "is this new / in progress / done / dead",
 *  not which of six in-progress statuses it is; the label still says which. */
function toneFor(status: OrderStatus, c: ColorScheme): { bg: string; fg: string } {
  switch (status) {
    case 'PLACED':
      return { bg: c.info + '22', fg: c.info };
    case 'ACCEPTED':
    case 'PACKED':
    case 'OUT_FOR_DELIVERY':
      return { bg: c.warning + '22', fg: c.warning };
    case 'DELIVERED':
    case 'INVOICED':
    case 'PAID':
      return { bg: c.success + '22', fg: c.success };
    case 'REJECTED':
    case 'CANCELLED':
    case 'RETURNED':
    default:
      return { bg: c.error + '1F', fg: c.error };
  }
}

export function OrderStatusChip({ status, c }: { status: OrderStatus; c: ColorScheme }) {
  const tone = toneFor(status, c);
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }]}>
      <Text style={[styles.label, { color: tone.fg }]}>{ORDER_STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
});
