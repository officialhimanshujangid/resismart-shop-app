import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Switch, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { TimeField } from '../../../components/TimeField';
import { Banner, PillButton, Stepper } from '../../p1/ui';
import { ChoiceChips, Sheet } from '../ui';
import {
  BILLING_BASES, BillingBasis, MODULE_SETTINGS_BOUNDS as B, ModuleSettings, P2Module, P2_SETTINGS_KEY, RX_SCHEDULES, RxSchedule,
} from '../modules';

/** A labelled switch row, 48dp. */
function SwitchRow({ c, label, hint, value, onChange, disabled, testID }: {
  c: ColorScheme; label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; testID?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.label, { color: c.textPrimary }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: c.textSecondary }]}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} testID={testID} />
    </View>
  );
}

/** A label above a 48dp stepper — wraps under the label on a narrow phone. */
function NumberRow({ c, label, hint, value, onChange, min, max, step = 1, disabled }: {
  c: ColorScheme; label: string; hint?: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; disabled?: boolean;
}) {
  return (
    <View style={styles.numRow} pointerEvents={disabled ? 'none' : 'auto'}>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0 }}>
        <Text style={[styles.label, { color: c.textPrimary }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: c.textSecondary }]}>{hint}</Text> : null}
      </View>
      <Stepper c={c} value={value} onChange={(v) => onChange(Math.round(v))} min={min} max={max} step={step} label={label} />
    </View>
  );
}

const CHANGE_WINDOWS = [0, 60, 120, 360, 720, 1440, 2880] as const;

/**
 * The settings of ONE business-type module (§1.3), saved with
 * `PUT /category-modules/settings/:key`. Allowed while the module is OFF — set
 * it up first, then switch on. Read-only for somebody without SETTINGS FULL.
 */
