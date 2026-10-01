import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { formatPaise } from '../../../lib/money';
import { newIdempotencyKey } from '../../../lib/idempotency';
import { usePartnerEntitlements } from '../../../hooks';
import { LineEditorSheet } from '../../billing/components/LineEditorSheet';
import { Banner, PillButton } from '../../p1/ui';
import { Sheet } from '../../p2/ui';
import { jobsApi } from '../api';
import { wireLines } from '../logic';
import type { JobInvoiceResult } from '../types';
import { useLineList } from '../useLines';
import { LineRows } from './LineRows';

/**
 * "Raise the bill": a tax invoice from the APPROVED quote's lines (the price the
 * customer agreed), plus any extra lines found on the job. The server says how
 * much the bill is above the quote; that is shown with the number, then
 * "View bill" opens it.
 */
export function RaiseBillSheet({
  c, jobId, visible, onDismiss, onDone,
}: { c: ColorScheme; jobId: string; visible: boolean; onDismiss: () => void; onDone: (r: JobInvoiceResult) => void }) {
  const { t } = useTranslation();
  const { roleLimits } = usePartnerEntitlements();
  const list = useLineList([], roleLimits);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<JobInvoiceResult | null>(null);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const { setLines, setEditing } = list;

  useEffect(() => {
    if (!visible) return;
    setLines([]); setEditing(null); setNotes(''); setError(null); setDone(null); keyRef.current = null;
  }, [visible, setLines, setEditing]);

  const submit = async () => {
    if (list.violation) { setError(t(`errors.${list.violation.code}`, list.violation.params)); return; }
    const extra = wireLines(list.lines);
    const body = {
      ...(extra.length ? { extraLines: extra } : {}),
      ...(notes.trim() ? { notes: notes.trim().slice(0, 2000) } : {}),
    };
    const sig = JSON.stringify(body);
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: newIdempotencyKey('job-invoice') };
    setBusy(true);
    setError(null);
    try {
      const out = await jobsApi.invoice(jobId, body, keyRef.current.key);
      setDone(out);
      onDone(out);
    } catch (e) {
      setError(apiErrorMessage(e, t('p2.jobs.bill.failed')));
    } finally {
      setBusy(false);
    }
  };

  const footer = done ? (
    <PillButton
      c={c}
      icon="file-document-outline"
      label={t('p2.jobs.detail.viewBill')}
      onPress={() => { onDismiss(); router.push(`/(app)/billing/${done.document._id}` as Href); }}
      testID="job-bill-view"
    />
  ) : (
    <PillButton c={c} icon="receipt" label={t('p2.jobs.actions.raiseBill')} onPress={submit} disabled={busy} testID="job-bill-save" />
  );

  return (
    <>
      <Sheet visible={visible} onDismiss={onDismiss} title={t('p2.jobs.actions.raiseBill')} footer={footer} testID="job-bill-sheet">
        {done ? (
          <View style={{ gap: 8 }} testID="job-bill-done">
            <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 16 }}>
              {t('p2.jobs.bill.raised', { number: done.document.number ?? '' })}
            </Text>
            <Text style={{ color: c.textPrimary }}>{formatPaise(done.document.totals?.grandPaise ?? 0)}</Text>
            {done.aboveQuotePaise > 0 ? (
              <Banner c={c} tone="warn" body={t('p2.jobs.bill.aboveQuote', { amount: formatPaise(done.aboveQuotePaise) })} testID="job-bill-above" />
            ) : null}
          </View>
        ) : (
          <>
            <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>{t('p2.jobs.bill.hint')}</Text>
            <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{t('p2.jobs.bill.extraLines')}</Text>
            {list.lines.length ? <LineRows c={c} list={list} testIDPrefix="job-bill-line" /> : null}
            <View style={{ flexDirection: 'row' }}>
              <PillButton c={c} tone="outline" icon="pencil-plus-outline" label={t('p2.jobs.quote.addItem')} onPress={() => list.setEditing('NEW')} testID="job-bill-add-item" />
            </View>
            <TextInput
              mode="outlined"
              label={t('p2.common.notes')}
              value={notes}
              onChangeText={(v) => setNotes(v.slice(0, 2000))}
              multiline
              outlineStyle={{ borderRadius: radii.field }}
              style={{ backgroundColor: 'transparent' }}
            />
            {error ? <Banner c={c} tone="error" body={error} testID="job-bill-error" /> : null}
          </>
        )}
      </Sheet>
      <LineEditorSheet
        visible={visible && list.editing !== null}
        line={list.editingLine}
        supplierState={list.tax.supplierState}
        gstApplicable={list.tax.gstApplicable}
        onDismiss={() => list.setEditing(null)}
        onSave={list.save}
        onRemove={list.editing && list.editing !== 'NEW' ? () => { list.remove(String(list.editing)); list.setEditing(null); } : undefined}
        c={c}
        discountCapPercent={roleLimits?.maxDiscountPercent}
      />
    </>
  );
}
