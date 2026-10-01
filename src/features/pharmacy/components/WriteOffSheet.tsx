import React, { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { newIdempotencyKey } from '../../../lib/idempotency';
import { ChoiceChips, Sheet } from '../../p2/ui';
import { Banner, PillButton, Stepper } from '../../p1/ui';
import { pharmacyApi, pharmacyKeys } from '../api';
import { expiryLabel, fmtQty } from '../logic';
import { WRITE_OFF_REASONS, type BatchRow, type WriteOffReason, type WriteOffResult } from '../types';

/**
 * "Write off" one batch: how many (defaults to everything on the shelf), why
 * (Expired pre-picked for an expired batch), an optional note, Confirm. The
 * idempotency key is minted when the sheet OPENS for a batch and reused on
 * every retry of that decision. A refusal (409 BATCH_PICK_SHORT …) is shown in
 * the sheet, in the reader's language.
 */
export function WriteOffSheet({
  batch, onDismiss, onDone,
}: { batch: BatchRow | null; onDismiss: () => void; onDone?: (r: WriteOffResult) => void }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState<WriteOffReason | null>(null);
  const [note, setNote] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const batchId = batch?.id;
  useEffect(() => {
    if (!batch) return;
    setQty(batch.qtyOnHand);
    setReason(batch.status === 'EXPIRED' ? 'EXPIRY' : null);
    setNote('');
    setError(null);
    setKey(newIdempotencyKey('pharmacy-writeoff'));
    // A new batch is a new decision; the same batch re-rendered is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const save = useMutation({
    mutationFn: () => pharmacyApi.writeOff(batch!.id, {
      qty, reasonCode: reason as WriteOffReason, ...(note.trim() ? { note: note.trim() } : {}),
    }, key),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: pharmacyKeys.all() });
      onDone?.(r);
      onDismiss();
    },
    onError: (e) => setError(apiErrorMessage(e, t('p2.pharmacy.writeOff.failed'))),
  });

  const ready = !!batch && qty > 0 && !!reason && !save.isPending;
  return (
    <Sheet
      visible={!!batch}
      onDismiss={onDismiss}
      title={batch ? t('p2.pharmacy.writeOff.title', { batchNo: batch.batchNo }) : ''}
      testID="writeoff-sheet"
      footer={(
        <PillButton
          c={c}
          tone="danger"
          icon="delete-outline"
          label={save.isPending ? t('common.saving') : t('p2.pharmacy.writeOff.confirm')}
          onPress={() => { setError(null); save.mutate(); }}
          disabled={!ready}
          testID="writeoff-confirm"
        />
      )}
    >
      {batch ? (
        <>
          <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={2}>{batch.productName}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={2}>
            {t('p2.pharmacy.writeOff.onHand', { qty: fmtQty(batch.qtyOnHand), expiry: expiryLabel(batch.expiryDate) })}
          </Text>
          <Text style={[styles.label, { color: c.textSecondary }]}>{t('p2.pharmacy.writeOff.qty')}</Text>
          <Stepper c={c} value={qty} onChange={setQty} min={0} max={batch.qtyOnHand} label={t('p2.pharmacy.writeOff.qty')} testID="writeoff-qty" />
          <Text style={[styles.label, { color: c.textSecondary }]}>{t('p2.pharmacy.writeOff.reason')}</Text>
          <ChoiceChips<WriteOffReason>
            c={c}
            options={WRITE_OFF_REASONS.map((k) => ({ key: k, label: t(`p2.pharmacy.writeOff.reasons.${k}`) }))}
            value={reason ? [reason] : []}
            onChange={(v) => setReason(v[0] ?? null)}
            testID="writeoff-reason"
          />
          {!reason ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.pharmacy.writeOff.pickReason')}</Text> : null}
          <TextInput
            mode="outlined"
            label={t('p2.pharmacy.writeOff.note')}
            value={note}
            onChangeText={(s) => setNote(s.slice(0, 300))}
            outlineStyle={{ borderRadius: radii.field }}
            style={{ backgroundColor: 'transparent' }}
            testID="writeoff-note"
          />
          {error ? <View testID="writeoff-error"><Banner c={c} tone="error" body={error} /></View> : null}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', marginTop: 4 },
});