export function ModuleSettingsSheet({
  c, module, settings, visible, canManage, saving, error, onSave, onDismiss,
}: {
  c: ColorScheme;
  module: P2Module | null;
  settings: ModuleSettings;
  visible: boolean;
  canManage: boolean;
  saving: boolean;
  error: string | null;
  onSave: (body: Record<string, unknown>) => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const key = module ? P2_SETTINGS_KEY[module] : null;
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [expiryText, setExpiryText] = useState('');

  useEffect(() => {
    if (!visible || !key) return;
    const cur = { ...(settings[key] as unknown as Record<string, unknown>) };
    setDraft(cur);
    if (key === 'pharmacy') setExpiryText((settings.pharmacy.nearExpiryDays || []).join(', '));
  }, [visible, key, settings]);

  if (!module || !key) return null;
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  const num = (k: string) => Number(draft[k] ?? 0);
  const bool = (k: string) => draft[k] === true;
  const ro = !canManage;

  const expiryDays = expiryText.split(/[,\s]+/).map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0);
  const expiryBad = key === 'pharmacy' && (
    expiryDays.length < 1 || expiryDays.length > B.nearExpiryDays.maxItems
    || expiryDays.some((n) => n < B.nearExpiryDays.min || n > B.nearExpiryDays.max)
    || new Set(expiryDays).size !== expiryDays.length
  );

  const save = () => {
    const body = { ...draft };
    if (key === 'pharmacy') body.nearExpiryDays = [...expiryDays].sort((a, b) => b - a);
    if (key === 'appointments') {
      const w = draft.customerChangeCutoffMin;
      body.customerChangeCutoffMin = typeof w === 'number' && w > 0 ? w : null;
    }
    onSave(body);
  };

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t('p2.settings.sheetTitle', { module: t(`p2.settings.modules.${module}.label`) })}
      testID="p2-settings-sheet"
      footer={canManage ? (
        <PillButton c={c} icon="content-save-outline" label={saving ? t('common.saving') : t('common.save')} onPress={save} disabled={saving || expiryBad} testID="p2-settings-save" />
      ) : undefined}
    >
      {ro ? <Banner c={c} body={t('p2.common.viewOnly')} /> : null}
      {error ? <Banner c={c} tone="error" body={error} /> : null}

      {key === 'pharmacy' && (
        <>
          <Text style={[styles.label, { color: c.textPrimary }]}>{t('p2.settings.pharmacy.nearExpiryDays')}</Text>
          <TextInput
            mode="outlined"
            value={expiryText}
            onChangeText={setExpiryText}
            editable={!ro}
            keyboardType="numbers-and-punctuation"
            outlineStyle={{ borderRadius: radii.field }}
            style={{ backgroundColor: 'transparent' }}
            accessibilityLabel={t('p2.settings.pharmacy.nearExpiryDays')}
          />
          <Text style={[styles.hint, { color: expiryBad ? c.error : c.textSecondary }]}>{t('p2.settings.pharmacy.nearExpiryHint')}</Text>
          <Text style={[styles.label, { color: c.textPrimary }]}>{t('p2.settings.pharmacy.requireRxFor')}</Text>
          <ChoiceChips<RxSchedule>
            c={c}
            multi
            options={RX_SCHEDULES.map((s) => ({ key: s, label: t('p2.settings.pharmacy.schedule', { schedule: s }) }))}
            value={(draft.requireRxFor as RxSchedule[]) ?? []}
            onChange={(v) => !ro && set('requireRxFor', v)}
          />
          <SwitchRow c={c} label={t('p2.settings.pharmacy.enforceMrp')} value={bool('enforceMrp')} onChange={(v) => set('enforceMrp', v)} disabled={ro} />
          <SwitchRow c={c} label={t('p2.settings.pharmacy.requireBatchOnReceipt')} value={bool('requireBatchOnReceipt')} onChange={(v) => set('requireBatchOnReceipt', v)} disabled={ro} />
          <SwitchRow c={c} label={t('p2.settings.pharmacy.blockUnbatchedSales')} hint={t('p2.settings.pharmacy.blockUnbatchedHint')} value={bool('blockUnbatchedSales')} onChange={(v) => set('blockUnbatchedSales', v)} disabled={ro} />
        </>
      )}

      {key === 'subscriptions' && (
        <>
          <TimeField label={t('p2.settings.subscriptions.pauseCutoff')} value={String(draft.pauseCutoffHHmm ?? '20:00')} onChangeText={(v) => set('pauseCutoffHHmm', v)} disabled={ro} />
          <Text style={[styles.hint, { color: c.textSecondary }]}>{t('p2.settings.subscriptions.pauseCutoffHint')}</Text>
          <NumberRow c={c} label={t('p2.settings.subscriptions.maxPauseDays')} value={num('maxPauseDays')} onChange={(v) => set('maxPauseDays', v)} min={B.maxPauseDays.min} max={B.maxPauseDays.max} disabled={ro} />
          <NumberRow c={c} label={t('p2.settings.subscriptions.billDay')} hint={t('p2.settings.subscriptions.billDayHint')} value={num('billDay')} onChange={(v) => set('billDay', v)} min={B.billDay.min} max={B.billDay.max} disabled={ro} />
          <NumberRow c={c} label={t('p2.settings.subscriptions.markBackDays')} value={num('markBackDays')} onChange={(v) => set('markBackDays', v)} min={B.markBackDays.min} max={B.markBackDays.max} disabled={ro} />
          <SwitchRow c={c} label={t('p2.settings.subscriptions.autoIssue')} hint={t('p2.settings.subscriptions.autoIssueHint')} value={bool('autoIssue')} onChange={(v) => set('autoIssue', v)} disabled={ro} />
          <Text style={[styles.label, { color: c.textPrimary }]}>{t('p2.settings.subscriptions.billingBasis')}</Text>
          <ChoiceChips<BillingBasis>
            c={c}
            options={BILLING_BASES.map((b) => ({ key: b, label: t(`p2.settings.subscriptions.basis.${b}`) }))}
            value={[(draft.billingBasis as BillingBasis | undefined) ?? 'SCHEDULED_MINUS_EXCEPTIONS']}
            onChange={(v) => !ro && set('billingBasis', v[0])}
          />
          <SwitchRow c={c} label={t('p2.settings.subscriptions.moveStockOnBill')} value={bool('moveStockOnBill')} onChange={(v) => set('moveStockOnBill', v)} disabled={ro} />
        </>
      )}

      {key === 'appointments' && (
        <>
          <Text style={[styles.label, { color: c.textPrimary }]}>{t('p2.settings.appointments.changeWindow')}</Text>
          <Text style={[styles.hint, { color: c.textSecondary }]}>{t('p2.settings.appointments.changeWindowHint')}</Text>
          <ChoiceChips<number>
            c={c}
            options={CHANGE_WINDOWS.map((m) => ({
              key: m,
              label: m === 0 ? t('p2.settings.appointments.noWindow') : m < 1440 ? t('p2.settings.appointments.hours', { count: m / 60 }) : t('p2.settings.appointments.days', { count: m / 1440 }),
            }))}
            value={[typeof draft.customerChangeCutoffMin === 'number' ? (draft.customerChangeCutoffMin as number) : 0]}
            onChange={(v) => !ro && set('customerChangeCutoffMin', v[0] || undefined)}
          />
          <SwitchRow c={c} label={t('p2.settings.appointments.remind2h')} value={bool('remind2h')} onChange={(v) => set('remind2h', v)} disabled={ro} />
          <SwitchRow c={c} label={t('p2.settings.appointments.noShowConsumes')} value={bool('noShowConsumesSession')} onChange={(v) => set('noShowConsumesSession', v)} disabled={ro} />
          <NumberRow c={c} label={t('p2.settings.appointments.seriesHorizon')} value={num('seriesHorizonDays')} onChange={(v) => set('seriesHorizonDays', v)} min={B.seriesHorizonDays.min} max={B.seriesHorizonDays.max} step={7} disabled={ro} />
        </>
      )}

      {key === 'jobs' && (
        <>
          <NumberRow c={c} label={t('p2.settings.jobs.leadMin')} value={num('gatePassLeadMin')} onChange={(v) => set('gatePassLeadMin', v)} min={B.gatePassLeadMin.min} max={B.gatePassLeadMin.max} step={15} disabled={ro} />
          <NumberRow c={c} label={t('p2.settings.jobs.trailMin')} value={num('gatePassTrailMin')} onChange={(v) => set('gatePassTrailMin', v)} min={B.gatePassTrailMin.min} max={B.gatePassTrailMin.max} step={15} disabled={ro} />
          <NumberRow c={c} label={t('p2.settings.jobs.maxUses')} value={num('gatePassMaxUses')} onChange={(v) => set('gatePassMaxUses', v)} min={B.gatePassMaxUses.min} max={B.gatePassMaxUses.max} disabled={ro} />
          <NumberRow c={c} label={t('p2.settings.jobs.quoteValidity')} value={num('quoteValidityDays')} onChange={(v) => set('quoteValidityDays', v)} min={B.quoteValidityDays.min} max={B.quoteValidityDays.max} disabled={ro} />
          <SwitchRow c={c} label={t('p2.settings.jobs.quoteFirst')} hint={t('p2.settings.jobs.quoteFirstHint')} value={bool('requireQuoteBeforeVisit')} onChange={(v) => set('requireQuoteBeforeVisit', v)} disabled={ro} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  numRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17 },
});
