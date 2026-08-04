import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { settingsApi, InvoiceTheme, INVOICE_THEMES } from '../../../src/api/settings.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { ChipRow, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';

const THEME_LABEL: Record<InvoiceTheme, string> = {
  CLASSIC: 'Classic', MODERN: 'Modern', MINIMAL: 'Minimal', GST_DETAILED: 'GST Detailed',
  THERMAL_58: 'Thermal 58mm', THERMAL_80: 'Thermal 80mm',
};
const THEME_OPTIONS = INVOICE_THEMES.map((k) => ({ key: k, label: THEME_LABEL[k] }));
const WIDTH_OPTIONS: { key: '58' | '80'; label: string }[] = [{ key: '58', label: '58 mm' }, { key: '80', label: '80 mm' }];

/**
 * Numbering (`template`/`padding`/`prefixBySeries`) is deliberately not
 * editable here. A wrong numbering template is refused only by a `pre(
 * 'validate')` hook that reads `{SEQ}`/unknown-token errors back as raw
 * Mongoose messages — building a phone-safe editor for nine series prefixes
 * plus a token-picker is real screen work for a knob a shop owner sets once
 * at setup and rarely touches again. Kept on the web settings screen.
 */
export default function InvoiceSettingsScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const canEdit = can('SETTINGS', 'FULL');
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: qk.billing.settings(), queryFn: settingsApi.invoice.get });

  const [theme, setTheme] = useState<InvoiceTheme>('CLASSIC');
  const [accentColor, setAccentColor] = useState('#1F6FEB');
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [bankName, setBankName] = useState('');
  const [acNo, setAcNo] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upiId, setUpiId] = useState('');
  const [showHsn, setShowHsn] = useState(true);
  const [showDiscount, setShowDiscount] = useState(true);
  const [showTaxBreakup, setShowTaxBreakup] = useState(true);
  const [showUpiQr, setShowUpiQr] = useState(true);
  const [showSignature, setShowSignature] = useState(true);
  const [thermalWidth, setThermalWidth] = useState<'58' | '80'>('80');
  const [thermalCopies, setThermalCopies] = useState('1');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const s = query.data;
    if (!s) return;
    setTheme(s.theme);
    setAccentColor(s.accentColor);
    setTerms(s.terms ?? '');
    setNotes(s.notes ?? '');
    setBankName(s.bankDetails.name ?? '');
    setAcNo(s.bankDetails.acNo ?? '');
    setIfsc(s.bankDetails.ifsc ?? '');
    setUpiId(s.bankDetails.upiId ?? '');
    setShowHsn(s.showHsn);
    setShowDiscount(s.showDiscount);
    setShowTaxBreakup(s.showTaxBreakup);
    setShowUpiQr(s.showUpiQr);
    setShowSignature(s.showSignature);
    setThermalWidth(String(s.thermal.width) as '58' | '80');
    setThermalCopies(String(s.thermal.copies));
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => settingsApi.invoice.update({
      theme,
      accentColor,
      terms: terms.trim() || null,
      notes: notes.trim() || null,
      bankDetails: {
        name: bankName.trim() || undefined,
        acNo: acNo.trim() || undefined,
        ifsc: ifsc.trim() || undefined,
        upiId: upiId.trim() || undefined,
      },
      showHsn, showDiscount, showTaxBreakup, showUpiQr, showSignature,
      thermal: { width: Number(thermalWidth) as 58 | 80, copies: Math.min(5, Math.max(1, Number(thermalCopies) || 1)) },
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.billing.settings() });
      Alert.alert('Saved', 'Your invoice settings are updated.');
    },
    onError: (err) => Alert.alert('Could not save', apiErrorMessage(err)),
  });

  const onSave = () => {
    const next: Record<string, string> = {};
    if (!/^#[0-9a-fA-F]{6}$/.test(accentColor.trim())) next.accentColor = 'Use a #RRGGBB hex colour, e.g. #1F6FEB.';
    if (upiId.trim() && !/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(upiId.trim())) next.upiId = 'That does not look like a UPI ID (name@bank).';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate();
  };

  if (query.isPending) return <Screen c={c} title="Invoice settings"><Loading c={c} /></Screen>;
  if (query.isError) {
    return <Screen c={c} title="Invoice settings"><ErrorBlock c={c} message={apiErrorMessage(query.error, 'Could not load your invoice settings.')} onRetry={() => query.refetch()} /></Screen>;
  }

  return (
    <Screen c={c} title="Invoice settings">
      <SectionLabel c={c}>Look</SectionLabel>
      <ChipRow c={c} value={theme} options={THEME_OPTIONS} onChange={setTheme} />
      <AppInput label="Accent colour (#RRGGBB)" value={accentColor} onChangeText={setAccentColor} autoCapitalize="none" disabled={!canEdit} error={errors.accentColor} />

      <SectionLabel c={c}>What prints</SectionLabel>
      <ToggleRow c={c} label="HSN code" value={showHsn} onChange={setShowHsn} disabled={!canEdit} />
      <ToggleRow c={c} label="Discount column" value={showDiscount} onChange={setShowDiscount} disabled={!canEdit} />
      <ToggleRow c={c} label="Tax breakup (CGST/SGST/IGST)" value={showTaxBreakup} onChange={setShowTaxBreakup} disabled={!canEdit} />
      <ToggleRow c={c} label="UPI QR code" value={showUpiQr} onChange={setShowUpiQr} disabled={!canEdit} />
      <ToggleRow c={c} label="Signature" value={showSignature} onChange={setShowSignature} disabled={!canEdit} />

      <SectionLabel c={c}>Bank details</SectionLabel>
      <AppInput label="Account name" value={bankName} onChangeText={setBankName} disabled={!canEdit} />
      <AppInput label="Account number" value={acNo} onChangeText={setAcNo} disabled={!canEdit} />
      <AppInput label="IFSC" value={ifsc} onChangeText={(v) => setIfsc(v.toUpperCase())} autoCapitalize="characters" disabled={!canEdit} />
      <AppInput label="UPI ID (for the QR code)" value={upiId} onChangeText={setUpiId} autoCapitalize="none" disabled={!canEdit} error={errors.upiId} />

      <SectionLabel c={c}>Counter printer</SectionLabel>
      <ChipRow c={c} value={thermalWidth} options={WIDTH_OPTIONS} onChange={setThermalWidth} />
      <AppInput label="Copies per bill (1–5)" value={thermalCopies} onChangeText={setThermalCopies} keyboardType="numeric" disabled={!canEdit} />

      <SectionLabel c={c}>On every document</SectionLabel>
      <AppInput label="Terms" value={terms} onChangeText={setTerms} multiline disabled={!canEdit} />
      <AppInput label="Notes" value={notes} onChangeText={setNotes} multiline disabled={!canEdit} />

      {canEdit && (
        <AppButton label="Save changes" onPress={onSave} loading={save.isPending} disabled={save.isPending} style={{ marginTop: 8 }} />
      )}
    </Screen>
  );
}

function ToggleRow({ c, label, value, onChange, disabled }: { c: ReturnType<typeof themeColors>; label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.switchRow}>
      <Text style={{ color: c.textPrimary, fontSize: 14 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
});
