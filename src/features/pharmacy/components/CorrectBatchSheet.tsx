import React, { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { DateField } from '../../../components/DateField';
import { Sheet } from '../../p2/ui';
import { ActionRow, Banner, PillButton } from '../../p1/ui';
import { pharmacyApi, pharmacyKeys } from '../api';
import { CorrectionDraft, correctionBody, correctionDraftOf } from '../logic';
import type { BatchRow } from '../types';

/**
 * "Correct batch": MRP, manufactured-on date and expiry month, with the reason
 * (3–200 letters, audited). Only what changed is sent; an emptied MRP or mfg
 * date is sent as `null` (cleared). 409 BATCH_DUPLICATE is shown in the sheet.
 */
export function CorrectBatchSheet({
  batch, onDismiss, onDone,
}: { batch: BatchRow | null; onDismiss: () => void; onDone?: (row: BatchRow) => void }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CorrectionDraft>({ mrp: '', mfgDay: '', expiry: '', note: '' });
  const [error, setError] = useState<string | null>(null);

  const batchId = batch?.id;
  useEffect(() => {
    if (!batch) return;
    setDraft(correctionDraftOf(batch));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const save = useMutation({
    mutationFn: (body: Parameters<typeof pharmacyApi.correctBatch>[1]) => pharmacyApi.correctBatch(batch!.id, body),
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: pharmacyKeys.all() });
      onDone?.(row);
      onDismiss();
    },
    onError: (e) => setError(apiErrorMessage(e, t('p2.pharmacy.correct.failed'))),
  });

  const submit = () => {
    if (!batch) return;
    const out = correctionBody(batch, draft);
    if ('problem' in out) { setError(t(out.problem.key, out.problem.params)); return; }
    setError(null);
    save.mutate(out.body);
  };
  const set = (patch: Partial<CorrectionDraft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Sheet
      visible={!!batch}
      onDismiss={onDismiss}
      title={batch ? t('p2.pharmacy.correct.title', { batchNo: batch.batchNo }) : ''}
      testID="correct-sheet"
      footer={(
        <PillButton
          c={c}
          icon="pencil-outline"
          label={save.isPending ? t('common.saving') : t('p2.pharmacy.correct.save')}
          onPress={submit}
          disabled={save.isPending}
          testID="correct-save"
        />
      )}
    >
      <TextInput
        mode="outlined"
        label={t('p2.pharmacy.correct.mrp')}
        value={draft.mrp}
        onChangeText={(s) => set({ mrp: s })}
        keyboardType="decimal-pad"
        outlineStyle={{ borderRadius: radii.field }}
        style={styles.field}
        testID="correct-mrp"
      />
      <View style={styles.dateRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <DateField label={t('p2.pharmacy.correct.mfg')} value={draft.mfgDay} onChangeText={(s) => set({ mfgDay: s })} maximumDate={new Date()} />
        </View>
        {draft.mfgDay ? (
          <ActionRow>
            <PillButton c={c} tone="outline" label={t('p2.pharmacy.correct.clear')} onPress={() => set({ mfgDay: '' })} />
          </ActionRow>
        ) : null}
      </View>
      <TextInput
        mode="outlined"
        label={t('p2.pharmacy.correct.expiry')}
        placeholder="2027-03"
        value={draft.expiry}
        onChangeText={(s) => set({ expiry: s })}
        outlineStyle={{ borderRadius: radii.field }}
        style={styles.field}
        testID="correct-expiry"
      />
      <TextInput
        mode="outlined"
        label={t('p2.pharmacy.correct.note')}
        value={draft.note}
        onChangeText={(s) => set({ note: s.slice(0, 200) })}
        outlineStyle={{ borderRadius: radii.field }}
        style={styles.field}
        testID="correct-note"
      />
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.pharmacy.correct.audited')}</Text>
      {error ? <View testID="correct-error"><Banner c={c} tone="error" body={error} /></View> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: { backgroundColor: 'transparent' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
