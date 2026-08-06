import React from 'react';
import { View, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { PartnerServiceRow, MODE_LABEL, PRICE_TYPE_LABEL } from '../types';
import { themeColors, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';

const durationLabel = (min: number): string => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} hr${h === 1 ? '' : 's'}${m ? ` ${m} min` : ''}`;
};

export function ServiceCard({ service, onPress }: { service: PartnerServiceRow; onPress: () => void }) {
  const c = themeColors(useColorScheme() === 'dark');

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider, opacity: service.isActive ? 1 : 0.6 }]}
    >
      <View style={styles.topRow}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{service.name}</Text>
        {!service.isActive && (
          <View style={[styles.badge, { backgroundColor: c.textDisabled + '22' }]}>
            <Text style={[styles.badgeText, { color: c.textSecondary }]}>Not offered</Text>
          </View>
        )}
      </View>

      {!!service.description && (
        <Text style={[styles.desc, { color: c.textSecondary }]} numberOfLines={1}>{service.description}</Text>
      )}

      <View style={styles.bottomRow}>
        <Text style={[styles.price, { color: c.textPrimary }]}>
          {service.priceType === 'QUOTE'
            ? 'Quoted'
            : `${service.priceType === 'FROM' ? 'from ' : ''}${formatPaise(service.pricePaise)}`}
        </Text>
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="clock-outline" size={13} color={c.textSecondary} />
          <Text style={[styles.metaText, { color: c.textSecondary }]}>{durationLabel(service.durationMin)}</Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        {service.modes.map((m) => (
          <View key={m} style={[styles.chip, { backgroundColor: c.surfaceVariant }]}>
            <Text style={[styles.chipText, { color: c.textSecondary }]}>{MODE_LABEL[m]}</Text>
          </View>
        ))}
        {service.priceType !== 'FIXED' && (
          <View style={[styles.chip, { backgroundColor: c.surfaceVariant }]}>
            <Text style={[styles.chipText, { color: c.textSecondary }]}>{PRICE_TYPE_LABEL[service.priceType]}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 6,
    marginHorizontal: 14,
    marginVertical: 6,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
  desc: { fontSize: 12.5 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  price: { fontSize: 15, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '700' },
});
