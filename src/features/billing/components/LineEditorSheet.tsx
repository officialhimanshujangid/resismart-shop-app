import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Modal, Portal, Switch, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../constants/colors';
import { formatPaise, paiseToInput, parseRupeesToPaise } from '../../../lib/money';
import { DraftLineInput } from '../types';
import { DOC_UNITS, TAX_SLABS, previewDocumentTax } from '../taxPreview';

/**
 * One line, all of it — the phone's answer to the web's line grid
 * (`frontend/.../documents/new/LineGrid.tsx`).
 *
 * The web puts item / HSN / qty / unit / rate / discount / tax % in one row of
 * a spreadsheet because it has a keyboard and 860px. A phone has neither, so
 * the row on the billing screen stays a two-tap summary and everything else
 * lives behind a tap on it. What must NOT differ is the vocabulary: the same
 * seven fields, the same `TAX_SLABS`, the same `DOC_UNITS`, so a shopkeeper who
 * bills on both does not have to learn the screen twice.
 *
 * The one field the web grid does not expose per line is `taxInclusive`, and it
 * is here because it is the field the whole bill turns on. On the web a line
 * inherits it from the product and there is no way to change it; on a phone the
 * common case is a one-off line typed at the counter, which inherits nothing —
 * so leaving it un-editable would mean every hand-typed line took the default
 * silently, and the default decides whether ₹100 at 18% is a ₹100 bill or a
 * ₹118 one.
 *
 * `cessRatePercent` is deliberately absent. It is a compensation cess on a
 * short list of goods (tobacco, aerated drinks, coal, some cars) that a general
 * shop does not stock, the server prices it correctly when it is set, and a
 * field nobody fills is a field that gets a wrong number typed into it. The web
 * does not offer it either.
 */

export interface LineEditorSheetProps {
  visible: boolean;
  /** `null` when adding a brand-new one-off line. */
  line: DraftLineInput | null;
  /** The shop's own state and place of supply, so the preview splits the tax the way the server will. */
  supplierState?: string;
  placeOfSupply?: string;
  /** False for a shop that is not GST registered — the server zeroes every rate, so this screen must too. */
  gstApplicable: boolean;
  onDismiss: () => void;
  onSave: (line: DraftLineInput) => void;
  onRemove?: () => void;
  c: ReturnType<typeof themeColors>;
}

/** Rupee text ("1234.50") ↔ paise, kept as text while the field is being typed into. */
const blankDraft = (): DraftLineInput => ({
  itemName: '',
  qty: 1,
  unit: 'PCS',
  ratePaise: 0,
  discountPaise: 0,
  taxRatePercent: 0,
  taxInclusive: true,
});

