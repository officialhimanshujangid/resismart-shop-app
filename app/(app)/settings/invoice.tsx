import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Switch, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { uploadPublicImage } from '../../../src/api/partner.api';
import { PressableScale } from '../../../src/theme/motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Colors, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { PausedReadOnlyNote, useIsPaused } from '../../../src/features/p1/PausedReadOnlyNote'; // P9A Q10
import { qk } from '../../../src/lib/queryKeys';
import { settingsApi, InvoiceTheme, INVOICE_THEMES } from '../../../src/api/settings.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { AppInput } from '../../../src/components/AppInput';
import { Button, useToast } from '../../../src/components/ui'; // M19: kit button (haptic) + success toast
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
  // P9A (Owner Q10): a paused business may read these settings, never change them.
  const paused = useIsPaused();
  const canEdit = can('SETTINGS', 'FULL') && !paused;
  const queryClient = useQueryClient();
  const toast = useToast();

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
  // M19 parity with web: logo + signature images (the PDF draws both now).
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'logo' | 'signature' | null>(null);
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
  // P1 §1.5 (screen S19): exempt bills print as bills of supply; GRN over-receipt tolerance.
  const [billOfSupplyForExempt, setBillOfSupplyForExempt] = useState(false);
  const [overReceiptPercent, setOverReceiptPercent] = useState('0');
  const [thermalCopies, setThermalCopies] = useState('1');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const s = query.data;
    if (!s) return;
    setTheme(s.theme);
    setAccentColor(s.accentColor);
    setLogoUrl(s.logoUrl || null);
    setSignatureUrl(s.signatureUrl || null);
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
    setBillOfSupplyForExempt(s.billOfSupplyForExempt === true);
    setOverReceiptPercent(String(s.overReceiptPercent ?? 0));
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => settingsApi.invoice.update({
      theme,
      accentColor,
      // `null` clears on the server; a removed image must not be silently kept.
      // P8R — sent only when CHANGED from what was loaded: a legacy stored link that
      // predates the upload rule would otherwise refuse every save (FIELD_INVALID).
      ...(logoUrl !== (query.data?.logoUrl || null) ? { logoUrl } : {}),
      ...(signatureUrl !== (query.data?.signatureUrl || null) ? { signatureUrl } : {}),
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
      billOfSupplyForExempt,
      overReceiptPercent: Math.min(20, Math.max(0, Math.round(Number(overReceiptPercent) || 0))),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.billing.settings() });
      toast.show({ message: `${t('settings.invoice.savedTitle')} — ${t('settings.invoice.savedBody')}`, tone: 'success' });
    },
    onError: (err) => Alert.alert(t('settings.invoice.couldNotSave'), apiErrorMessage(err)),
  });

  const pickAndUpload = async (kind: 'logo' | 'signature') => {
    setUploading(kind);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (picked.canceled || !picked.assets.length) return;
      const a = picked.assets[0];
      const url = await uploadPublicImage({
        uri: a.uri,
        name: a.fileName ?? `${kind}-${Date.now()}.jpg`,
        mimeType: a.mimeType ?? 'image/jpeg',
      });
      if (kind === 'logo') setLogoUrl(url); else setSignatureUrl(url);
    } catch (e) {
      Alert.alert(t(kind === 'logo' ? 'settings.invoice.uploadFailedLogo' : 'settings.invoice.uploadFailedSignature'), apiErrorMessage(e));
    } finally {
      setUploading(null);
    }
  };

  const onSave = () => {
    const next: Record<string, string> = {};
    if (!/^#[0-9a-fA-F]{6}$/.test(accentColor.trim())) next.accentColor = t('settings.invoice.hexError', { example: Colors.primary });
    if (upiId.trim() && !/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(upiId.trim())) next.upiId = t('settings.invoice.upiError');
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate();
  };

  if (query.isPending) return <Screen c={c} title={t('settings.invoice.title')}><Loading c={c} skeleton={5} /></Screen>;
  if (query.isError) {
    return <Screen c={c} title={t('settings.invoice.title')}><ErrorBlock c={c} message={apiErrorMessage(query.error, t('settings.invoice.couldNotLoad'))} onRetry={() => query.refetch()} /></Screen>;
  }

  return (
    <Screen c={c} title={t('settings.invoice.title')} rise>
      <PausedReadOnlyNote />
      <Card c={c}>
        <SectionLabel c={c}>{t('settings.invoice.lookSection')}</SectionLabel>
        <ChipRow c={c} value={theme} options={themeOptions} onChange={setTheme} />
        <AppInput label={t('settings.invoice.accent')} value={accentColor} onChangeText={setAccentColor} autoCapitalize="none" disabled={!canEdit} error={errors.accentColor} />
      </Card>

      <Card c={c}>
        <SectionLabel c={c}>{t('settings.invoice.brandingSection')}</SectionLabel>
        <View style={styles.slots}>
          <UploadSlot
            c={c}
            label={t('settings.invoice.logo')}
            url={logoUrl}
            busy={uploading === 'logo'}
            disabled={!canEdit || uploading !== null}
            onPick={() => void pickAndUpload('logo')}
            onClear={() => setLogoUrl(null)}
          />
          <UploadSlot
            c={c}
            label={t('settings.invoice.signature')}
            url={signatureUrl}
            busy={uploading === 'signature'}
            disabled={!canEdit || uploading !== null}
            onPick={() => void pickAndUpload('signature')}
            onClear={() => setSignatureUrl(null)}
          />
        </View>
        {/* P8A (Owner 2026-10-10): an old outside-link logo / signature is kept on file but never
            prints (the PDF refuses it). Say so until a new image replaces it — same as the web. */}
        {(() => {
          const staleLogo = query.data?.logoNeedsUpload === true && !!logoUrl && logoUrl === (query.data?.logoUrl || null);
          const staleSignature = query.data?.signatureNeedsUpload === true && !!signatureUrl && signatureUrl === (query.data?.signatureUrl || null);
          if (!staleLogo && !staleSignature) return null;
          return (
            <View
              testID="invoice-asset-reupload"
              accessibilityLiveRegion="polite"
              style={[styles.reupload, { backgroundColor: `${c.warning}1A`, borderColor: `${c.warning}40` }]}
            >
              <MaterialCommunityIcons name="information-outline" size={18} color={c.warning} />
              <Text style={{ color: c.warning, fontSize: 12.5, lineHeight: 18, fontWeight: '600', flex: 1, minWidth: 0 }}>
                {staleLogo && staleSignature
                  ? t('settings.invoice.reuploadBoth')
                  : staleLogo ? t('settings.invoice.reuploadLogo') : t('settings.invoice.reuploadSignature')}
              </Text>
            </View>
          );
        })()}
        <Text style={{ color: c.textSecondary, fontSize: 11.5, lineHeight: 16 }}>{t('settings.invoice.brandingNote')}</Text>
      </Card>

      <Card c={c}>
        <SectionLabel c={c}>{t('settings.invoice.printsSection')}</SectionLabel>
        <ToggleRow c={c} label={t('settings.invoice.showHsn')} value={showHsn} onChange={setShowHsn} disabled={!canEdit} />
        <ToggleRow c={c} label={t('settings.invoice.showDiscount')} value={showDiscount} onChange={setShowDiscount} disabled={!canEdit} />
        <ToggleRow c={c} label={t('settings.invoice.showTaxBreakup')} value={showTaxBreakup} onChange={setShowTaxBreakup} disabled={!canEdit} />
        <ToggleRow c={c} label={t('settings.invoice.showUpiQr')} value={showUpiQr} onChange={setShowUpiQr} disabled={!canEdit} />
        <ToggleRow c={c} label={t('settings.invoice.showSignature')} value={showSignature} onChange={setShowSignature} disabled={!canEdit} />
        {/*
          The toggle draws the "Authorised signatory" line; the image itself is the
          Logo and signature card above (M19 — the PDF draws both now, web parity).
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
        <SectionLabel c={c}>{t('settings.invoice.p1Section')}</SectionLabel>
        <ToggleRow c={c} label={t('settings.invoice.billOfSupplyForExempt')} value={billOfSupplyForExempt} onChange={setBillOfSupplyForExempt} disabled={!canEdit} />
        <Text style={{ color: c.textSecondary, fontSize: 11.5, lineHeight: 16 }}>{t('settings.invoice.billOfSupplyForExemptNote')}</Text>
        <AppInput label={t('settings.invoice.overReceiptPercent')} value={overReceiptPercent} onChangeText={(v) => setOverReceiptPercent(v.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="numeric" disabled={!canEdit} />
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
        <Button fullWidth label={t('settings.invoice.save')} onPress={onSave} loading={save.isPending} disabled={save.isPending} style={{ marginTop: 8 }} />
      )}
    </Screen>
  );
}

function UploadSlot({
  c, label, url, busy, disabled, onPick, onClear,
}: {
  c: ReturnType<typeof themeColors>; label: string; url: string | null; busy: boolean; disabled: boolean;
  onPick: () => void; onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.slot}>
      <Text style={{ color: c.textSecondary, fontSize: 11.5, fontWeight: '600' }}>{label}</Text>
      {url ? (
        <View style={[styles.slotBox, { borderColor: c.border, backgroundColor: c.surface }]}>
          <Image source={{ uri: url }} style={styles.slotImg} resizeMode="contain" accessibilityLabel={label} />
          {!disabled ? (
            <PressableScale
              onPress={onClear}
              accessibilityRole="button"
              accessibilityLabel={t('settings.invoice.removeImage', { what: label })}
              hitSlop={8}
              style={[styles.slotClear, { backgroundColor: c.textPrimary }]}
            >
              <MaterialCommunityIcons name="close" size={14} color={c.background} />
            </PressableScale>
          ) : null}
        </View>
      ) : (
        <PressableScale
          onPress={onPick}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${t('settings.invoice.upload')}: ${label}`}
          accessibilityState={{ disabled, busy }}
          style={[styles.slotBox, styles.slotEmpty, { borderColor: c.border }, disabled && !busy ? { opacity: 0.6 } : null]}
        >
          {busy ? <ActivityIndicator size="small" color={c.primary} /> : <MaterialCommunityIcons name="upload" size={18} color={c.textSecondary} />}
          <Text style={{ color: c.textSecondary, fontSize: 11.5, fontWeight: '600' }}>
            {busy ? t('settings.invoice.uploading') : t('settings.invoice.upload')}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

function ToggleRow({ c, label, value, onChange, disabled }: { c: ReturnType<typeof themeColors>; label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.switchRow}>
      {/* M19 — the label takes the room and wraps (a long Hindi label pushed the switch off a 360 px screen). */}
      <Text style={{ color: c.textPrimary, fontSize: 14, flex: 1, lineHeight: 19 }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: c.border, true: c.primary }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slots: { flexDirection: 'row', gap: 12 },
  reupload: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 12, padding: 10 }, // P8A
  slot: { flex: 1, minWidth: 0, gap: 6 },
  slotBox: { height: 84, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  slotEmpty: { borderStyle: 'dashed', borderWidth: 1.5, gap: 4 },
  slotImg: { width: '100%', height: '100%' },
  slotClear: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 6, minHeight: 44 },
});
