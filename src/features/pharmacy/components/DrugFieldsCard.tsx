import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Switch, Text, TextInput } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { Card } from '../../more/ui';
import { ChoiceChips } from '../../p2/ui';
import { ActionRow, Banner, PillButton } from '../../p1/ui';
import { pharmacyApi, pharmacyKeys } from '../api';
import type { DrugFieldsBody, DrugSchedule, ProductDrugInfo, ProductBatchesView } from '../types';

type ScheduleChoice = 'NONE' | DrugSchedule;
const SCHEDULE_CHOICES: ScheduleChoice[] = ['NONE', 'H', 'H1', 'X'];

/**
 * A medicine's details: batch tracking, schedule (None / H / H1 / X),
 * composition and manufacturer. Editable with PHARMACY_MANAGE; read-only
 * otherwise. Only what changed is sent; an emptied text is sent as `null`
 * (cleared). 409 PRODUCT_NOT_STOCK_TRACKED is shown on the card.
 */
export function DrugFieldsCard({
  c, product, info, canEdit,
}: { c: ColorScheme; product: ProductBatchesView['product']; info: ProductDrugInfo | null; canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // The saved product from the last PUT — the truth for composition /
  // manufacturer even for a reader who cannot load the product itself.
  const [savedCopy, setSavedCopy] = useState<ProductDrugInfo | null>(null);
  const text = savedCopy ?? info;
  const initial = {
    batchTracking: product.batchTracking,
    schedule: (product.drugSchedule ?? 'NONE') as ScheduleChoice,
    composition: text?.composition ?? '',
    manufacturer: text?.manufacturer ?? '',
  };
  const [tracking, setTracking] = useState(initial.batchTracking);
  const [schedule, setSchedule] = useState<ScheduleChoice>(initial.schedule);
  const [composition, setComposition] = useState(initial.composition);
  const [manufacturer, setManufacturer] = useState(initial.manufacturer);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-seed when the server copy changes (after a save, or when `info` arrives).
  useEffect(() => {
    setTracking(initial.batchTracking);
    setSchedule(initial.schedule);
    setComposition(initial.composition);
    setManufacturer(initial.manufacturer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.batchTracking, initial.schedule, initial.composition, initial.manufacturer]);

  const body: DrugFieldsBody = {};
  if (tracking !== initial.batchTracking) body.batchTracking = tracking;
  if (schedule !== initial.schedule) body.drugSchedule = schedule === 'NONE' ? null : schedule;
  if (composition.trim() !== initial.composition) body.composition = composition.trim() || null;
  if (manufacturer.trim() !== initial.manufacturer) body.manufacturer = manufacturer.trim() || null;
  const dirty = Object.keys(body).length > 0;

  const save = useMutation({
    mutationFn: () => pharmacyApi.updateDrug(product.id, body),
    onSuccess: (p) => {
      if (p) setSavedCopy(p);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: pharmacyKeys.product(product.id) });
      void queryClient.invalidateQueries({ queryKey: pharmacyKeys.productInfo(product.id) });
    },
    onError: (e) => setError(apiErrorMessage(e, t('p2.pharmacy.drug.failed'))),
  });

  return (
    <Card c={c}>
      <Text style={[styles.title, { color: c.textPrimary }]}>{t('p2.pharmacy.drug.title')}</Text>
      <View style={styles.switchRow}>
        <Text style={{ flex: 1, minWidth: 0, color: c.textPrimary }} numberOfLines={2}>{t('p2.pharmacy.drug.batchTracking')}</Text>
        <Switch
          value={tracking}
          onValueChange={(v) => { setTracking(v); setSaved(false); }}
          disabled={!canEdit}
          accessibilityLabel={t('p2.pharmacy.drug.batchTracking')}
          testID="drug-tracking"
        />
      </View>
      <Text style={[styles.label, { color: c.textSecondary }]}>{t('p2.pharmacy.drug.schedule')}</Text>
      {canEdit ? (
        <ChoiceChips<ScheduleChoice>
          c={c}
          options={SCHEDULE_CHOICES.map((k) => ({ key: k, label: t(`p2.pharmacy.drug.schedules.${k}`) }))}
          value={[schedule]}
          onChange={(v) => { if (v[0]) { setSchedule(v[0]); setSaved(false); } }}
          testID="drug-schedule"
        />
      ) : (
        <Text style={{ color: c.textPrimary }}>{t(`p2.pharmacy.drug.schedules.${schedule}`)}</Text>
      )}
      {schedule !== 'NONE' ? (
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t(`p2.pharmacy.drug.scheduleHint.${schedule}`)}</Text>
      ) : null}
      {canEdit ? (
        <>
          <TextInput
            mode="outlined"
            label={t('p2.pharmacy.drug.composition')}
            value={composition}
            onChangeText={(s) => { setComposition(s.slice(0, 200)); setSaved(false); }}
            outlineStyle={{ borderRadius: radii.field }}
            style={styles.field}
            testID="drug-composition"
          />
          <TextInput
            mode="outlined"
            label={t('p2.pharmacy.drug.manufacturer')}
            value={manufacturer}
            onChangeText={(s) => { setManufacturer(s.slice(0, 100)); setSaved(false); }}
            outlineStyle={{ borderRadius: radii.field }}
            style={styles.field}
            testID="drug-manufacturer"
          />
        </>
      ) : (
        <>
          {initial.composition ? (
            <Text style={{ color: c.textPrimary }}>{t('p2.pharmacy.drug.compositionIs', { value: initial.composition })}</Text>
          ) : null}
          {initial.manufacturer ? (
            <Text style={{ color: c.textPrimary }}>{t('p2.pharmacy.drug.manufacturerIs', { value: initial.manufacturer })}</Text>
          ) : null}
        </>
      )}
      {error ? <View testID="drug-error"><Banner c={c} tone="error" body={error} /></View> : null}
      {saved && !dirty ? <Text style={{ color: c.success, fontSize: 13 }}>{t('p2.pharmacy.drug.saved')}</Text> : null}
      {canEdit && dirty ? (
        <ActionRow>
          <PillButton
            c={c}
            icon="content-save-outline"
            label={save.isPending ? t('common.saving') : t('common.save')}
            onPress={() => { setError(null); save.mutate(); }}
            disabled={save.isPending}
            testID="drug-save"
          />
        </ActionRow>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  field: { backgroundColor: 'transparent' },
});
