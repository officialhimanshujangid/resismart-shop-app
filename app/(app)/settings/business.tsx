import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { settingsApi, GstRegistrationType, GST_REGISTRATION_TYPES } from '../../../src/api/settings.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { ChipRow, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';

const REG_LABEL: Record<GstRegistrationType, string> = {
  REGULAR: 'Regular', COMPOSITION: 'Composition', UNREGISTERED: 'Unregistered', SEZ: 'SEZ', EXPORT: 'Export',
};
const REG_OPTIONS = GST_REGISTRATION_TYPES.map((k) => ({ key: k, label: REG_LABEL[k] }));

export default function BusinessSettingsScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const canEdit = can('SETTINGS', 'FULL');
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: qk.businessSettings(), queryFn: settingsApi.business.get });

  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [isGstRegistered, setIsGstRegistered] = useState(false);
  const [gstin, setGstin] = useState('');
  const [registrationType, setRegistrationType] = useState<GstRegistrationType>('UNREGISTERED');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const s = query.data;
    if (!s) return;
    setBusinessName(s.businessName);
    setPhone(s.phone ?? '');
    setEmail(s.email ?? '');
    setBillingAddress(s.billingAddress ?? '');
    setCity(s.city ?? '');
    setState(s.state ?? '');
    setPincode(s.pincode ?? '');
    setIsGstRegistered(s.isGstRegistered);
    setGstin(s.gstin ?? '');
    setRegistrationType(s.registrationType);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => settingsApi.business.update({
      businessName: businessName.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      billingAddress: billingAddress.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      pincode: pincode.trim() || undefined,
      isGstRegistered,
      gstin: isGstRegistered ? (gstin.trim() || undefined) : null,
      registrationType: isGstRegistered ? registrationType : 'UNREGISTERED',
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.businessSettings() });
      Alert.alert('Saved', 'Your business details are updated.');
    },
    onError: (err) => Alert.alert('Could not save', apiErrorMessage(err)),
  });

  const onSave = () => {
    const next: Record<string, string> = {};
    if (!businessName.trim()) next.businessName = 'A business needs a name for its bills.';
    if (isGstRegistered && !gstin.trim()) next.gstin = 'A GST-registered business needs its GSTIN.';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate();
  };

  if (query.isPending) return <Screen c={c} title="Business details"><Loading c={c} /></Screen>;
  if (query.isError) {
    return <Screen c={c} title="Business details"><ErrorBlock c={c} message={apiErrorMessage(query.error, 'Could not load your business details.')} onRetry={() => query.refetch()} /></Screen>;
  }

  return (
    <Screen c={c} title="Business details">
      <AppInput label="Business / legal name" value={businessName} onChangeText={setBusinessName} disabled={!canEdit} error={errors.businessName} />
      <AppInput label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" disabled={!canEdit} />
      <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" disabled={!canEdit} />
      <AppInput label="Billing address" value={billingAddress} onChangeText={setBillingAddress} multiline disabled={!canEdit} />
      <View style={styles.row}>
        <AppInput label="City" value={city} onChangeText={setCity} style={styles.half} disabled={!canEdit} />
        <AppInput label="State" value={state} onChangeText={setState} style={styles.half} disabled={!canEdit} />
      </View>
      <AppInput label="Pincode" value={pincode} onChangeText={setPincode} keyboardType="numeric" disabled={!canEdit} />

      <SectionLabel c={c}>GST</SectionLabel>
      <View style={styles.switchRow}>
        <Text style={{ color: c.textPrimary, fontSize: 14 }}>Registered under GST</Text>
        <Switch value={isGstRegistered} onValueChange={setIsGstRegistered} color={c.primary} disabled={!canEdit} />
      </View>
      {isGstRegistered && (
        <>
          <AppInput label="GSTIN" value={gstin} onChangeText={(v) => setGstin(v.toUpperCase())} autoCapitalize="characters" disabled={!canEdit} error={errors.gstin} />
          <Text style={[styles.label, { color: c.textSecondary }]}>Registration type</Text>
          <ChipRow c={c} value={registrationType} options={REG_OPTIONS} onChange={setRegistrationType} />
        </>
      )}

      {canEdit && (
        <AppButton label="Save changes" onPress={onSave} loading={save.isPending} disabled={save.isPending} style={{ marginTop: 8 }} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 4 },
});
