import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import type { ColorScheme } from '../../constants/colors';
import { Button } from '../../components/ui';
import { Rise } from '../../theme/motion';
import type { AiProductDraft, AiPurchaseDraft, AiSupplierView } from '../../api/ai-partner.api';

/**
 * AI-4 — what to check after a photo filled a form (shop app). Same words and
 * rules as the website's `AiProductReview` / `AiPurchaseReview`.
 */

const rupees = (p?: number | null) => `₹${((p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function Note({ c, tone, text, testID }: { c: ColorScheme; tone: 'info' | 'warn' | 'ok' | 'muted'; text: string; testID?: string }) {
  const col = tone === 'warn' ? c.warning : tone === 'ok' ? c.success : tone === 'info' ? c.primary : c.textSecondary;
  return (
    <View testID={testID} style={[styles.note, { borderColor: `${col}55`, backgroundColor: `${col}14` }]}>
      <Text style={[styles.small, { color: c.textPrimary }]}>{text}</Text>
    </View>
  );
}

/** P1 — after a product photo. `onDescription` swaps the description between the English and Hindi text. */
export function AiProductReview({ c, draft, shown, onDescription }: {
  c: ColorScheme; draft: AiProductDraft; shown: 'en' | 'hi' | null; onDescription: (l: 'en' | 'hi') => void;
}) {
  const { t } = useTranslation();
  const w = new Set(draft.warnings);
  return (
    <View style={styles.wrap} testID="ai-product-review">
      <Note c={c} tone="info" text={t('aiPartner.product.review.checkAll')} />
      <Note c={c} tone="warn" text={t('aiPartner.product.review.priceYours')} />
      {draft.similar ? <Note c={c} tone="warn" text={t('aiPartner.product.review.similar', { name: draft.similar.name })} /> : null}
      {draft.gstRatePercent !== null || draft.hsnCode ? (
        <Note c={c} tone="warn" text={t('aiPartner.product.review.taxVerify', { gst: draft.gstRatePercent !== null ? `${draft.gstRatePercent}%` : '—', hsn: draft.hsnCode || '—' })} />
      ) : null}
      {(['PRICE_REMOVED', 'CATEGORY_NONE', 'UNIT_UNSURE', 'NAME_UNCLEAR', 'LOW_CONFIDENCE'] as const).filter((k) => w.has(k)).map((k) => (
        <Note key={k} c={c} tone="muted" text={t(`aiPartner.product.warn.${k}`)} />
      ))}
      {draft.description.en && draft.description.hi && shown ? (
        <View style={styles.row}>
          <Text style={[styles.small, { color: c.textSecondary }]}>{t('aiPartner.product.review.descriptionIn')}</Text>
          <Button label="English" size="sm" variant={shown === 'en' ? 'soft' : 'outline'} onPress={() => onDescription('en')} />
          <Button label="हिंदी" size="sm" variant={shown === 'hi' ? 'soft' : 'outline'} onPress={() => onDescription('hi')} />
        </View>
      ) : null}
    </View>
  );
}

/** P2 — after a supplier bill: supplier, lines (matched / to check / new), duplicate, the bill's total. */
export function AiPurchaseReview({ c, draft, unmatched, onPickSupplier, onUnmatch, onAddProduct, formTotalPaise }: {
  c: ColorScheme;
  draft: AiPurchaseDraft;
  unmatched: ReadonlySet<number>;
  onPickSupplier: (s: AiSupplierView) => void;
  onUnmatch: (i: number) => void;
  /** "Add as product" for line i (opens Add product pre-filled — never a price). */
  onAddProduct: (i: number) => void;
  formTotalPaise?: number | null;
}) {
  const { t } = useTranslation();
  const s = draft.supplier;
  const general = draft.warnings.filter((x) => !['DUPLICATE_BILL', 'SUPPLIER_NEW', 'LINES_UNMATCHED', 'LINES_TO_CHECK'].includes(x));
  const totalOff = draft.totals.totalPaise != null && formTotalPaise != null && Math.abs(draft.totals.totalPaise - formTotalPaise) > 100;
  return (
    <View style={styles.wrap} testID="ai-purchase-review">
      <Note c={c} tone="info" text={t('aiPartner.purchase.review.checkAll')} />
      {draft.duplicate ? (
        <Note c={c} tone="warn" testID="ai-purchase-duplicate" text={t('aiPartner.purchase.review.duplicate', { no: draft.duplicate.supplierInvoiceNo, date: draft.duplicate.date || '—' })} />
      ) : null}

      <View style={[styles.box, { borderColor: c.divider, backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.textPrimary }]}>{s.name || t('aiPartner.purchase.review.supplierUnknown')}</Text>
        {s.gstin ? <Text style={[styles.small, { color: c.textSecondary }]}>{t('aiPartner.purchase.review.gstin', { gstin: s.gstin })}</Text> : null}
        {s.match.kind !== 'NONE' ? (
          <Text style={[styles.small, { color: c.success, marginTop: 4 }]}>
            {t(s.match.kind === 'GSTIN' ? 'aiPartner.purchase.review.supplierByGstin' : 'aiPartner.purchase.review.supplierByName', { name: s.match.party.name })}
          </Text>
        ) : (
          <View style={{ marginTop: 6, gap: 6 }}>
            <Text style={[styles.small, { color: c.textSecondary }]}>{t('aiPartner.purchase.review.supplierNewApp')}</Text>
            {s.suggestions.map((x) => (
              <Button key={x._id} label={t('aiPartner.purchase.review.isIt', { name: x.name })} size="sm" variant="outline" onPress={() => onPickSupplier(x)} />
            ))}
          </View>
        )}
      </View>

      {draft.lines.map((l, i) => {
        const off = unmatched.has(i);
        const kind = off ? 'NONE' : l.match.kind;
        const flagged = kind === 'NONE' || kind === 'LIKELY';
        return (
          <Rise key={i} index={Math.min(i, 6)}>
            <View style={[styles.box, { borderColor: flagged ? `${c.warning}66` : c.divider, backgroundColor: flagged ? `${c.warning}12` : c.surface }]}>
              <View style={styles.lineHead}>
                <Text style={[styles.title, { color: c.textPrimary, flex: 1 }]}>{l.name}</Text>
                <Text style={[styles.small, { color: c.textSecondary }]}>{l.qty} {l.unit} × {rupees(l.ratePaise)}</Text>
              </View>
              <Text style={[styles.small, { color: kind === 'NONE' || kind === 'LIKELY' ? c.warning : c.success }]}>
                {kind === 'NONE' ? t('aiPartner.purchase.review.lineNew')
                  : kind === 'LIKELY' && l.match.kind !== 'NONE' ? t('aiPartner.purchase.review.lineLikely', { name: l.match.productName })
                    : l.match.kind !== 'NONE' ? t('aiPartner.purchase.review.lineMatched', { name: l.match.productName }) : ''}
              </Text>
              {l.warnings.map((x) => <Text key={x} style={[styles.small, { color: c.textSecondary }]}>{t(`aiPartner.purchase.lineWarn.${x}`)}</Text>)}
              <View style={styles.row}>
                {kind === 'LIKELY' || kind === 'NAME' ? <Button label={t('aiPartner.purchase.review.notThis')} size="sm" variant="ghost" icon="link-variant-off" onPress={() => onUnmatch(i)} /> : null}
                {kind === 'NONE' ? (draft.canAddProducts
                  ? <Button label={t('aiPartner.purchase.review.addProduct')} size="sm" variant="soft" icon="package-variant-plus" onPress={() => onAddProduct(i)} testID={`ai-add-product-${i}`} />
                  : <Text style={[styles.small, { color: c.textSecondary }]}>{t('aiPartner.purchase.review.askToAdd')}</Text>) : null}
              </View>
            </View>
          </Rise>
        );
      })}
      {draft.lines.some((l, i) => l.match.kind === 'NONE' || unmatched.has(i))
        ? <Text style={[styles.small, { color: c.textSecondary }]}>{t('aiPartner.purchase.review.afterAddingApp')}</Text> : null}

      <View style={[styles.box, { borderColor: c.divider }]}>
        {draft.totals.taxablePaise != null ? <Row c={c} k={t('aiPartner.purchase.review.taxable')} v={rupees(draft.totals.taxablePaise)} /> : null}
        {draft.totals.taxPaise != null ? <Row c={c} k={t('aiPartner.purchase.review.tax')} v={rupees(draft.totals.taxPaise)} /> : null}
        <Row c={c} strong k={t('aiPartner.purchase.review.billTotal')} v={draft.totals.totalPaise != null ? rupees(draft.totals.totalPaise) : '—'} />
      </View>
      {totalOff ? <Note c={c} tone="warn" text={t('aiPartner.purchase.review.totalDiffers', { bill: rupees(draft.totals.totalPaise), form: rupees(formTotalPaise) })} /> : null}
      {general.map((x) => <Note key={x} c={c} tone={x === 'BANK_DETAILS_HIDDEN' ? 'muted' : 'warn'} text={t(`aiPartner.purchase.warn.${x}`)} />)}
    </View>
  );
}

function Row({ c, k, v, strong }: { c: ColorScheme; k: string; v: string; strong?: boolean }) {
  return (
    <View style={styles.lineHead}>
      <Text style={[styles.small, { color: strong ? c.textPrimary : c.textSecondary, flex: 1, fontWeight: strong ? '700' : '400' }]}>{k}</Text>
      <Text style={[styles.small, { color: c.textPrimary, fontWeight: strong ? '700' : '400' }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 8 },
  note: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10, gap: 3 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  lineHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 14, fontWeight: '600' },
  small: { fontSize: 12.5, lineHeight: 18 },
});
