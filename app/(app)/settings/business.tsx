import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { settingsApi, GstRegistrationType, GST_REGISTRATION_TYPES } from '../../../src/api/settings.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { Card, ChipRow, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';


export default function BusinessSettingsScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const canEdit = can('SETTINGS', 'FULL');
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: qk.businessSettings(), queryFn: settingsApi.business.get });

  /**
   * The LABELS are translated; the KEYS are not, and must not be.
   * `registrationType` is posted back verbatim and stored as the enum
   * `partner-business-settings.model.ts` validates against — a Hindi value here
   * would be rejected, or silently coerced to UNREGISTERED.
   */
  const regOptions = useMemo(
    () => GST_REGISTRATION_TYPES.map((k) => ({ key: k, label: t(`settings.business.reg.${k}`) })),
    [t],
  );

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
      Alert.alert(t('settings.business.savedTitle'), t('settings.business.savedBody'));
    },
    onError: (err) => Alert.alert(t('settings.business.couldNotSave'), apiErrorMessage(err)),
  });

  const onSave = () => {
    const next: Record<string, string> = {};
    if (!businessName.trim()) next.businessName = t('settings.business.needName');
    if (isGstRegistered && !gstin.trim()) next.gstin = t('settings.business.needGstin');
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate();
  };

  if (query.isPending) return <Screen c={c} title={t('settings.business.title')}><Loading c={c} /></Screen>;
  if (query.isError) {
    return <Screen c={c} title={t('settings.business.title')}><ErrorBlock c={c} message={apiErrorMessage(query.error, t('settings.business.couldNotLoad'))} onRetry={() => query.refetch()} /></Screen>;
  }

  return (
    <Screen c={c} title={t('settings.business.title')}>
      <Card c={c}>
        <SectionLabel c={c}>{t('settings.business.section')}</SectionLabel>
        <AppInput label={t('settings.business.name')} value={businessName} onChangeText={setBusinessName} disabled={!canEdit} error={errors.businessName} />
        <AppInput label={t('settings.business.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" disabled={!canEdit} />
        <AppInput label={t('settings.business.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" disabled={!canEdit} />
      </Card>

      <Card c={c}>
        <SectionLabel c={c}>{t('settings.business.addressSection')}</SectionLabel>
        {/*
          These three boxes are the trap on this screen.

          They write `PartnerBusinessSettings` — the invoicing identity, the
          address printed on a bill — and NOT the `Partner` document, whose own
          city/state/pincode are what resident discovery and the onboarding
          checklist read. The two screens show the same three labels, so a
          partner told "add your city" filled these in, got a success toast and
          watched the checklist not move. Naming the other screen is the cheapest
          fix that is actually true.
        */}
        <Text style={{ color: c.textSecondary, marginBottom: 6, fontSize: 12.5, lineHeight: 18 }}>
          {t('settings.business.addressNote')}
        </Text>
        <AppInput label={t('settings.business.billingAddress')} value={billingAddress} onChangeText={setBillingAddress} multiline disabled={!canEdit} />
        <View style={styles.row}>
          <AppInput label={t('settings.business.city')} value={city} onChangeText={setCity} style={styles.half} disabled={!canEdit} />
          <AppInput label={t('settings.business.state')} value={state} onChangeText={setState} style={styles.half} disabled={!canEdit} />
        </View>
        <AppInput label={t('settings.business.pincode')} value={pincode} onChangeText={setPincode} keyboardType="numeric" disabled={!canEdit} />
      </Card>

      <Card c={c}>
        <SectionLabel c={c}>{t('settings.business.gstSection')}</SectionLabel>
        <View style={styles.switchRow}>
          <Text style={{ color: c.textPrimary, fontSize: 14, fontWeight: '600' }}>{t('settings.business.gstRegistered')}</Text>
          <Switch value={isGstRegistered} onValueChange={setIsGstRegistered} color={c.primary} disabled={!canEdit} />
        </View>
        {isGstRegistered && (
          <>
            <AppInput label={t('settings.business.gstin')} value={gstin} onChangeText={(v) => setGstin(v.toUpperCase())} autoCapitalize="characters" disabled={!canEdit} error={errors.gstin} />
            <Text style={[styles.label, { color: c.textSecondary }]}>{t('settings.business.registrationType')}</Text>
            <ChipRow c={c} value={registrationType} options={regOptions} onChange={setRegistrationType} />
          </>
        )}
      </Card>

      {canEdit && (
        <AppButton label={t('settings.business.save')} onPress={onSave} loading={save.isPending} disabled={save.isPending} style={{ marginTop: 8 }} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 4 },
});
