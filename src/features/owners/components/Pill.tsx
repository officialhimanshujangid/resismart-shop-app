import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { ColorScheme, radii } from '../../../constants/colors';

export type PillTone = 'neutral' | 'brand' | 'good' | 'warn' | 'bad';

/** A small status label. Never stretches: it sizes to its text. */
export function Pill({ c, label, tone = 'neutral' }: { c: ColorScheme; label: string; tone?: PillTone }) {
  const fg = tone === 'good' ? c.success : tone === 'warn' ? c.warning : tone === 'bad' ? c.error : tone === 'brand' ? c.primary : c.textSecondary;
  const bg = tone === 'neutral' ? c.surfaceVariant : fg + '1F';
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Invite status → tone. Unknown values read as neutral ("not live"). */
export function statusTone(status: string): PillTone {
  switch (status) {
    case 'PENDING': return 'warn';
    case 'ACCEPTED': return 'good';
    case 'DECLINED':
    case 'CANCELLED':
    case 'EXPIRED': return 'neutral';
    default: return 'neutral';
  }
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 3 },
  text: { fontSize: 11.5, fontWeight: '600' },
});
