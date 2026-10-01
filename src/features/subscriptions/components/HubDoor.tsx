import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ColorScheme, radii } from '../../../constants/colors';

/** A big door on the subscriptions hub (the daily job: deliveries, attendance). */
export function HubDoor({
  c, icon, title, body, onPress, testID,
}: { c: ColorScheme; icon: string; title: string; body: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
      style={({ pressed }) => [styles.door, { backgroundColor: pressed ? c.surfaceVariant : c.surface, borderColor: c.primary }]}
    >
      <View style={[styles.icon, { backgroundColor: c.surfaceVariant }]}>
        <MaterialCommunityIcons name={icon as never} size={28} color={c.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>{title}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={2}>{body}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color={c.textDisabled} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  door: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radii.card, borderWidth: 1.5, padding: 14, minHeight: 72 },
  icon: { width: 48, height: 48, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
});
