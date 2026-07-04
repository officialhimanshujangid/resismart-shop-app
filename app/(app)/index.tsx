import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Surface, Avatar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { Colors } from '../../src/constants/colors';

export default function DashboardScreen() {
  const { user, profile, logout } = useAuth();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back 👋</Text>
          <Text style={styles.userName}>{user?.name ?? 'Shop Member'}</Text>
        </View>
        <TouchableOpacity onPress={logout} activeOpacity={0.8} style={styles.logoutBtn}>
          <MaterialCommunityIcons name="logout" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <Surface style={styles.profileCard} elevation={2}>
        <Avatar.Icon
          size={52}
          icon="store-outline"
          style={{ backgroundColor: Colors.surfaceVariant }}
          color={Colors.primary}
        />
        <View style={styles.profileInfo}>
          <Text style={styles.profileLabel}>Active Profile</Text>
          <Text style={styles.profileRole}>{profile?.role ?? 'N/A'}</Text>
          <Text style={styles.profileTenant} numberOfLines={1}>
            {profile?.tenantType === 'SHOP' ? 'Shop' : 'Society'} · {profile?.tenantId ?? '—'}
          </Text>
        </View>
      </Surface>

      <View style={styles.tilesGrid}>
        {['Inventory', 'Orders', 'Payments', 'Customers', 'Reports', 'Settings'].map((name) => (
          <Surface key={name} style={styles.tile} elevation={1}>
            <MaterialCommunityIcons name="view-grid-outline" size={28} color={Colors.primary} />
            <Text style={styles.tileLabel}>{name}</Text>
            <Text style={styles.tileSub}>Coming soon</Text>
          </Surface>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 16, paddingBottom: 20,
  },
  greeting: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  userName: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  logoutBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: Colors.surfaceVariant, alignItems: 'center', justifyContent: 'center',
  },
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 18, padding: 16, marginBottom: 24, gap: 14,
  },
  profileInfo: { flex: 1, gap: 2 },
  profileLabel: { fontSize: 11, color: Colors.textDisabled, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' },
  profileRole: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  profileTenant: { fontSize: 12, color: Colors.textSecondary },
  tilesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47%', backgroundColor: Colors.surface, borderRadius: 16,
    padding: 18, alignItems: 'flex-start', gap: 8,
  },
  tileLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  tileSub: { fontSize: 11, color: Colors.textDisabled },
});
