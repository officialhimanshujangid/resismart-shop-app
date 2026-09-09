import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Colors, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { settingsApi, InvoiceTheme, INVOICE_THEMES } from '../../../src/api/settings.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { Card, ChipRow, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';

// Paper widths, not words — the same in both languages, so no catalogue entry.
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
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const canEdit = can('SETTINGS', 'FULL');
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: qk.billing.settings(), queryFn: settingsApi.invoice.get });

  // Label only. `theme` is posted verbatim and `partner-document-pdf.service.ts`
  // switches on the enum, so the key never moves.
  const themeOptions = useMemo(
    () => INVOICE_THEMES.map((k) => ({ key: k, label: t(`settings.invoice.theme.${k}`) })),
    [t],
  );

  const [theme, setTheme] = useState<InvoiceTheme>('CLASSIC');
  /**
   * `Colors.primary`, not `themeColors(isDark).primary`, and not a literal.
   *
   * This is not a colour this screen paints — it is the value posted to the
   * server and printed on a PDF, on white paper, whatever scheme the phone is
   * in. So it takes the LIGHT map deliberately; the dark twin (`brand[400]`) is
   * tuned to be read on a dark surface and would print washed out.
   *
   * It was `#1F6FEB`, the retired brand blue. Note that this seed is HYGIENE
   * rather than a fix: the screen renders `Loading` until `query` settles, and
   * `accentColor` is `required` with `default: '#1F6FEB'` on
   * `partner-invoice-settings.model.ts`, so what a brand-new partner actually
   * sees is the SERVER's blue and this initial value is never painted. Changing
   * the colour a new partner's first invoice prints in needs that model default
   * moved to `#0E7C43` in a backend session — flagged, not fixable from here.
   */
  // `<string>` explicitly: `Colors` is `as const`, so the seed's type would
  // otherwise narrow to the literal `'#0E7C43'` and refuse every edit.
  const [accentColor, setAccentColor] = useState<string>(Colors.primary);
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
  const [autoInvoiceOnDelivery, setAutoInvoiceOnDelivery] = useState(true);
  const [autoReceiptOnCodDelivery, setAutoReceiptOnCodDelivery] = useState(true);
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
    // Absent reads as ON — matches `order-billing.service.ts#loadBillingSettings`'s `!== false`.
    setAutoInvoiceOnDelivery(s.autoInvoiceOnDelivery !== false);
    setAutoReceiptOnCodDelivery(s.autoReceiptOnCodDelivery !== false);
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
      autoInvoiceOnDelivery, autoReceiptOnCodDelivery,
      thermal: { width: Number(thermalWidth) as 58 | 80, copies: Math.min(5, Math.max(1, Number(thermalCopies) || 1)) },
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.billing.settings() });
      Alert.alert(t('settings.invoice.savedTitle'), t('settings.invoice.savedBody'));
    },
    onError: (err) => Alert.alert(t('settings.invoice.couldNotSave'), apiErrorMessage(err)),
  });

  const onSave = () => {
    const next: Record<string, string> = {};
    if (!/^#[0-9a-fA-F]{6}$/.test(accentColor.trim())) next.accentColor = t('settings.invoice.hexError', { example: Colors.primary });
    if (upiId.trim() && !/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(upiId.trim())) next.upiId = t('settings.invoice.upiError');
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate();
  };

  if (query.isPending) return <Screen c={c} title={t('settings.invoice.title')}><Loading c={c} /></Screen>;
  if (query.isError) {
    return <Screen c={c} title={t('settings.invoice.title')}><ErrorBlock c={c} message={apiErrorMessage(query.error, t('settings.invoice.couldNotLoad'))} onRetry={() => query.refetch()} /></Screen>;
  }

  return (
    <Screen c={c} title={t('settings.invoice.title')}>
      <Card c={c}>
        <SectionLabel c={c}>{t('settings.invoice.lookSection')}</SectionLabel>
        <ChipRow c={c} value={theme} options={themeOptions} onChange={setTheme} />
        <AppInput label={t('settings.invoice.accent')} value={accentColor} onChangeText={setAccentColor} autoCapitalize="none" disabled={!canEdit} error={errors.accentColor} />
      </Card>

      <Card c={c}>
        <SectionLabel c={c}>{t('settings.invoice.printsSection')}</SectionLabel>
        <ToggleRow c={c} label={t('settings.invoice.showHsn')} value={showHsn} onChange={setShowHsn} disabled={!canEdit} />
        <ToggleRow c={c} label={t('settings.invoice.showDiscount')} value={showDiscount} onChange={setShowDiscount} disabled={!canEdit} />
        <ToggleRow c={c} label={t('settings.invoice.showTaxBreakup')} value={showTaxBreakup} onChange={setShowTaxBreakup} disabled={!canEdit} />
        <ToggleRow c={c} label={t('settings.invoice.showUpiQr')} value={showUpiQr} onChange={setShowUpiQr} disabled={!canEdit} />
        <ToggleRow c={c} label={t('settings.invoice.showSignature')} value={showSignature} onChange={setShowSignature} disabled={!canEdit} />
        {/*
          RENAMED, and the note below it is the honest half.

          The toggle was labelled "Signature", which reads as "print my
          signature" — and a partner who switched it on and looked at the PDF
          found a ruled line and the words "Authorised signatory", which is what
          `partner-document-pdf.service.ts` actually draws. That is a useful
          thing and it is not what the label promised.

          THERE IS DELIBERATELY NO UPLOAD HERE. `logoUrl` and `signatureUrl` are
          both on the payload and both reach the render model, and the PDF
          service does nothing with the logo at all and prints the literal text
          `[signature image]` where a signature image would go (its own comment
          says the fetch-and-inline step was left to whoever wired issuance).
          So shipping an upload today would not add a signature to anybody's
          invoice — it would put the string "[signature image]" on bills handed
          to customers, which is worse than the blank line they get now. The
          uploader belongs in the same change as the backend fix; see this
          phase's report for the two lines that need to happen first.
        */}
        <Text style={{ color: c.textSecondary, fontSize: 11.5, marginTop: -2 }}>
          {t('settings.invoice.signatureNote')}
        </Text>
      </Card>

      <Card c={c}>
        <SectionLabel c={c}>{t('settings.invoice.deliverySection')}</SectionLabel>
        <ToggleRow
          c={c}
          label={t('settings.invoice.autoInvoice')}
          value={autoInvoiceOnDelivery}
          onChange={setAutoInvoiceOnDelivery}
          disabled={!canEdit}
        />
        <ToggleRow
          c={c}
          label={t('settings.invoice.autoReceipt')}
          value={autoReceiptOnCodDelivery}
          onChange={setAutoReceiptOnCodDelivery}
          disabled={!canEdit}
        />
        <Text style={{ color: c.textSecondary, fontSize: 11.5, lineHeight: 16 }}>
          {t('settings.invoice.deliveryNote')}
        </Text>
      </Card>

      <Card c={c}>
        <SectionLabel c={c}>{t('settings.invoice.bankSection')}</SectionLabel>
        <AppInput label={t('settings.invoice.accountName')} value={bankName} onChangeText={setBankName} disabled={!canEdit} />
        <AppInput label={t('settings.invoice.accountNumber')} value={acNo} onChangeText={setAcNo} disabled={!canEdit} />
        <AppInput label={t('settings.invoice.ifsc')} value={ifsc} onChangeText={(v) => setIfsc(v.toUpperCase())} autoCapitalize="characters" disabled={!canEdit} />
        <AppInput label={t('settings.invoice.upiId')} value={upiId} onChangeText={setUpiId} autoCapitalize="none" disabled={!canEdit} error={errors.upiId} />
      </Card>

      <Card c={c}>
        <SectionLabel c={c}>{t('settings.invoice.printerSection')}</SectionLabel>
        <ChipRow c={c} value={thermalWidth} options={WIDTH_OPTIONS} onChange={setThermalWidth} />
        <AppInput label={t('settings.invoice.copies')} value={thermalCopies} onChangeText={setThermalCopies} keyboardType="numeric" disabled={!canEdit} />
      </Card>

      <Card c={c}>
        <SectionLabel c={c}>{t('settings.invoice.everyDocSection')}</SectionLabel>
        <AppInput label={t('settings.invoice.terms')} value={terms} onChangeText={setTerms} multiline disabled={!canEdit} />
        <AppInput label={t('settings.invoice.notes')} value={notes} onChangeText={setNotes} multiline disabled={!canEdit} />
      </Card>

      {canEdit && (
        <AppButton label={t('settings.invoice.save')} onPress={onSave} loading={save.isPending} disabled={save.isPending} style={{ marginTop: 8 }} />
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
