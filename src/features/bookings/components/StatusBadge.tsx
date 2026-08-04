import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { BookingStatus } from '../booking.types';
import { STATUS_LABELS, STATUS_TONE, StatusTone } from '../format';
import { palette, radii } from '../../../constants/colors';

/** Tone → (background, ink), light and dark share the same tone rather than the theme's own colours — a status chip has to read the same regardless of card background. */
const TONE_COLORS: Record<StatusTone, { bg: string; ink: string }> = {
  attention: { bg: palette.coral.soft, ink: palette.coral[600] },
  active: { bg: palette.brand[50], ink: palette.brand[600] },
  success: { bg: '#DCFCE7', ink: '#15803D' },
  neutral: { bg: palette.line, ink: palette.soft },
  danger: { bg: '#FEE2E2', ink: '#B91C1C' },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const tone = TONE_COLORS[STATUS_TONE[status]];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.ink }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '700' },
});
