import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface ProfileInfo {
  tenantType: 'SOCIETY' | 'SHOP' | 'SYSTEM' | string;
  tenantId: string;
  role: string;
}

interface ContextPickerProps {
  profiles: ProfileInfo[];
  onSelect: (profile: ProfileInfo) => void;
}

const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  resident: 'Resident',
  security: 'Security Guard',
  staff: 'Staff',
  owner: 'Owner',
};

export function ContextPicker({ profiles, onSelect }: ContextPickerProps) {
  return (
    <View style={styles.container}>
      {profiles.map((profile, index) => (
        <TouchableOpacity
          key={`${profile.tenantId}-${profile.role}-${index}`}
          onPress={() => onSelect(profile)}
          activeOpacity={0.8}
        >
          <Surface style={styles.card} elevation={2}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons
                name={profile.tenantType === 'society' ? 'city-variant-outline' : 'store-outline'}
                size={28}
                color={Colors.primary}
              />
            </View>
            <View style={styles.info}>
              <Text style={styles.type}>
                {profile.tenantType === 'society' ? 'Society' : 'Shop'}
              </Text>
              <Text style={styles.role}>{roleLabels[profile.role] ?? profile.role}</Text>
              <Text style={styles.id} numberOfLines={1}>
                ID: {profile.tenantId}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.textSecondary} />
          </Surface>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    backgroundColor: Colors.surface,
    gap: 14,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  type: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  role: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  id: { fontSize: 11, color: Colors.textDisabled },
});
