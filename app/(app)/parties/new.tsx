import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePlanUsage } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { partiesApi, PartyKind } from '../../../src/api/parties.api';
import { parseRupeesToPaise, paiseToInput } from '../../../src/lib/money';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import {
  EMPTY_SUPPLIER_FORM, SupplierFields, SupplierForm, SupplierFormError, supplierFormFrom, supplierInputFrom,
} from '../../../src/features/purchases/components/SupplierFields';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { ChipRow, Screen } from '../../../src/features/more/ui';

/**
 * `key` is the WIRE value — `kind` on `POST /parties`, and what the server's
 * `kindsForSide()` filter is written against — so it stays an English literal.
 * Only `labelKey` is display.
 */
const KIND_OPTIONS: { key: PartyKind; labelKey: string }[] = [
  { key: 'CUSTOMER', labelKey: 'parties.form.kindCustomer' },
  { key: 'SUPPLIER', labelKey: 'parties.form.kindSupplier' },
  { key: 'BOTH', labelKey: 'parties.form.kindBoth' },
];

/** Create a party, or edit one when `?id=` is present — same form either way. */
export default function PartyFormScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { t } = useTranslation();
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
  // P1 supplier master (screen S1) — shown for SUPPLIER and BOTH.
  const [supplier, setSupplier] = useState<SupplierForm>(EMPTY_SUPPLIER_FORM);
  const [supplierErrors, setSupplierErrors] = useState<Partial<Record<SupplierFormError, string>>>({});
  const [tags, setTags] = useState('');
  const isSupplierSide = kind === 'SUPPLIER' || kind === 'BOTH';

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
    setSupplier(supplierFormFrom(p.supplier));
    setTags((p.tags ?? []).join(', '));
  }, [existing.data]);

  /**
   * 409 PARTY_GSTIN_ALREADY_USED (§7.1): another party of this shop has the
   * same GSTIN — two branches of one business are legitimate, so the partner
   * is asked once and the same save is repeated with `confirmDuplicateGstin`.
   */
  const onSaveError = (fallbackKey: string, retry: () => void) => (err: unknown) => {
    if (apiErrorCode(err) === 'PARTY_GSTIN_ALREADY_USED') {
      Alert.alert(t('parties.form.duplicateGstinTitle'), apiErrorMessage(err), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('parties.form.duplicateGstinConfirm'), onPress: retry },
      ]);
      return;
    }
    Alert.alert(t(fallbackKey), apiErrorMessage(err));
  };

  const p1Fields = (): { supplier?: ReturnType<typeof supplierInputFrom>['input'] | null; tags?: string[] } | null => {
    const tagList = tags.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10).map((x) => x.slice(0, 30));
    if (!isSupplierSide) return { tags: tagList, ...(editing && existing.data?.supplier ? { supplier: null } : {}) };
    const res = supplierInputFrom(supplier);
    if (res.error) {
      setSupplierErrors({ [res.error]: t(`parties.supplier.error.${res.error}`) });
      return null;
    }
    setSupplierErrors({});
    return { supplier: res.input, tags: tagList };
  };

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof partiesApi.create>[0]) => partiesApi.create(payload),
    onSuccess: (party) => {
      void queryClient.invalidateQueries({ queryKey: qk.parties.all() });
      void queryClient.invalidateQueries({ queryKey: qk.usage() });
      router.replace({ pathname: '/parties/[id]', params: { id: party._id } });
    },
    // Return type written out: the handler re-sends through this same mutation,
    // and an inferred type would be circular.
    onError: (err: unknown, payload: Parameters<typeof partiesApi.create>[0]): void => {
      onSaveError('parties.form.addFailed', () => createMutation.mutate({
        ...payload, checkDuplicateGstin: undefined, confirmDuplicateGstin: true,
      }))(err);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (extra: { confirmDuplicateGstin?: boolean; p1: NonNullable<ReturnType<typeof p1Fields>> }) => partiesApi.update(params.id as string, {
      ...extra.p1,
      // First save opts in to the duplicate-GSTIN check; the confirm retries.
      ...(extra.confirmDuplicateGstin ? { confirmDuplicateGstin: true } : { checkDuplicateGstin: true }),
      kind, name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined,
      gstin: gstin.trim() || undefined,
      billingAddress: line1.trim() ? { line1: line1.trim(), city: city.trim() || undefined, state: state.trim() || undefined, pincode: pincode.trim() || undefined } : undefined,
    }),
    onSuccess: (party) => {
      void queryClient.invalidateQueries({ queryKey: qk.parties.all() });
      void queryClient.invalidateQueries({ queryKey: qk.parties.detail(party._id) });
      router.back();
    },
    onError: (err: unknown, extra: { confirmDuplicateGstin?: boolean; p1: NonNullable<ReturnType<typeof p1Fields>> }): void => {
      onSaveError('parties.form.saveFailed', () => updateMutation.mutate({ ...extra, confirmDuplicateGstin: true }))(err);
    },
  });

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t('parties.form.nameRequired');
    if (isWalkIn && !phone.trim() && !editing) next.phone = t('parties.form.phoneRequired');
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) next.email = t('parties.form.emailInvalid');
    if (!editing) {
      const paise = parseRupeesToPaise(openingBalance || '0');
      if (paise === null) next.openingBalance = t('parties.form.amountInvalid');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = () => {
    if (!validate()) return;
    const p1 = p1Fields();
    if (!p1) return;
    if (editing) {
      updateMutation.mutate({ p1 });
      return;
    }
    const paise = parseRupeesToPaise(openingBalance || '0') ?? 0;
    createMutation.mutate({
      kind, name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined,
      gstin: gstin.trim() || undefined, isWalkIn,
      // Opt in to the duplicate-GSTIN check; the 409 confirm retries with `confirmDuplicateGstin`.
      checkDuplicateGstin: true,
      openingBalancePaise: paise,
      ...(p1.supplier ? { supplier: p1.supplier } : {}),
      ...(p1.tags?.length ? { tags: p1.tags } : {}),
      billingAddress: line1.trim() ? { line1: line1.trim(), city: city.trim() || undefined, state: state.trim() || undefined, pincode: pincode.trim() || undefined } : undefined,
    });
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Screen c={c} rise title={t(editing ? 'parties.form.editTitle' : 'parties.form.addTitle')}>
      {!editing && cap.atLimit && (
        <View style={[styles.limitBanner, { backgroundColor: c.surfaceVariant }]}>
          <Text style={{ color: c.error, fontWeight: '600' }}>
            {/* `noun` is the SERVER's word ("customers") and arrives in English
                — the same trade `UsageMeter.tsx` documents. The sentence around
                it is translated; the noun follows when the backend catalogue
                does. */}
            {t('parties.form.limitTitle', { limit: cap.limit, noun: cap.noun })}
          </Text>
          {/* "you can put them back" is load-bearing. Hiding used to be a
              one-way door — the list filtered to active parties and offered no
              undo anywhere — so this sentence was pushing people through it.
              The Parties list now carries a "Show hidden parties" switch and an
              unhide action on every row. */}
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>
            {t('parties.form.limitBody')}
          </Text>
        </View>
      )}

      <Text style={[styles.label, { color: c.textSecondary }]}>{t('parties.form.kindLabel')}</Text>
      <ChipRow c={c} value={kind} options={KIND_OPTIONS.map((o) => ({ key: o.key, label: t(o.labelKey) }))} onChange={setKind} />

      <AppInput label={t('parties.form.name')} value={name} onChangeText={setName} error={errors.name} />
      <AppInput label={t('parties.form.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} />
      <AppInput label={t('parties.form.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
      <AppInput label={t('parties.form.gstin')} value={gstin} onChangeText={(v) => setGstin(v.toUpperCase())} autoCapitalize="characters" />

      {!editing && (
        <>
          <View style={styles.switchRow}>
            <Text style={{ color: c.textPrimary, fontSize: 14, flexShrink: 1 }}>{t('parties.form.walkIn')}</Text>
            <Switch value={isWalkIn} onValueChange={setIsWalkIn} color={c.primary} />
          </View>
          <AppInput
            label={t('parties.form.openingBalance')}
            value={openingBalance}
            onChangeText={setOpeningBalance}
            keyboardType="numeric"
            error={errors.openingBalance}
          />
        </>
      )}

      <Text style={[styles.label, { color: c.textSecondary }]}>{t('parties.form.billingAddress')}</Text>
      <AppInput label={t('parties.form.addressLine')} value={line1} onChangeText={setLine1} />
      <AppInput label={t('parties.form.city')} value={city} onChangeText={setCity} />
      {/* The party's POSTAL state, free text on their address — NOT
          `placeOfSupply`. Only the label is translated; whatever is typed is
          stored verbatim. The tax-deciding state list is `GST_STATES`, which
          `features/billing/types.ts:186-204` explains must never be translated. */}
      <AppInput label={t('parties.form.state')} value={state} onChangeText={setState} />
      <AppInput label={t('parties.form.pincode')} value={pincode} onChangeText={setPincode} keyboardType="numeric" />

      {isSupplierSide && (
        <SupplierFields
          c={c}
          value={supplier}
          onChange={setSupplier}
          panMasked={existing.data?.supplier?.panMasked}
          errors={supplierErrors}
        />
      )}
      <AppInput label={t('parties.form.tags')} value={tags} onChangeText={setTags} placeholder={t('parties.form.tagsHint')} />

      <AppButton
        label={t(editing ? 'parties.form.saveChanges' : 'parties.form.addTitle')}
        onPress={onSubmit}
        loading={saving}
        disabled={saving || (!editing && cap.atLimit)}
        style={{ marginTop: 8 }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  limitBanner: { borderRadius: radii.card, padding: 14, gap: 4, marginBottom: 4 },
});
