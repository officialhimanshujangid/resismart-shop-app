import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePlanUsage } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { partiesApi, PartyKind } from '../../../src/api/parties.api';
import { parseRupeesToPaise, paiseToInput } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { ChipRow, Screen } from '../../../src/features/more/ui';

const KIND_OPTIONS: { key: PartyKind; label: string }[] = [
  { key: 'CUSTOMER', label: 'Customer' },
  { key: 'SUPPLIER', label: 'Supplier' },
  { key: 'BOTH', label: 'Both' },
];

/** Create a party, or edit one when `?id=` is present — same form either way. */
export default function PartyFormScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const params = useLocalSearchParams<{ id?: string; kind?: PartyKind }>();
  const editing = Boolean(params.id);
  const queryClient = useQueryClient();
  const { capacity } = usePlanUsage();
  const cap = capacity('max_customers');

  const existing = useQuery({
    queryKey: qk.parties.detail(params.id ?? ''),
    queryFn: () => partiesApi.getOne(params.id as string),
    enabled: editing,
  });

  const [kind, setKind] = useState<PartyKind>(params.kind === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [isWalkIn, setIsWalkIn] = useState(true);
  const [openingBalance, setOpeningBalance] = useState('0');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const p = existing.data;
    if (!p) return;
    setKind(p.kind);
    setName(p.name);
    setPhone(p.phone ?? '');
    setEmail(p.email ?? '');
    setGstin(p.gstin ?? '');
    setIsWalkIn(p.isWalkIn);
    setOpeningBalance(paiseToInput(p.openingBalancePaise));
    setLine1(p.billingAddress?.line1 ?? '');
    setCity(p.billingAddress?.city ?? '');
    setState(p.billingAddress?.state ?? '');
    setPincode(p.billingAddress?.pincode ?? '');
  }, [existing.data]);

  const createMutation = useMutation({
    mutationFn: partiesApi.create,
    onSuccess: (party) => {
      void queryClient.invalidateQueries({ queryKey: qk.parties.all() });
      void queryClient.invalidateQueries({ queryKey: qk.usage() });
      router.replace({ pathname: '/parties/[id]', params: { id: party._id } });
    },
    onError: (err) => Alert.alert('Could not add party', apiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: () => partiesApi.update(params.id as string, {
      kind, name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined,
      gstin: gstin.trim() || undefined,
      billingAddress: line1.trim() ? { line1: line1.trim(), city: city.trim() || undefined, state: state.trim() || undefined, pincode: pincode.trim() || undefined } : undefined,
    }),
    onSuccess: (party) => {
      void queryClient.invalidateQueries({ queryKey: qk.parties.all() });
      void queryClient.invalidateQueries({ queryKey: qk.parties.detail(party._id) });
      router.back();
    },
    onError: (err) => Alert.alert('Could not save changes', apiErrorMessage(err)),
  });

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'A party needs a name.';
    if (isWalkIn && !phone.trim() && !editing) next.phone = 'A walk-in needs a phone number to be found again later.';
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'That does not look like an email address.';
    if (!editing) {
      const paise = parseRupeesToPaise(openingBalance || '0');
      if (paise === null) next.openingBalance = 'Enter a valid amount, e.g. 1500.00';
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
    const paise = parseRupeesToPaise(openingBalance || '0') ?? 0;
    createMutation.mutate({
      kind, name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined,
      gstin: gstin.trim() || undefined, isWalkIn,
      openingBalancePaise: paise,
      billingAddress: line1.trim() ? { line1: line1.trim(), city: city.trim() || undefined, state: state.trim() || undefined, pincode: pincode.trim() || undefined } : undefined,
    });
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Screen c={c} title={editing ? 'Edit party' : 'Add party'}>
      {!editing && cap.atLimit && (
        <View style={[styles.limitBanner, { backgroundColor: c.surfaceVariant }]}>
          <Text style={{ color: c.error, fontWeight: '700' }}>
            You have reached your plan's limit of {cap.limit} {cap.noun}.
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>
            Upgrade your plan, or hide a party you no longer trade with, before adding another.
          </Text>
        </View>
      )}

      <Text style={[styles.label, { color: c.textSecondary }]}>Kind</Text>
      <ChipRow c={c} value={kind} options={KIND_OPTIONS} onChange={setKind} />

      <AppInput label="Name" value={name} onChangeText={setName} error={errors.name} />
      <AppInput label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} />
      <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
      <AppInput label="GSTIN (optional)" value={gstin} onChangeText={(v) => setGstin(v.toUpperCase())} autoCapitalize="characters" />

      {!editing && (
        <>
          <View style={styles.switchRow}>
            <Text style={{ color: c.textPrimary, fontSize: 14 }}>Walk-in / entered by hand</Text>
            <Switch value={isWalkIn} onValueChange={setIsWalkIn} color={c.primary} />
          </View>
          <AppInput
            label="Opening balance (₹) — what they already owed you, or you owed them"
            value={openingBalance}
            onChangeText={setOpeningBalance}
            keyboardType="numeric"
            error={errors.openingBalance}
          />
        </>
      )}

      <Text style={[styles.label, { color: c.textSecondary }]}>Billing address (optional)</Text>
      <AppInput label="Address line" value={line1} onChangeText={setLine1} />
      <AppInput label="City" value={city} onChangeText={setCity} />
      <AppInput label="State" value={state} onChangeText={setState} />
      <AppInput label="Pincode" value={pincode} onChangeText={setPincode} keyboardType="numeric" />

      <AppButton
        label={editing ? 'Save changes' : 'Add party'}
        onPress={onSubmit}
        loading={saving}
        disabled={saving || (!editing && cap.atLimit)}
        style={{ marginTop: 8 }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  limitBanner: { borderRadius: radii.card, padding: 14, gap: 4, marginBottom: 4 },
});
