import React from 'react';
import { useColorScheme } from 'react-native';
import { Redirect, Stack } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { useAuth } from '../../../src/context/AuthContext';
import { isOwnerSession } from '../../../src/features/owners/access';

/**
 * Team → Owners is for OWNERS only (CONTRACT-partner-P0 §2.2 / §6.1): the token
 * role must be PARTNER_ADMIN. No staff role reaches it — not even STAFF or
 * SETTINGS at FULL — so this gate is the role, not a permission row. An admin
 * token whose login is not an owner is still refused by the server
 * (PARTNER_OWNER_ONLY), and the screen says so.
 */
export default function OwnersLayout() {
  const c = themeColors(useColorScheme() === 'dark');
  const { profile } = useAuth();
  if (!isOwnerSession(profile)) return <Redirect href="/(app)/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
