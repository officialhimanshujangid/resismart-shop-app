import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import type { SupplierDetails, SupplierDetailsInput } from '../../../api/parties.api';

/**
 * The supplier master on the party form (screen S1): contact, payment terms,
 * lead time, composition, PAN (masked once saved), MSME number, bank, notes.
 * Form state is plain strings; `supplierInputFrom` turns it into the body.
 */
export interface SupplierForm {
  contactPerson: string;
  paymentTermsDays: string;
  leadTimeDays: string;
  isComposition: boolean;
  pan: string;
  msmeUdyamNo: string;
  bankName: string;
  acNoLast4: string;
  ifsc: string;
  upiId: string;
  notes: string;
}

export const EMPTY_SUPPLIER_FORM: SupplierForm = {
  contactPerson: '', paymentTermsDays: '', leadTimeDays: '', isComposition: false, pan: '', msmeUdyamNo: '',
  bankName: '', acNoLast4: '', ifsc: '', upiId: '', notes: '',
};

export function supplierFormFrom(s?: SupplierDetails): SupplierForm {
  if (!s) return EMPTY_SUPPLIER_FORM;
  return {
    contactPerson: s.contactPerson ?? '',
    paymentTermsDays: s.paymentTermsDays !== undefined ? String(s.paymentTermsDays) : '',
    leadTimeDays: s.leadTimeDays !== undefined ? String(s.leadTimeDays) : '',
    isComposition: !!s.isComposition,
    pan: '',
    msmeUdyamNo: s.msmeUdyamNo ?? '',
    bankName: s.bank?.name ?? '',
    acNoLast4: s.bank?.acNoLast4 ?? '',
    ifsc: s.bank?.ifsc ?? '',
    upiId: s.bank?.upiId ?? '',
    notes: s.notes ?? '',
  };
}

export type SupplierFormError = 'paymentTermsDays' | 'leadTimeDays' | 'pan' | 'acNoLast4' | 'ifsc';

/** The body, or the first field that is wrong (same rules as `supplierDetailsSchema`). */
export function supplierInputFrom(f: SupplierForm): { input?: SupplierDetailsInput; error?: SupplierFormError } {
  const int = (s: string, max: number) => {
    if (!s.trim()) return undefined;
    const n = Number(s);
    return Number.isInteger(n) && n >= 0 && n <= max ? n : NaN;
  };
  const terms = int(f.paymentTermsDays, 365);
  if (Number.isNaN(terms)) return { error: 'paymentTermsDays' };
  const lead = int(f.leadTimeDays, 180);
  if (Number.isNaN(lead)) return { error: 'leadTimeDays' };
  const pan = f.pan.trim().toUpperCase();
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return { error: 'pan' };
  const last4 = f.acNoLast4.trim();
  if (last4 && !/^\d{4}$/.test(last4)) return { error: 'acNoLast4' };
  const ifsc = f.ifsc.trim().toUpperCase();
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return { error: 'ifsc' };
  const bank = {
    ...(f.bankName.trim() ? { name: f.bankName.trim() } : {}),
    ...(last4 ? { acNoLast4: last4 } : {}),
    ...(ifsc ? { ifsc } : {}),
    ...(f.upiId.trim() ? { upiId: f.upiId.trim() } : {}),
  };
  return {
    input: {
      ...(f.contactPerson.trim() ? { contactPerson: f.contactPerson.trim() } : {}),
      ...(terms !== undefined ? { paymentTermsDays: terms } : {}),
      ...(lead !== undefined ? { leadTimeDays: lead } : {}),
      isComposition: f.isComposition,
      ...(pan ? { pan } : {}),
      ...(f.msmeUdyamNo.trim() ? { msmeUdyamNo: f.msmeUdyamNo.trim() } : {}),
      ...(Object.keys(bank).length ? { bank } : {}),
      ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
    },
  };
}

export function SupplierFields({
  c, value, onChange, panMasked, errors,
}: {
  c: ColorScheme;
  value: SupplierForm;
  onChange: (next: SupplierForm) => void;
  panMasked?: string;
  errors: Partial<Record<SupplierFormError, string>>;
}) {
  const { t } = useTranslation();
  const set = (p: Partial<SupplierForm>) => onChange({ ...value, ...p });
  return (
    <View style={{ gap: 2 }}>
      <Text style={[styles.label, { color: c.textSecondary }]}>{t('parties.supplier.section')}</Text>
      <AppInput label={t('parties.supplier.contactPerson')} value={value.contactPerson} onChangeText={(v) => set({ contactPerson: v.slice(0, 80) })} />
      <View style={styles.row2}>
        <AppInput label={t('parties.supplier.terms')} value={value.paymentTermsDays} onChangeText={(v) => set({ paymentTermsDays: v })} keyboardType="numeric" error={errors.paymentTermsDays} style={styles.half} />
        <AppInput label={t('parties.supplier.leadTime')} value={value.leadTimeDays} onChangeText={(v) => set({ leadTimeDays: v })} keyboardType="numeric" error={errors.leadTimeDays} style={styles.half} />
      </View>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.textPrimary, fontSize: 14 }}>{t('parties.supplier.composition')}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('parties.supplier.compositionHint')}</Text>
        </View>
        <Switch value={value.isComposition} onValueChange={(v) => set({ isComposition: v })} accessibilityLabel={t('parties.supplier.composition')} />
      </View>
      <AppInput
        label={panMasked ? t('parties.supplier.panReplace', { masked: panMasked }) : t('parties.supplier.pan')}
        value={value.pan}
        onChangeText={(v) => set({ pan: v.toUpperCase().slice(0, 10) })}
        autoCapitalize="characters"
        error={errors.pan}
      />
      <AppInput label={t('parties.supplier.msme')} value={value.msmeUdyamNo} onChangeText={(v) => set({ msmeUdyamNo: v.slice(0, 30) })} autoCapitalize="characters" />
      <AppInput label={t('parties.supplier.bankName')} value={value.bankName} onChangeText={(v) => set({ bankName: v.slice(0, 120) })} />
      <View style={styles.row2}>
        <AppInput label={t('parties.supplier.acLast4')} value={value.acNoLast4} onChangeText={(v) => set({ acNoLast4: v.replace(/\D/g, '').slice(0, 4) })} keyboardType="numeric" error={errors.acNoLast4} style={styles.half} />
        <AppInput label={t('parties.supplier.ifsc')} value={value.ifsc} onChangeText={(v) => set({ ifsc: v.toUpperCase().slice(0, 11) })} autoCapitalize="characters" error={errors.ifsc} style={styles.half} />
      </View>
      <AppInput label={t('parties.supplier.upi')} value={value.upiId} onChangeText={(v) => set({ upiId: v.slice(0, 80) })} autoCapitalize="none" />
      <AppInput label={t('parties.supplier.notes')} value={value.notes} onChangeText={(v) => set({ notes: v.slice(0, 500) })} multiline />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', marginTop: 8 },
  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  half: { flexGrow: 1, flexBasis: 140 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
});
