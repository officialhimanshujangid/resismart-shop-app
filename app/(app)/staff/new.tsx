import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { rolesApi, staffApi } from '../../../src/api/staff.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { ChipRow, Screen } from '../../../src/features/more/ui';

const NO_ROLE = '__none__';

/** Invite somebody, or edit their designation/role/booking eligibility when `?id=` is present. */
export default function StaffFormScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(params.id);
  const queryClient = useQueryClient();

  const staffList = useQuery({ queryKey: qk.staffList(), queryFn: staffApi.list, enabled: editing });
  const existing = staffList.data?.find((s) => s._id === params.id);

  const roles = useQuery({ queryKey: qk.staffRoles(), queryFn: rolesApi.list });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [roleId, setRoleId] = useState<string>(NO_ROLE);
  const [canTakeBookings, setCanTakeBookings] = useState(false);
  const [skillsText, setSkillsText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!existing) return;
    setDesignation(existing.designation);
    setRoleId(typeof existing.roleId === 'object' ? existing.roleId._id : (existing.roleId ?? NO_ROLE));
    setCanTakeBookings(existing.canTakeBookings);
    setSkillsText(existing.skills.join(', '));
  }, [existing]);

  const roleOptions = [
    { key: NO_ROLE, label: 'None' },
    ...(roles.data?.roles.filter((r) => r.isActive).map((r) => ({ key: r._id, label: r.name })) ?? []),
  ];

  const skillsArray = () => skillsText.split(',').map((s) => s.trim()).filter(Boolean);

  const inviteMutation = useMutation({
    mutationFn: staffApi.invite,
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: qk.staff() });
      if (res.generatedPassword) {
        Alert.alert(
          'Invited',
          `A login was created for ${name.trim()}. Temporary password: ${res.generatedPassword}\n\nShare it with them directly — it will not be shown again.`,
          [{ text: 'Done', onPress: () => router.back() }],
        );
      } else {
        router.back();
      }
    },
    onError: (err) => Alert.alert('Could not invite them', apiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: () => staffApi.update(params.id as string, {
      designation: designation.trim(),
      roleId: roleId === NO_ROLE ? null : roleId,
      canTakeBookings,
      skills: skillsArray(),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.staff() });
      router.back();
    },
    onError: (err) => Alert.alert('Could not save changes', apiErrorMessage(err)),
  });

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!designation.trim()) next.designation = 'What do they do here?';
    if (!editing) {
      if (!name.trim()) next.name = 'Who are you inviting?';
      if (!email.trim() && !phone.trim()) next.phone = 'Give an email address or a phone number.';
      if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'That does not look like an email address.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = () => {
    if (!validate()) return;
    if (editing) {
      updateMutation.mutate();
      return;
    }
    inviteMutation.mutate({
      name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined,
      designation: designation.trim(), roleId: roleId === NO_ROLE ? undefined : roleId,
      canTakeBookings, skills: skillsArray(),
    });
  };

  const saving = inviteMutation.isPending || updateMutation.isPending;

  return (
    <Screen c={c} title={editing ? 'Edit staff member' : 'Invite staff'}>
      {!editing && (
        <>
          <AppInput label="Name" value={name} onChangeText={setName} error={errors.name} />
          <AppInput label="Phone (they sign in with an OTP)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} />
          <AppInput label="Email (optional if phone is given)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
        </>
      )}

      <AppInput label="Designation" value={designation} onChangeText={setDesignation} placeholder="e.g. Counter staff, Technician" error={errors.designation} />

      <Text style={[styles.label, { color: c.textSecondary }]}>Role</Text>
      {roles.isPending ? (
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>Loading roles…</Text>
      ) : (
        <ChipRow c={c} value={roleId} options={roleOptions} onChange={setRoleId} />
      )}

      <View style={styles.switchRow}>
        <Text style={{ color: c.textPrimary, fontSize: 14 }}>Can be assigned bookings</Text>
        <Switch value={canTakeBookings} onValueChange={setCanTakeBookings} color={c.primary} />
      </View>

      <AppInput
        label="Skills (comma-separated, optional)"
        value={skillsText}
        onChangeText={setSkillsText}
        placeholder="e.g. AC repair, plumbing"
      />

      <AppButton label={editing ? 'Save changes' : 'Send invite'} onPress={onSubmit} loading={saving} disabled={saving} style={{ marginTop: 8 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
});
