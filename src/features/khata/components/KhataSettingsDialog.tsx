import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Button, Dialog, Portal, Switch, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { DateField } from '../../../components/DateField';
import { ChipRow } from '../../more/ui';
import { Stepper } from '../../p1/ui';
import { isoOfDay } from '../../p1/dates';
import { KHATA_COLLECTION_CADENCES, CollectionPlan, KhataSettingsBody, PartyCredit } from '../api';
import { buildKhataBody, formFrom, KhataForm } from '../logic';

/**
 * A customer's khata settings (screen S14): credit limit (WARN shows a banner
 * at billing, BLOCK stops the bill unless the owner overrides), credit days,
 * and the collection plan — when to collect and whether to remind on its own.
 */
export function KhataSettingsDialog({
  visible, name, credit, plan, submitting, onCancel, onSubmit,
}: {
  visible: boolean;
  name: string;
  credit?: PartyCredit;
  plan?: CollectionPlan;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (body: KhataSettingsBody) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [f, setF] = useState<KhataForm>(formFrom(credit, plan));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (visible) { setF(formFrom(credit, plan)); setError(null); } }, [visible, credit, plan]);
  const set = (p: Partial<KhataForm>) => setF((cur) => ({ ...cur, ...p }));

  const save = () => {
    const res = buildKhataBody(f, isoOfDay);
    if (res.error) { setError(t(`khata.settings.error.${res.error}`)); return; }
    onSubmit(res.body!);
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={submitting ? undefined : onCancel} style={{ backgroundColor: c.surface, maxHeight: '90%' }}>
        <Dialog.Title numberOfLines={1}>{t('khata.settings.title', { name })}</Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.switchRow}>
              <Text style={{ color: c.textPrimary, fontWeight: '600', flex: 1 }}>{t('khata.settings.limitOn')}</Text>
              <Switch value={f.hasLimit} onValueChange={(v) => set({ hasLimit: v })} accessibilityLabel={t('khata.settings.limitOn')} />
            </View>
            {f.hasLimit && (
              <>
                <TextInput mode="outlined" label={t('khata.settings.limit')} value={f.limit} keyboardType="decimal-pad" onChangeText={(limit) => set({ limit })} outlineStyle={{ borderRadius: radii.field }} />
                <ChipRow
                  c={c}
                  value={f.mode}
                  options={[{ key: 'WARN', label: t('khata.settings.modeWarn') }, { key: 'BLOCK', label: t('khata.settings.modeBlock') }]}
                  onChange={(mode) => set({ mode })}
                />
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>{f.mode === 'BLOCK' ? t('khata.settings.modeBlockHint') : t('khata.settings.modeWarnHint')}</Text>
              </>
            )}
            <TextInput mode="outlined" label={t('khata.settings.days')} value={f.days} keyboardType="number-pad" onChangeText={(days) => set({ days })} outlineStyle={{ borderRadius: radii.field }} />

            <Text style={[styles.label, { color: c.textSecondary }]}>{t('khata.settings.collection')}</Text>
            <ChipRow
              c={c}
              value={f.cadence}
              options={KHATA_COLLECTION_CADENCES.map((k) => ({ key: k, label: t(`khata.cadence.${k}`) }))}
              onChange={(cadence) => set({ cadence })}
            />
            {f.cadence === 'ON_DATE' && (
              <DateField label={t('khata.settings.nextDate')} value={f.nextDate} onChangeText={(nextDate) => set({ nextDate })} mode="date" minimumDate={new Date()} />
            )}
            {f.cadence === 'WEEKLY' && (
              <ChipRow
                c={c}
                value={String(f.weekday)}
                options={[0, 1, 2, 3, 4, 5, 6].map((d) => ({ key: String(d), label: t(`khata.weekday.${d}`) }))}
                onChange={(v) => set({ weekday: Number(v) })}
              />
            )}
            {f.cadence === 'MONTHLY' && (
              <View style={{ gap: 4 }}>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('khata.settings.dayOfMonth')}</Text>
                <Stepper c={c} value={f.dayOfMonth} min={1} max={28} onChange={(dayOfMonth) => set({ dayOfMonth })} label={t('khata.settings.dayOfMonth')} />
              </View>
            )}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{t('khata.settings.autoRemind')}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('khata.settings.autoRemindHint')}</Text>
              </View>
              <Switch value={f.autoRemind} onValueChange={(autoRemind) => set({ autoRemind })} accessibilityLabel={t('khata.settings.autoRemind')} />
            </View>
            {error ? <Text style={{ color: c.error }}>{error}</Text> : null}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onCancel} disabled={submitting}>{t('common.cancel')}</Button>
          <Button onPress={save} loading={submitting} disabled={submitting}>{t('common.save')}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 24, paddingVertical: 8, gap: 10 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
