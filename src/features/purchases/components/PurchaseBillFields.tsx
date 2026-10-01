import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Switch, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { DateField } from '../../../components/DateField';
import type { PartnerDocumentType } from '../../billing/types';

/** The purchase documents that carry the SUPPLIER's own bill number and date (§1.1). */
export function takesSupplierBillFields(type: PartnerDocumentType): boolean {
  return type === 'PURCHASE_INVOICE' || type === 'DEBIT_NOTE';
}

/**
 * Supplier bill number + date, and the ITC toggle (screen S7). The number is
 * what a duplicate check is made on (409 PURCHASE_BILL_DUPLICATE_SUPPLIER_NO),
 * so it is the first field. ITC has three states: untouched (`null`, the
 * server decides — REGULAR and taxed → eligible), on, or off.
 */
export function PurchaseBillFields({
  c, showItc, supplierInvoiceNo, onSupplierInvoiceNo, supplierInvoiceDate, onSupplierInvoiceDate,
  itcEligible, onItcEligible, maxDate,
}: {
  c: ColorScheme;
  showItc: boolean;
  supplierInvoiceNo: string;
  onSupplierInvoiceNo: (v: string) => void;
  supplierInvoiceDate: string;
  onSupplierInvoiceDate: (v: string) => void;
  itcEligible: boolean | null;
  onItcEligible: (v: boolean) => void;
  /** The bill's own date — a supplier's bill cannot be dated after it. */
  maxDate?: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.box}>
      <TextInput
        mode="outlined"
        label={t('purchases.bill.supplierInvoiceNo')}
        value={supplierInvoiceNo}
        onChangeText={(v) => onSupplierInvoiceNo(v.slice(0, 40))}
        autoCapitalize="characters"
        outlineStyle={{ borderRadius: radii.field }}
        style={styles.input}
      />
      <DateField
        label={t('purchases.bill.supplierInvoiceDate')}
        value={supplierInvoiceDate}
        onChangeText={onSupplierInvoiceDate}
        mode="date"
        maximumDate={maxDate ? new Date(`${maxDate}T00:00:00`) : undefined}
        placeholder={t('purchases.bill.supplierInvoiceDateHint')}
      />
      {showItc && (
        <View style={styles.itcRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>{t('purchases.bill.itc')}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 11.5, marginTop: 2 }}>
              {itcEligible === null ? t('purchases.bill.itcAuto') : t('purchases.bill.itcHint')}
            </Text>
          </View>
          <Switch
            value={itcEligible ?? true}
            onValueChange={onItcEligible}
            accessibilityLabel={t('purchases.bill.itc')}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  input: { backgroundColor: 'transparent' },
  itcRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
});
