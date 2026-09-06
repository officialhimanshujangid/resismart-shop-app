import React from 'react';
import { StyleSheet, View, TouchableOpacity, useColorScheme } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { themeColors, radii } from '../constants/colors';

/**
 * "Which of your businesses?" — drawn in two places, and deliberately one
 * component.
 *
 *   - `(auth)/login.tsx`, to finish a sign-in that resolved several contexts.
 *   - `(tabs)/more.tsx`, as the "Switch business" menu of a LIVE session.
 *
 * The second one is new. `AuthContext.availableContexts` had carried the comment
 * "for a 'switch shop' menu" since it was written and no screen had ever read
 * it, so signing out and back in was the only way a partner with two businesses
 * could reach the other one. Reusing this picker rather than writing a second
 * one is the point: two lists of the same thing are two places for the row to
 * disagree about what a business looks like.
 */

interface ProfileInfo {
  tenantType: 'SOCIETY' | 'PARTNER' | 'SYSTEM' | string;
  tenantId: string;
  role: string;
  /**
   * The business's own name, when the caller has it.
   *
   * Optional because this component predates `ResolvedContext.tenantName` and
   * `login.tsx` passes `ProfileInfo` objects whose shape it does not control.
   * When it is absent the raw id is still shown — that is the old behaviour, and
   * it is a poor row, which is exactly why the name is preferred: "ID:
   * 68f3a1…" is not something a shopkeeper can pick their own shop out of.
   */
  tenantName?: string;
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
  PARTNER_ADMIN: 'Owner',
  PARTNER_OWNER: 'Owner',
  PARTNER_STAFF: 'Staff',
};

export function ContextPicker({ profiles, onSelect }: ContextPickerProps) {
  /**
   * Read at RENDER, not frozen into a module-level StyleSheet.
   *
   * This file used to take every colour from the light-only `Colors` map, which
   * made the picker a white card in a dark-mode app — the same bug `login.tsx`'s
   * own header describes it having fixed for the rest of that screen while
   * leaving this component behind.
   */
  const c = themeColors(useColorScheme() === 'dark');

  return (
    <View style={styles.container}>
      {profiles.map((profile, index) => (
        <TouchableOpacity
          key={`${profile.tenantId}-${profile.role}-${index}`}
          onPress={() => onSelect(profile)}
          activeOpacity={0.8}
        >
          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={2}>
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
            <View style={[styles.iconBox, { backgroundColor: c.surfaceVariant }]}>
              <MaterialCommunityIcons
                name={profile.tenantType === 'SOCIETY' ? 'city-variant-outline' : 'store-outline'}
                size={28}
                color={c.primary}
              />
            </View>
            <View style={styles.info}>
              <Text style={[styles.type, { color: c.textSecondary }]}>
                {profile.tenantType === 'SOCIETY' ? 'Society' : 'Partner'}
              </Text>
              {/* The NAME leads when there is one — it is what the person
                  recognises. The role drops to the caption beside it, and the
                  raw id is only printed when there is nothing better. */}
              <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
                {profile.tenantName || roleLabels[profile.role] || profile.role}
              </Text>
              <Text style={[styles.id, { color: c.textDisabled }]} numberOfLines={1}>
                {profile.tenantName
                  ? (roleLabels[profile.role] ?? profile.role)
                  : `ID: ${profile.tenantId}`}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={c.textSecondary} />
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
    borderRadius: radii.field,
    padding: 14,
    gap: 14,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: radii.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  type: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  name: { fontSize: 16, fontWeight: '600' },
  id: { fontSize: 11 },
});
