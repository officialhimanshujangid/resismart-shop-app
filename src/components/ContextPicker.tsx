import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface ProfileInfo {
  tenantType: 'SOCIETY' | 'PARTNER' | 'SYSTEM' | string;
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
            {/*
              `tenantType` arrives from the API upper-cased — 'SOCIETY',
              'PARTNER', 'SYSTEM' — as the type above says. These two tests read
              'society' in lower case, so both were dead: every row, whatever it
              actually was, fell to the else branch and introduced itself as a
              Partner behind a store icon. Nothing caught it because the
              declared type ends in `| string`, which makes any spelling a legal
              comparison, and because the only caller happens to pre-filter to
              partner profiles today — so the wrong answer and the right answer
              currently coincide. They stop coinciding the moment this picker is
              shown a society context.
            */}
            <View style={styles.iconBox}>
              <MaterialCommunityIcons
                name={profile.tenantType === 'SOCIETY' ? 'city-variant-outline' : 'store-outline'}
                size={28}
                color={Colors.primary}
              />
            </View>
            <View style={styles.info}>
              <Text style={styles.type}>
                {profile.tenantType === 'SOCIETY' ? 'Society' : 'Partner'}
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
