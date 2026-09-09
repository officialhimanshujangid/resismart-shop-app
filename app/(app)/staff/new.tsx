import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { rolesApi, staffApi } from '../../../src/api/staff.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { Card, ChipRow, Screen, SectionLabel } from '../../../src/features/more/ui';

const NO_ROLE = '__none__';

/** Invite somebody, or edit their designation/role/booking eligibility when `?id=` is present. */
export default function StaffFormScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { t } = useTranslation();
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

  /**
   * `NO_ROLE` is this screen's own sentinel (it becomes `null`/`undefined` on
   * the wire) so its KEY never moves; only the word for it is translated. Every
   * other option is a role the partner named — their text, shown back as typed.
   */
  const roleOptions = [
    { key: NO_ROLE, label: t('staff.form.noRole') },
    ...(roles.data?.roles.filter((r) => r.isActive).map((r) => ({ key: r._id, label: r.name })) ?? []),
  ];

  const skillsArray = () => skillsText.split(',').map((s) => s.trim()).filter(Boolean);

  const inviteMutation = useMutation({
    mutationFn: staffApi.invite,
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: qk.staff() });
      if (res.generatedPassword) {
        Alert.alert(
          t('staff.form.invitedTitle'),
          t('staff.form.invitedBody', { name: name.trim(), password: res.generatedPassword }),
          [{ text: t('common.done'), onPress: () => router.back() }],
        );
      } else {
        router.back();
      }
    },
    onError: (err) => Alert.alert(t('staff.form.inviteFailed'), apiErrorMessage(err)),
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
    onError: (err) => Alert.alert(t('staff.form.saveFailed'), apiErrorMessage(err)),
  });

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!designation.trim()) next.designation = t('staff.form.designationRequired');
    if (!editing) {
      if (!name.trim()) next.name = t('staff.form.nameRequired');
      if (!email.trim() && !phone.trim()) next.phone = t('staff.form.contactRequired');
      if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) next.email = t('staff.form.emailInvalid');
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
    <Screen c={c} title={t(editing ? 'staff.form.editTitle' : 'staff.form.addTitle')}>
      {!editing && (
        <Card c={c}>
          <SectionLabel c={c}>{t('staff.form.whoSection')}</SectionLabel>
          <AppInput label={t('staff.form.name')} value={name} onChangeText={setName} error={errors.name} />
          <AppInput label={t('staff.form.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} />
          <AppInput label={t('staff.form.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
        </Card>
      )}

      <Card c={c}>
        <SectionLabel c={c}>{t('staff.form.jobSection')}</SectionLabel>
        <AppInput
          label={t('staff.form.designation')}
          value={designation}
          onChangeText={setDesignation}
          placeholder={t('staff.form.designationPlaceholder')}
          error={errors.designation}
        />

        <Text style={[styles.label, { color: c.textSecondary }]}>{t('staff.form.role')}</Text>
        {roles.isPending ? (
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('staff.form.loadingRoles')}</Text>
        ) : (
          <ChipRow c={c} value={roleId} options={roleOptions} onChange={setRoleId} />
        )}

        <View style={[styles.switchRow, { borderTopColor: c.divider }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: c.textPrimary, fontSize: 14, fontWeight: '600' }}>{t('staff.form.canTakeBookings')}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>{t('staff.form.canTakeBookingsHint')}</Text>
          </View>
          <Switch value={canTakeBookings} onValueChange={setCanTakeBookings} color={c.primary} />
        </View>

        <AppInput
          label={t('staff.form.skills')}
          value={skillsText}
          onChangeText={setSkillsText}
          placeholder={t('staff.form.skillsPlaceholder')}
        />
      </Card>

      <AppButton label={t(editing ? 'staff.form.saveChanges' : 'staff.form.sendInvite')} onPress={onSubmit} loading={saving} disabled={saving} style={{ marginTop: 8 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth,
  },
});
