import React, { useState } from 'react';
import { Alert, Image, Pressable, Share, StyleSheet, View } from 'react-native';
import { IconButton, Switch, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { radii, type ColorScheme } from '../../../constants/colors';
import { formatPaise, paiseToInput } from '../../../lib/money';
import { apiErrorMessage } from '../../../api/axios';
import { TimeField } from '../../../components/TimeField';
import { Row } from '../../more/ui';
import { ActionRow, PillButton, Stepper } from '../../p1/ui';
import { ChoiceChips } from '../../p2/ui';
import { NumberRow, SwitchRow } from './ui';
import { PausePanel } from './PauseOrdersCard';
import type { CommerceSettingsPayload } from '../types';
import {
  DELIVERY_FEE_MODES, DELIVERY_PROOF_MODES, DELIVERY_TAX_MODES, SAC_PATTERN, STOREFRONT_BOUNDS as SB,
  clockText, extrasOf, feeRowsClash, normaliseWeek, rupeesIn, sameValue, sharePoster, slotWeekProblems,
  storefrontOf, taxPercentIn, useShareLinks, wholeIn,
  type DeliveryFeeMode, type DeliveryProofMode, type DeliverySettings, type DeliveryTaxMode, type FulfilmentSettings,
  type ShareSettings, type SlotDay,
} from '../storefrontApi';
import { SkeletonList } from '../../../components/ui';

/**
 * The "Online orders" half of Online shop settings (CONTRACT-commerce §6, §7,
 * §14 W/S-1): Storefront, Delivery fee, Delivery slots, Fulfilment, Share.
 *
 * Same rules as the C3–C6 cards: a SWITCH saves on one tap (only that key);
 * everything else is edited here and sent by the card's own Save, with only the
 * keys that changed. Every card is folded (one header line) so the screen is
 * not a wall on a phone.
 */

const rupeesText = (p: number | undefined) => paiseToInput(p ?? 0).replace(/\.00$/, '');
const SLOT_LENGTHS = [15, 20, 30, 45, 60, 90, 120, 180, 240];

export interface SectionProps {
  c: ColorScheme;
  /** STOREFRONT_MANAGE FULL — every C1/C2 section needs only this row. */
  canEdit: boolean;
  /** Switch taps in flight: `section.key` → the value shown until the server answers. */
  pending: Record<string, boolean>;
  onFlip: (key: string, v: boolean) => void;
  /** PUT `{ [section]: values }`; true when saved. */
  onSave: (values: Record<string, unknown>) => Promise<boolean>;
}

// ═══════════════════════════════════════════════════════════════ shared pieces

/** A card folded to one 52dp header line (title + summary); the body when open. */
export function FoldCard({
  c, title, summary, open, onToggle, testID, children,
}: {
  c: ColorScheme; title: string; summary?: string; open: boolean; onToggle: () => void; testID?: string; children: React.ReactNode;
}) {
  return (
    <View style={[styles.fold, { backgroundColor: c.surface }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        style={styles.foldHead}
        testID={testID}
      >
        <View style={styles.grow}>
          <Text style={[styles.foldTitle, { color: c.textPrimary }]}>{title}</Text>
          {summary ? <Text style={[styles.note, { color: c.textSecondary }]} numberOfLines={2}>{summary}</Text> : null}
        </View>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={24} color={c.textSecondary} />
      </Pressable>
      {open ? <View style={styles.foldBody}>{children}</View> : null}
    </View>
  );
}

function ReadOnly({ c, show, testID }: { c: ColorScheme; show: boolean; testID: string }) {
  const { t } = useTranslation();
  if (!show) return null;
  return <Text style={[styles.note, { color: c.textSecondary }]} testID={testID}>{t('commerce.settings.readOnly')}</Text>;
}

function SaveRow({ c, enabled, saving, onPress, testID }: { c: ColorScheme; enabled: boolean; saving: boolean; onPress: () => void; testID: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.saveRow}>
      <PillButton c={c} icon="content-save-outline" label={saving ? t('common.saving') : t('common.save')}
        onPress={onPress} disabled={!enabled || saving} testID={testID} />
    </View>
  );
}

function Label({ c, children }: { c: ColorScheme; children: React.ReactNode }) {
  return <Text style={[styles.label, { color: c.textSecondary }]}>{children}</Text>;
}

/** Run a card's save; the draft is dropped only when the server took it. */
function useCardSave(onSave: SectionProps['onSave']) {
  const [saving, setSaving] = useState(false);
  const run = async (values: Record<string, unknown>, done: () => void) => {
    if (!Object.keys(values).length) return;
    setSaving(true);
    try {
      if (await onSave(values)) done();
    } finally {
      setSaving(false);
    }
  };
  return { saving, run };
}

const amountErr = (t: (k: string, o?: Record<string, unknown>) => string, min: number, max: number) =>
  t('commerce.storefront.err.amount', { min: formatPaise(min), max: formatPaise(max) });
const wholeErr = (t: (k: string, o?: Record<string, unknown>) => string, min: number, max: number) =>
  t('commerce.storefront.err.whole', { min, max });

// ═══════════════════════════════════════════════════════════════ storefront

export function StorefrontSection({
  c, canEdit, pending, onFlip, onSave, payload, canPause,
}: SectionProps & { payload: CommerceSettingsPayload; canPause: boolean }) {
  const { t } = useTranslation();
  const sf = storefrontOf(payload);
  const extras = extrasOf(payload);
  const [minOrder, setMinOrder] = useState<string | undefined>(undefined);
  const { saving, run } = useCardSave(onSave);

  const minPaise = minOrder === undefined ? sf.minOrderPaise : rupeesIn(minOrder, 0, SB.maxMinOrderPaise, 0);
  const changes: Record<string, unknown> = {};
  if (minOrder !== undefined && minPaise !== null && minPaise !== sf.minOrderPaise) changes.minOrderPaise = minPaise;
  const valid = minPaise !== null;

  const explicit = extras.explicit?.acceptOrdersWhenClosed ?? null;
  const hours = extras.hoursStated === false
    ? t('commerce.storefront.hoursNone')
    : extras.openNow === false
      ? (extras.opensAt ? t('commerce.storefront.closedNowOpens', { time: clockText(extras.opensAt, t) }) : t('commerce.storefront.closedNow'))
      : t('commerce.storefront.openNow');
  const accept = pending['storefront.acceptOrdersWhenClosed'] ?? sf.acceptOrdersWhenClosed;

  return (
    <>
      <ReadOnly c={c} show={!canEdit} testID="settings-readonly-storefront" />
      <PausePanel c={c} storefront={sf} canPause={canPause} testID="settings-pause-panel" />
      <Text style={[styles.note, { color: c.textSecondary }]} testID="storefront-hours">{hours}</Text>
      <Row c={c} icon="clock-outline" title={t('commerce.storefront.shopHours')} subtitle={t('commerce.storefront.shopHoursHint')}
        onPress={() => router.push('/availability' as Href)} />
      <SwitchRow
        c={c}
        label={t('commerce.storefront.acceptWhenClosed')}
        hint={explicit === null
          ? t('commerce.storefront.acceptDefaultHint', { state: t(sf.acceptOrdersWhenClosed ? 'commerce.storefront.on' : 'commerce.storefront.off') })
          : t('commerce.storefront.acceptChosenHint')}
        value={accept}
        disabled={!canEdit || 'storefront.acceptOrdersWhenClosed' in pending}
        onValueChange={(v) => onFlip('acceptOrdersWhenClosed', v)}
        testID="settings-switch-storefront-acceptOrdersWhenClosed"
      />
      <NumberRow
        c={c} label={t('commerce.storefront.minOrder')} hint={t('commerce.storefront.minOrderHint')} prefix="₹"
        value={minOrder ?? rupeesText(sf.minOrderPaise)} onChangeText={setMinOrder} disabled={!canEdit}
        error={!valid ? amountErr(t, 0, SB.maxMinOrderPaise) : undefined} testID="settings-number-storefront-minOrderPaise"
      />
      <SaveRow c={c} enabled={canEdit && valid && Object.keys(changes).length > 0} saving={saving}
        onPress={() => void run(changes, () => setMinOrder(undefined))} testID="settings-save-storefront" />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════ delivery fee

interface FeeDraft {
  feeMode?: DeliveryFeeMode;
  flatFee?: string;
  society?: Array<{ societyId: string; fee: string }>;
  tower?: Array<{ societyId: string; blockName: string; fee: string }>;
  freeAbove?: string;
  taxMode?: DeliveryTaxMode;
  rate?: string;
  sac?: string;
}

/** A place the shop delivers to (`GET /commerce/delivery-areas`): its towers are offered as one-tap names. */
export interface SocietyOption { id: string; name: string; towers?: string[] }

export function DeliveryFeeSection({
  c, canEdit, pending, onFlip, onSave, delivery, societies,
}: SectionProps & { delivery: DeliverySettings; societies: SocietyOption[] }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<FeeDraft>({});
  const [addingSociety, setAddingSociety] = useState(false);
  const { saving, run } = useCardSave(onSave);
  const edit = (patch: Partial<FeeDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const feeMode = draft.feeMode ?? delivery.feeMode;
  const taxMode = draft.taxMode ?? delivery.taxMode;
  const societyRows = draft.society ?? delivery.societyFees.map((r) => ({ societyId: r.societyId, fee: rupeesText(r.feePaise) }));
  const towerRows = draft.tower ?? delivery.towerFees.map((r) => ({ societyId: r.societyId, blockName: r.blockName, fee: rupeesText(r.feePaise) }));

  // Society names: the shop's societies, plus any society a saved row names.
  const options: SocietyOption[] = [...societies];
  for (const id of [...societyRows.map((r) => r.societyId), ...towerRows.map((r) => r.societyId)]) {
    if (!options.some((o) => o.id === id)) options.push({ id, name: t('commerce.storefront.fee.savedSociety', { tail: id.slice(-4) }) });
  }
  const nameOf = (id: string) => options.find((o) => o.id === id)?.name ?? id.slice(-4);

  // ── draft → the changed keys (and the field errors)
  const errors: Record<string, string> = {};
  const out: Record<string, unknown> = {};
  if (draft.feeMode !== undefined && draft.feeMode !== delivery.feeMode) out.feeMode = draft.feeMode;
  if (draft.flatFee !== undefined) {
    const v = rupeesIn(draft.flatFee, 0, SB.maxFeePaise, 0);
    if (v === null) errors.flatFee = amountErr(t, 0, SB.maxFeePaise);
    else if (v !== delivery.flatFeePaise) out.flatFeePaise = v;
  }
  const societyWire = societyRows.map((r) => ({ societyId: r.societyId, feePaise: rupeesIn(r.fee, 0, SB.maxFeePaise) }));
  const towerWire = towerRows.map((r) => ({ societyId: r.societyId, blockName: r.blockName.trim(), feePaise: rupeesIn(r.fee, 0, SB.maxFeePaise) }));
  if (draft.society !== undefined) {
    if (societyWire.some((r) => r.feePaise === null)) errors.society = amountErr(t, 0, SB.maxFeePaise);
    else if (!sameValue(societyWire, delivery.societyFees)) out.societyFees = societyWire;
  }
  if (draft.tower !== undefined) {
    if (towerWire.some((r) => r.feePaise === null)) errors.tower = amountErr(t, 0, SB.maxFeePaise);
    else if (towerWire.some((r) => !r.blockName || r.blockName.length > SB.maxBlockName)) errors.tower = t('commerce.storefront.err.block');
    else if (!sameValue(towerWire, delivery.towerFees)) out.towerFees = towerWire;
  }
  if (feeRowsClash(societyRows, towerRows)) errors.clash = t('errors.DELIVERY_FEE_RULE_INVALID');
  if (draft.freeAbove !== undefined) {
    const v = rupeesIn(draft.freeAbove, 0, SB.maxMinOrderPaise, 0);
    if (v === null) errors.freeAbove = amountErr(t, 0, SB.maxMinOrderPaise);
    else if (v !== delivery.freeAbovePaise) out.freeAbovePaise = v;
  }
  if (draft.taxMode !== undefined && draft.taxMode !== delivery.taxMode) out.taxMode = draft.taxMode;
  if (draft.rate !== undefined) {
    const v = taxPercentIn(draft.rate);
    if (v === null) errors.rate = t('commerce.storefront.err.rate', { max: SB.maxTaxPercent });
    else if (v !== delivery.fixedTaxRatePercent) out.fixedTaxRatePercent = v;
  }
  if (draft.sac !== undefined) {
    if (!SAC_PATTERN.test(draft.sac.trim())) errors.sac = t('commerce.storefront.err.sac');
    else if (draft.sac.trim() !== delivery.sac) out.sac = draft.sac.trim();
  }
  const valid = Object.keys(errors).length === 0;

  const unused = options.filter((o) => !societyRows.some((r) => r.societyId === o.id));
  const addSociety = (id: string) => {
    edit({ society: [...societyRows, { societyId: id, fee: '' }] });
    setAddingSociety(false);
  };
  const setSocietyRow = (i: number, fee: string) => edit({ society: societyRows.map((r, j) => (j === i ? { ...r, fee } : r)) });
  const setTowerRow = (i: number, patch: Partial<{ societyId: string; blockName: string; fee: string }>) =>
    edit({ tower: towerRows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <>
      <ReadOnly c={c} show={!canEdit} testID="settings-readonly-deliveryFee" />
      <SwitchRow
        c={c} label={t('commerce.storefront.fee.enabled')} hint={t('commerce.storefront.fee.enabledHint')}
        value={pending['delivery.feeEnabled'] ?? delivery.feeEnabled}
        disabled={!canEdit || 'delivery.feeEnabled' in pending}
        onValueChange={(v) => onFlip('feeEnabled', v)}
        testID="settings-switch-delivery-feeEnabled"
      />

      <Label c={c}>{t('commerce.storefront.fee.mode')}</Label>
      <View pointerEvents={canEdit ? 'auto' : 'none'}>
        <ChoiceChips<DeliveryFeeMode>
          c={c}
          options={DELIVERY_FEE_MODES.map((m) => ({ key: m, label: t(`commerce.storefront.fee.modes.${m}`) }))}
          value={[feeMode]}
          onChange={(v) => edit({ feeMode: v[0] ?? 'FLAT' })}
          testID="delivery-fee-mode"
        />
      </View>
      <NumberRow
        c={c} label={t('commerce.storefront.fee.flat')}
        hint={feeMode === 'FLAT' ? undefined : t('commerce.storefront.fee.flatFallbackHint')}
        prefix="₹" value={draft.flatFee ?? rupeesText(delivery.flatFeePaise)} onChangeText={(s) => edit({ flatFee: s })}
        disabled={!canEdit} error={errors.flatFee} testID="delivery-flat-fee"
      />

      {feeMode !== 'FLAT' ? (
        <View style={styles.table} testID="delivery-society-table">
          <Label c={c}>{t('commerce.storefront.fee.bySociety')}</Label>
          {societyRows.map((r, i) => (
            <View key={`${r.societyId}-${i}`} style={styles.tableRow}>
              <Text style={[styles.rowName, { color: c.textPrimary }]} numberOfLines={2}>{nameOf(r.societyId)}</Text>
              <TextInput
                mode="outlined" dense keyboardType="numeric" value={r.fee} disabled={!canEdit}
                onChangeText={(s) => setSocietyRow(i, s)} accessibilityLabel={t('commerce.storefront.fee.feeFor', { name: nameOf(r.societyId) })}
                left={<TextInput.Affix text="₹" />} outlineStyle={{ borderRadius: radii.field }} style={styles.feeInput}
                testID={`society-fee-${i}`}
              />
              {canEdit ? (
                <IconButton icon="close" size={20} accessibilityLabel={t('commerce.storefront.fee.removeRow')}
                  onPress={() => edit({ society: societyRows.filter((_, j) => j !== i) })} />
              ) : null}
            </View>
          ))}
          {errors.society ? <Text style={[styles.error, { color: c.error }]}>{errors.society}</Text> : null}
          {!options.length ? (
            <Text style={[styles.note, { color: c.textSecondary }]}>{t('commerce.storefront.fee.noSocieties')}</Text>
          ) : null}
          {canEdit && unused.length > 0 && societyRows.length < SB.maxSocietyFees ? (
            addingSociety ? (
              <ChoiceChips<string>
                c={c} options={unused.map((o) => ({ key: o.id, label: o.name }))} value={[]}
                onChange={(v) => v[0] && addSociety(v[0])} testID="delivery-society-pick"
              />
            ) : (
              <ActionRow>
                <PillButton c={c} tone="outline" icon="plus" label={t('commerce.storefront.fee.addSociety')}
                  onPress={() => (unused.length === 1 ? addSociety(unused[0].id) : setAddingSociety(true))} testID="delivery-add-society" />
              </ActionRow>
            )
          ) : null}
        </View>
      ) : null}

      {feeMode === 'PER_TOWER' ? (
        <View style={styles.table} testID="delivery-tower-table">
          <Label c={c}>{t('commerce.storefront.fee.byTower')}</Label>
          {towerRows.map((r, i) => (
            <View key={i} style={[styles.towerRow, { borderColor: c.divider }]}>
              {options.length > 1 ? (
                <View pointerEvents={canEdit ? 'auto' : 'none'}>
                  <ChoiceChips<string>
                    c={c} options={options.map((o) => ({ key: o.id, label: o.name }))} value={[r.societyId]}
                    onChange={(v) => v[0] && setTowerRow(i, { societyId: v[0] })}
                  />
                </View>
              ) : (
                <Text style={[styles.rowName, { color: c.textPrimary }]} numberOfLines={2}>{nameOf(r.societyId)}</Text>
              )}
              <View style={styles.tableRow}>
                <TextInput
                  mode="outlined" dense label={t('commerce.storefront.fee.tower')} value={r.blockName} disabled={!canEdit}
                  onChangeText={(s) => setTowerRow(i, { blockName: s.slice(0, SB.maxBlockName) })}
                  outlineStyle={{ borderRadius: radii.field }} style={[styles.input, styles.grow]} testID={`tower-block-${i}`}
                />
                <TextInput
                  mode="outlined" dense keyboardType="numeric" value={r.fee} disabled={!canEdit}
                  onChangeText={(s) => setTowerRow(i, { fee: s })}
                  accessibilityLabel={t('commerce.storefront.fee.feeFor', { name: r.blockName || nameOf(r.societyId) })}
                  left={<TextInput.Affix text="₹" />} outlineStyle={{ borderRadius: radii.field }} style={styles.feeInput}
                  testID={`tower-fee-${i}`}
                />
                {canEdit ? (
                  <IconButton icon="close" size={20} accessibilityLabel={t('commerce.storefront.fee.removeRow')}
                    onPress={() => edit({ tower: towerRows.filter((_, j) => j !== i) })} />
                ) : null}
              </View>
              {/* The society's own tower names, one tap each — typing stays possible for a tower not listed. */}
              {canEdit && !r.blockName.trim() && (options.find((o) => o.id === r.societyId)?.towers?.length ?? 0) > 0 ? (
                <ChoiceChips<string>
                  c={c}
                  options={(options.find((o) => o.id === r.societyId)?.towers ?? [])
                    .filter((tw) => !towerRows.some((x, j) => j !== i && x.societyId === r.societyId && x.blockName.trim().toLowerCase() === tw.toLowerCase()))
                    .slice(0, 30)
                    .map((tw) => ({ key: tw, label: tw }))}
                  value={[]}
                  onChange={(v) => v[0] && setTowerRow(i, { blockName: v[0].slice(0, SB.maxBlockName) })}
                  testID={`tower-pick-${i}`}
                />
              ) : null}
            </View>
          ))}
          {errors.tower ? <Text style={[styles.error, { color: c.error }]}>{errors.tower}</Text> : null}
          {canEdit && options.length > 0 && towerRows.length < SB.maxTowerFees ? (
            <ActionRow>
              <PillButton c={c} tone="outline" icon="plus" label={t('commerce.storefront.fee.addTower')}
                onPress={() => edit({ tower: [...towerRows, { societyId: options[0].id, blockName: '', fee: '' }] })}
                testID="delivery-add-tower" />
            </ActionRow>
          ) : null}
        </View>
      ) : null}
      {errors.clash ? <Text style={[styles.error, { color: c.error }]}>{errors.clash}</Text> : null}

      <NumberRow
        c={c} label={t('commerce.storefront.fee.freeAbove')} hint={t('commerce.storefront.fee.freeAboveHint')} prefix="₹"
        value={draft.freeAbove ?? rupeesText(delivery.freeAbovePaise)} onChangeText={(s) => edit({ freeAbove: s })}
        disabled={!canEdit} error={errors.freeAbove} testID="delivery-free-above"
      />

      <Label c={c}>{t('commerce.storefront.fee.tax')}</Label>
      <View pointerEvents={canEdit ? 'auto' : 'none'}>
        <ChoiceChips<DeliveryTaxMode>
          c={c}
          options={DELIVERY_TAX_MODES.map((m) => ({ key: m, label: t(`commerce.storefront.fee.taxModes.${m}`) }))}
          value={[taxMode]}
          onChange={(v) => edit({ taxMode: v[0] ?? 'PRINCIPAL_SUPPLY' })}
          testID="delivery-tax-mode"
        />
      </View>
      <Text style={[styles.note, { color: c.textSecondary }]}>{t(`commerce.storefront.fee.taxHint.${taxMode}`)}</Text>
      {taxMode === 'FIXED_RATE' ? (
        <>
          <NumberRow
            c={c} label={t('commerce.storefront.fee.rate')} suffix="%" value={draft.rate ?? String(delivery.fixedTaxRatePercent)}
            onChangeText={(s) => edit({ rate: s })} disabled={!canEdit} error={errors.rate} width={100} testID="delivery-rate"
          />
          <NumberRow
            c={c} label={t('commerce.storefront.fee.sac')} hint={t('commerce.storefront.fee.sacHint')}
            value={draft.sac ?? delivery.sac} onChangeText={(s) => edit({ sac: s.replace(/\D/g, '').slice(0, 8) })}
            disabled={!canEdit} error={errors.sac} width={120} testID="delivery-sac"
          />
        </>
      ) : null}

      <SaveRow c={c} enabled={canEdit && valid && Object.keys(out).length > 0} saving={saving}
        onPress={() => void run(out, () => { setDraft({}); setAddingSociety(false); })} testID="settings-save-deliveryFee" />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════ delivery slots

export function DeliverySlotsSection({
  c, canEdit, pending, onFlip, onSave, delivery,
}: SectionProps & { delivery: DeliverySettings }) {
  const { t } = useTranslation();
  const [cutoff, setCutoff] = useState<string | undefined>(undefined);
  const [advance, setAdvance] = useState<string | undefined>(undefined);
  const [week, setWeek] = useState<SlotDay[] | undefined>(undefined);
  const { saving, run } = useCardSave(onSave);

  const serverWeek = normaliseWeek(delivery.slots.weekly);
  const shownWeek = week ?? serverWeek;
  const slots: Record<string, unknown> = {};
  const cutoffV = cutoff === undefined ? delivery.slots.cutoffMin : wholeIn(cutoff, 0, SB.maxCutoffMin);
  const advanceV = advance === undefined ? delivery.slots.advanceDays : wholeIn(advance, 0, SB.maxAdvanceDays);
  if (cutoff !== undefined && cutoffV !== null && cutoffV !== delivery.slots.cutoffMin) slots.cutoffMin = cutoffV;
  if (advance !== undefined && advanceV !== null && advanceV !== delivery.slots.advanceDays) slots.advanceDays = advanceV;
  const badDays = week ? slotWeekProblems(week) : [];
  if (week && !badDays.length && !sameValue(week, serverWeek)) slots.weekly = week;
  const valid = cutoffV !== null && advanceV !== null && !badDays.length;

  const patchDay = (day: number, patch: Partial<SlotDay>) =>
    setWeek(shownWeek.map((d) => (d.day === day ? { ...d, ...patch } : d)));

  return (
    <>
      <ReadOnly c={c} show={!canEdit} testID="settings-readonly-deliverySlots" />
      <SwitchRow
        c={c} label={t('commerce.storefront.slots.enabled')} hint={t('commerce.storefront.slots.enabledHint')}
        value={pending['delivery.slotsEnabled'] ?? delivery.slotsEnabled}
        disabled={!canEdit || 'delivery.slotsEnabled' in pending}
        onValueChange={(v) => onFlip('slotsEnabled', v)}
        testID="settings-switch-delivery-slotsEnabled"
      />
      <NumberRow
        c={c} label={t('commerce.storefront.slots.cutoff')} hint={t('commerce.storefront.slots.cutoffHint', { max: SB.maxCutoffMin })}
        value={cutoff ?? String(delivery.slots.cutoffMin)} onChangeText={setCutoff} disabled={!canEdit}
        error={cutoffV === null ? wholeErr(t, 0, SB.maxCutoffMin) : undefined} testID="slots-cutoff"
      />
      <NumberRow
        c={c} label={t('commerce.storefront.slots.advance')} hint={t('commerce.storefront.slots.advanceHint', { max: SB.maxAdvanceDays })}
        value={advance ?? String(delivery.slots.advanceDays)} onChangeText={setAdvance} disabled={!canEdit}
        error={advanceV === null ? wholeErr(t, 0, SB.maxAdvanceDays) : undefined} testID="slots-advance"
      />
      <Label c={c}>{t('commerce.storefront.slots.week')}</Label>
      {shownWeek.map((d) => (
        <SlotDayCard key={d.day} c={c} day={d} disabled={!canEdit} problem={badDays.includes(d.day)}
          onPatch={(p) => patchDay(d.day, p)} />
      ))}
      <SaveRow c={c} enabled={canEdit && valid && Object.keys(slots).length > 0} saving={saving}
        onPress={() => void run({ slots }, () => { setCutoff(undefined); setAdvance(undefined); setWeek(undefined); })}
        testID="settings-save-deliverySlots" />
    </>
  );
}

/**
 * One weekday of the delivery-slot week — the availability screen's day editor
 * shape (`DayCard`) without its breaks (delivery slots have none) and with the
 * slot rule's own limits (15–240 min, 1–500 orders a slot).
 */
function SlotDayCard({
  c, day, disabled, problem, onPatch,
}: { c: ColorScheme; day: SlotDay; disabled: boolean; problem: boolean; onPatch: (p: Partial<SlotDay>) => void }) {
  const { t } = useTranslation();
  const setWindow = (i: number, patch: Partial<{ from: string; to: string }>) =>
    onPatch({ windows: day.windows.map((w, j) => (j === i ? { ...w, ...patch } : w)) });
  return (
    <View style={[styles.day, { borderColor: problem ? c.error : c.divider }]} testID={`slot-day-${day.day}`}>
      <Pressable
        onPress={() => !disabled && onPatch({ isOpen: !day.isOpen })}
        accessibilityRole="switch"
        accessibilityState={{ checked: day.isOpen, disabled }}
        accessibilityLabel={t(`common.daysLong.${day.day}`)}
        style={styles.dayHead}
      >
        <Text style={[styles.dayName, { color: c.textPrimary }]}>{t(`common.daysLong.${day.day}`)}</Text>
        <Text style={[styles.note, { color: c.textSecondary }]}>
          {day.isOpen ? t('commerce.storefront.slots.open') : t('commerce.storefront.slots.closed')}
        </Text>
        <Switch value={day.isOpen} onValueChange={(v) => onPatch({ isOpen: v })} disabled={disabled} />
      </Pressable>
      {day.isOpen ? (
        <View style={styles.dayBody}>
          {day.windows.map((w, i) => (
            <View key={i} style={styles.windowRow}>
              <View style={styles.half}>
                <TimeField label={t('commerce.storefront.slots.from')} value={w.from} onChangeText={(v) => setWindow(i, { from: v })} disabled={disabled} />
              </View>
              <View style={styles.half}>
                <TimeField label={t('commerce.storefront.slots.to')} value={w.to} onChangeText={(v) => setWindow(i, { to: v })} disabled={disabled} />
              </View>
              {day.windows.length > 1 && !disabled ? (
                <IconButton icon="close" size={20} accessibilityLabel={t('commerce.storefront.slots.removeWindow')}
                  onPress={() => onPatch({ windows: day.windows.filter((_, j) => j !== i) })} />
              ) : null}
            </View>
          ))}
          {!disabled && day.windows.length < SB.maxWindows ? (
            <ActionRow>
              <PillButton c={c} tone="outline" icon="plus" label={t('commerce.storefront.slots.addWindow')}
                onPress={() => onPatch({ windows: [...day.windows, { from: '17:00', to: '20:00' }] })} />
            </ActionRow>
          ) : null}
          <Label c={c}>{t('commerce.storefront.slots.length')}</Label>
          <View pointerEvents={disabled ? 'none' : 'auto'}>
            <ChoiceChips<number>
              c={c}
              options={SLOT_LENGTHS.map((m) => ({ key: m, label: t('commerce.storefront.slots.minutes', { count: m }) }))}
              value={[day.slotMin]}
              onChange={(v) => onPatch({ slotMin: v[0] ?? 60 })}
            />
          </View>
          <View style={styles.capRow}>
            <Text style={[styles.capLabel, { color: c.textPrimary }]}>{t('commerce.storefront.slots.capacity')}</Text>
            <Stepper c={c} value={day.capacityPerSlot} min={1} max={SB.maxCapacity}
              onChange={(n) => !disabled && onPatch({ capacityPerSlot: Math.round(n) })}
              label={t('commerce.storefront.slots.capacityFor', { day: t(`common.daysLong.${day.day}`) })} />
          </View>
          {problem ? <Text style={[styles.error, { color: c.error }]}>{t('commerce.storefront.err.day')}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════ fulfilment

const FULFIL_SWITCHES = ['partialAcceptEnabled', 'substitutionEnabled', 'deliveryStaffEnabled', 'reserveStockAtPlace'] as const;

export function FulfilmentSection({
  c, canEdit, pending, onFlip, onSave, fulfilment,
}: SectionProps & { fulfilment: FulfilmentSettings }) {
  const { t } = useTranslation();
  const [proof, setProof] = useState<DeliveryProofMode | undefined>(undefined);
  const [hours, setHours] = useState<string | undefined>(undefined);
  const { saving, run } = useCardSave(onSave);

  const out: Record<string, unknown> = {};
  if (proof !== undefined && proof !== fulfilment.proofMode) out.proofMode = proof;
  const hoursV = hours === undefined ? fulfilment.autoCancelPlacedAfterHours : wholeIn(hours, 0, SB.maxAutoCancelHours, 0);
  if (hours !== undefined && hoursV !== null && hoursV !== fulfilment.autoCancelPlacedAfterHours) out.autoCancelPlacedAfterHours = hoursV;

  return (
    <>
      <ReadOnly c={c} show={!canEdit} testID="settings-readonly-fulfilment" />
      {FULFIL_SWITCHES.map((k) => (
        <SwitchRow
          key={k}
          c={c} label={t(`commerce.storefront.fulfil.${k}`)} hint={t(`commerce.storefront.fulfil.${k}Hint`)}
          value={pending[`fulfilment.${k}`] ?? fulfilment[k]}
          disabled={!canEdit || `fulfilment.${k}` in pending}
          onValueChange={(v) => onFlip(k, v)}
          testID={`settings-switch-fulfilment-${k}`}
        />
      ))}
      <Label c={c}>{t('commerce.storefront.fulfil.proofMode')}</Label>
      <View pointerEvents={canEdit ? 'auto' : 'none'}>
        <ChoiceChips<DeliveryProofMode>
          c={c}
          options={DELIVERY_PROOF_MODES.map((m) => ({ key: m, label: t(`commerce.storefront.fulfil.proof.${m}`) }))}
          value={[proof ?? fulfilment.proofMode]}
          onChange={(v) => setProof(v[0] ?? 'NONE')}
          testID="fulfil-proof"
        />
      </View>
      <NumberRow
        c={c} label={t('commerce.storefront.fulfil.autoCancel')} hint={t('commerce.storefront.fulfil.autoCancelHint')}
        value={hours ?? String(fulfilment.autoCancelPlacedAfterHours)} onChangeText={setHours} disabled={!canEdit}
        error={hoursV === null ? wholeErr(t, 0, SB.maxAutoCancelHours) : undefined} testID="fulfil-auto-cancel"
      />
      <SaveRow c={c} enabled={canEdit && hoursV !== null && Object.keys(out).length > 0} saving={saving}
        onPress={() => void run(out, () => { setProof(undefined); setHours(undefined); })} testID="settings-save-fulfilment" />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════ share

export function ShareSection({
  c, canEdit, pending, onFlip, share, featureOn, canReadLinks,
}: Omit<SectionProps, 'onSave'> & { share: ShareSettings; featureOn: boolean; canReadLinks: boolean }) {
  const { t, i18n } = useTranslation();
  const links = useShareLinks(featureOn && canReadLinks);
  const [busy, setBusy] = useState<'en' | 'hi' | null>(null);

  const poster = async (lang: 'en' | 'hi') => {
    setBusy(lang);
    try {
      await sharePoster(lang);
    } catch (e) {
      Alert.alert(t('commerce.storefront.share.posterFailed'), apiErrorMessage(e, t('commerce.common.loadFailed')));
    } finally {
      setBusy(null);
    }
  };
  const first: 'en' | 'hi' = String(i18n.language).startsWith('hi') ? 'hi' : 'en';
  const langs: Array<'en' | 'hi'> = first === 'hi' ? ['hi', 'en'] : ['en', 'hi'];
  const data = links.data;

  return (
    <>
      <ReadOnly c={c} show={!canEdit} testID="settings-readonly-share" />
      <SwitchRow
        c={c} label={t('commerce.storefront.share.enabled')} hint={t('commerce.storefront.share.enabledHint')}
        value={pending['share.enabled'] ?? share.enabled}
        disabled={!canEdit || 'share.enabled' in pending}
        onValueChange={(v) => onFlip('enabled', v)}
        testID="settings-switch-share-enabled"
      />
      {featureOn && !canReadLinks ? (
        <Text style={[styles.note, { color: c.textSecondary }]}>{t('commerce.storefront.share.noCatalog')}</Text>
      ) : null}
      {featureOn && canReadLinks ? (
        links.isPending ? <SkeletonList rows={2} /> : links.isError || !data ? (
          <Text style={[styles.error, { color: c.error }]}>{apiErrorMessage(links.error, t('commerce.common.loadFailed'))}</Text>
        ) : (
          <View style={styles.shareCard} testID="share-card">
            <Image source={{ uri: data.qrPngDataUrl }} style={styles.qr} accessibilityLabel={t('commerce.storefront.share.qr')} />
            <View style={styles.shareText}>
              <Label c={c}>{t('commerce.storefront.share.link')}</Label>
              <Text style={[styles.link, { color: c.primary }]} selectable testID="share-link">{data.storeUrl}</Text>
            </View>
            <ActionRow>
              <PillButton c={c} icon="share-variant" label={t('commerce.storefront.share.shareLink')}
                onPress={() => void Share.share({ message: t('commerce.storefront.share.message', { url: data.storeUrl }) }).catch(() => undefined)}
                testID="share-link-button" />
              {langs.map((lang) => (
                <PillButton key={lang} c={c} tone="outline" icon="file-pdf-box"
                  label={busy === lang ? t('common.loading') : t(`commerce.storefront.share.poster.${lang}`)}
                  onPress={() => void poster(lang)} disabled={busy !== null} testID={`share-poster-${lang}`} />
              ))}
            </ActionRow>
          </View>
        )
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  fold: { borderRadius: radii.card },
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 },
  foldTitle: { fontSize: 15.5, fontWeight: '700' },
  foldBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  note: { fontSize: 12.5, lineHeight: 18 },
  error: { fontSize: 12.5, lineHeight: 18 },
  label: { fontSize: 12.5, fontWeight: '700', marginTop: 4 },
  saveRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  table: { gap: 8 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  towerRow: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  rowName: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600' },
  feeInput: { width: 104, backgroundColor: 'transparent' },
  input: { backgroundColor: 'transparent' },
  day: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.card, overflow: 'hidden' },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 12 },
  dayName: { flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: '600' },
  dayBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  capRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  capLabel: { fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
  shareCard: { gap: 10, alignItems: 'flex-start' },
  qr: { width: 168, height: 168, borderRadius: radii.sm, alignSelf: 'center', backgroundColor: '#fff' },
  shareText: { alignSelf: 'stretch', gap: 2 },
  link: { fontSize: 14, fontWeight: '600' },
});