export function LineEditorSheet({
  visible, line, supplierState, placeOfSupply, gstApplicable, onDismiss, onSave, onRemove, c,
}: LineEditorSheetProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [hsn, setHsn] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState<string>('PCS');
  const [rate, setRate] = useState('');
  const [discount, setDiscount] = useState('0.00');
  const [taxRatePercent, setTaxRatePercent] = useState(0);
  const [taxInclusive, setTaxInclusive] = useState(true);

  // Re-seed each time the sheet opens on a different line. Keyed on `visible`
  // too, so re-opening the SAME line after a cancel shows the stored values
  // again rather than the abandoned edit.
  useEffect(() => {
    if (!visible) return;
    const l = line ?? blankDraft();
    setName(l.itemName ?? '');
    setHsn(l.hsn ?? '');
    setQty(String(l.qty ?? 1));
    setUnit(l.unit || 'PCS');
    setRate(l.ratePaise ? paiseToInput(l.ratePaise) : '');
    setDiscount(paiseToInput(l.discountPaise ?? 0));
    setTaxRatePercent(l.taxRatePercent ?? 0);
    setTaxInclusive(l.taxInclusive ?? true);
  }, [visible, line]);

  const qtyNum = Number(qty);
  const ratePaise = parseRupeesToPaise(rate) ?? 0;
  const discountPaise = parseRupeesToPaise(discount) ?? 0;
  const valid = name.trim().length > 0 && Number.isFinite(qtyNum) && qtyNum > 0 && ratePaise >= 0;

  /**
   * This ONE line, priced exactly as the server will price it. Run through the
   * document-level function rather than a line-level shortcut so the split and
   * the rounding are the same code path as the totals card on the billing
   * screen — `roundOff: false` because a single line is not a document and the
   * round-off belongs to the whole bill.
   */
  const preview = useMemo(
    () => previewDocumentTax(
      [{ qty: Number.isFinite(qtyNum) ? qtyNum : 0, ratePaise, discountPaise, taxRatePercent, taxInclusive }],
      supplierState, placeOfSupply, { gstApplicable, roundOff: false },
    ),
    [qtyNum, ratePaise, discountPaise, taxRatePercent, taxInclusive, supplierState, placeOfSupply, gstApplicable],
  );
  const priced = preview.lines[0];

  const submit = () => {
    if (!valid) return;
    onSave({
      ...(line ?? {}),
      itemName: name.trim(),
      hsn: hsn.trim() || undefined,
      qty: qtyNum,
      unit,
      ratePaise,
      discountPaise,
      taxRatePercent,
      taxInclusive,
    });
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.sheet, { backgroundColor: c.surface }]}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Text style={[styles.title, { color: c.textPrimary }]}>
            {line ? t('billing.lineEditor.editTitle') : t('billing.lineEditor.addTitle')}
          </Text>

          <TextInput
            mode="outlined" label={t('billing.lineEditor.itemName')} value={name} onChangeText={setName}
            style={styles.field} outlineStyle={{ borderRadius: radii.field }}
          />

          <View style={styles.row}>
            <TextInput
              mode="outlined" label={t('billing.lineEditor.qty')} value={qty} onChangeText={setQty} keyboardType="decimal-pad"
              style={[styles.field, styles.half]} outlineStyle={{ borderRadius: radii.field }}
            />
            <TextInput
              mode="outlined" label={t('billing.lineEditor.rate')} value={rate} onChangeText={setRate} keyboardType="decimal-pad"
              style={[styles.field, styles.half]} outlineStyle={{ borderRadius: radii.field }}
            />
          </View>

          <View style={styles.row}>
            <TextInput
              // 12, matching `documentLineSchema.hsn`'s `.max(12)` in
              // `partner-billing.validator.ts` — a longer code is a 400 on Issue,
              // and being stopped at the field is better than being stopped at
              // the counter with a customer waiting.
              maxLength={12}
              mode="outlined" label={t('billing.lineEditor.hsn')} value={hsn} onChangeText={setHsn} autoCapitalize="characters"
              style={[styles.field, styles.half]} outlineStyle={{ borderRadius: radii.field }}
            />
            <TextInput
              mode="outlined" label={t('billing.lineEditor.discount')} value={discount} onChangeText={setDiscount} keyboardType="decimal-pad"
              style={[styles.field, styles.half]} outlineStyle={{ borderRadius: radii.field }}
            />
          </View>

          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('billing.lineEditor.unit')}</Text>
          {/* The unit CODES are the label — `PCS`, `KG`, `JOB` are what the
              server stores in `unit` and what prints on the bill, so they are
              not words to translate. */}
          <ChipRow options={DOC_UNITS.map((u) => ({ key: u, label: u }))} value={unit} onChange={setUnit} c={c} />

          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('billing.lineEditor.gstRate')}</Text>
          <ChipRow
            options={TAX_SLABS.map((s) => ({ key: String(s), label: `${s}%` }))}
            value={String(taxRatePercent)}
            onChange={(k) => setTaxRatePercent(Number(k))}
            c={c}
          />

          <View style={[styles.switchRow, { borderColor: c.divider }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>{t('billing.lineEditor.rateIncludesGst')}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 15 }}>
                {taxInclusive
                  ? t('billing.lineEditor.inclusiveHint')
                  : t('billing.lineEditor.exclusiveHint')}
              </Text>
            </View>
            <Switch value={taxInclusive} onValueChange={setTaxInclusive} />
          </View>

          <View style={[styles.previewBox, { backgroundColor: c.surfaceVariant }]}>
            <PreviewRow label={t('billing.lineEditor.taxableValue')} value={priced?.taxablePaise ?? 0} c={c} />
            {!gstApplicable ? (
              <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 15 }}>
                {t('billing.lineEditor.notGstRegistered')}
              </Text>
            ) : preview.interState ? (
              <PreviewRow label={t('billing.lineEditor.igst', { rate: taxRatePercent })} value={priced?.igstPaise ?? 0} c={c} />
            ) : (
              <>
                <PreviewRow label={t('billing.lineEditor.cgst', { rate: taxRatePercent / 2 })} value={priced?.cgstPaise ?? 0} c={c} />
                <PreviewRow label={t('billing.lineEditor.sgst', { rate: taxRatePercent / 2 })} value={priced?.sgstPaise ?? 0} c={c} />
              </>
            )}
            <PreviewRow label={t('billing.lineEditor.lineTotal')} value={priced?.totalPaise ?? 0} c={c} bold />
          </View>

          <View style={styles.actions}>
            {!!onRemove && (
              <Button mode="text" textColor={c.error} onPress={onRemove}>
                {t('billing.lineEditor.remove')}
              </Button>
            )}
            <View style={{ flex: 1 }} />
            <Button mode="text" onPress={onDismiss}>{t('billing.lineEditor.cancel')}</Button>
            <Button mode="contained" onPress={submit} disabled={!valid}>
              {line ? t('billing.lineEditor.save') : t('billing.lineEditor.add')}
            </Button>
          </View>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

function ChipRow({ options, value, onChange, c }: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  c: ReturnType<typeof themeColors>;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.chip, {
              backgroundColor: active ? c.primary : c.surfaceVariant,
              borderColor: active ? c.primary : c.divider,
            }]}
          >
            {/* '#fff' on `c.primary`, matching `catalog/create.tsx`'s unit chips —
                the brand green is dark enough for white ink in BOTH schemes, and
                `textInverse` flips to near-black in dark mode, which would be
                unreadable on it. */}
            <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12, fontWeight: '600' }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PreviewRow({ label, value, c, bold }: {
  label: string; value: number; c: ReturnType<typeof themeColors>; bold?: boolean;
}) {
  return (
    <View style={styles.previewRow}>
      <Text style={{ color: bold ? c.textPrimary : c.textSecondary, fontSize: 12, fontWeight: bold ? '700' : '400' }}>
        {label}
      </Text>
      <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: bold ? '700' : '500' }}>
        {formatPaise(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { margin: 16, borderRadius: radii.card, maxHeight: '88%' },
  body: { padding: 16, gap: 4 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  field: { marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 6, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  previewBox: { marginTop: 14, padding: 12, borderRadius: radii.field, gap: 4 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 4 },
});

export default LineEditorSheet;
