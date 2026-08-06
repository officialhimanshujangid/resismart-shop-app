import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable, useColorScheme } from 'react-native';
import { Text, Switch, SegmentedButtons, HelperText, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { themeColors, radii } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { AppButton } from '../../../components/AppButton';
import { parseRupeesToPaise, paiseToInput, formatPaise } from '../../../lib/money';
import {
  ServiceFormInput, ServiceMode, ServicePriceType, PartnerServiceRow, PartnerCategoryLite,
  SERVICE_MODES, SERVICE_PRICE_TYPES, MODE_LABEL, PRICE_TYPE_LABEL, PRICE_TYPE_HINT,
  MIN_DURATION_MIN, MAX_DURATION_MIN,
} from '../types';

/**
 * One service, added or changed — the mobile twin of the web `ServiceDialog`.
 *
 * Same three non-obvious rules as the web form:
 * 1. Money is typed in rupees and sent in paise, via `parseRupeesToPaise`.
 * 2. A QUOTE service sends `pricePaise: 0` — the field is required by the
 *    schema but meaningless on a quoted job.
 * 3. `allowedModes` (what the business itself does) comes from the caller,
 *    never assumed here. `null` = "we could not ask" (offer both, let the
 *    server's own refusal be the answer); `[]` = "this business works
 *    nowhere yet" (block the form with a real reason instead of a 400 after
 *    a resident-facing name and price have been typed in).
 */

interface Draft {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  priceType: ServicePriceType;
  durationMin: number;
  modes: ServiceMode[];
  advance: string;
  visitCharge: string;
  isActive: boolean;
  sortOrder: string;
}

const DURATION_CHIPS = [15, 30, 45, 60, 90, 120, 180];

const durationLabel = (min: number): string => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} hr${h === 1 ? '' : 's'}${m ? ` ${m} min` : ''}`;
};

const draftFromRow = (row: PartnerServiceRow | null, fallbackModes: readonly ServiceMode[]): Draft => ({
  name: row?.name ?? '',
  description: row?.description ?? '',
  categoryId: row?.categoryId ?? '',
  price: row && row.priceType !== 'QUOTE' ? paiseToInput(row.pricePaise) : '',
  priceType: row?.priceType ?? 'FIXED',
  durationMin: row?.durationMin ?? 60,
  modes: row?.modes?.length ? row.modes : (fallbackModes.length ? [fallbackModes[0]] : []),
  advance: row?.advancePaise ? paiseToInput(row.advancePaise) : '',
  visitCharge: row?.visitChargePaise ? paiseToInput(row.visitChargePaise) : '',
  isActive: row?.isActive !== false,
  sortOrder: String(row?.sortOrder ?? 0),
});

export function ServiceForm({
  initial, categories, allowedModes, canManage, submitLabel, submitting, onSubmit, footer,
}: {
  /** `null` for a new service. */
  initial: PartnerServiceRow | null;
  categories: PartnerCategoryLite[];
  allowedModes: ServiceMode[] | null;
  canManage: boolean;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (body: ServiceFormInput) => void;
  /** Edit screen only — withdraw / offer-again, below the Save button. */
  footer?: {
    isActive: boolean;
    withdrawing: boolean;
    onWithdraw: () => void;
    onReoffer: () => void;
  };
}) {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);

  const modeOptions = useMemo<ServiceMode[]>(
    () => (allowedModes && allowedModes.length ? allowedModes : [...SERVICE_MODES]),
    [allowedModes],
  );
  const [draft, setDraft] = useState<Draft>(() => draftFromRow(initial, modeOptions));

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  const quoted = draft.priceType === 'QUOTE';
  const travels = draft.modes.includes('AT_CUSTOMER');

  const pricePaise = quoted ? 0 : parseRupeesToPaise(draft.price);
  const advancePaise = draft.advance ? parseRupeesToPaise(draft.advance) : 0;
  const visitPaise = draft.visitCharge ? parseRupeesToPaise(draft.visitCharge) : 0;

  /** The business says it works nowhere — every service will be refused, whatever is typed. */
  const worksNowhere = allowedModes !== null && allowedModes.length === 0;

  const problem = ((): string | null => {
    if (worksNowhere) return 'Set where your business works in Settings before you offer a service.';
    if (draft.name.trim().length < 2) return 'Give the service a name residents will recognise.';
    if (!quoted && pricePaise === null) return 'That price is not an amount — try 499 or 499.50.';
    if (draft.advance && advancePaise === null) return 'That advance is not an amount.';
    if (draft.visitCharge && visitPaise === null) return 'That visit charge is not an amount.';
    if (draft.durationMin < MIN_DURATION_MIN) return `A job has to be at least ${MIN_DURATION_MIN} minutes long.`;
    if (draft.durationMin > MAX_DURATION_MIN) return 'Longer than a working day is not a booking, it is a project.';
    if (!draft.modes.length) return 'Say where this happens.';
    if (draft.priceType === 'FIXED' && (advancePaise || 0) > (pricePaise || 0)) {
      return 'The advance cannot be more than the price of the service.';
    }
    return null;
  })();

  const submit = () => {
    if (problem || !canManage) return;
    onSubmit({
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      categoryId: draft.categoryId || null,
      pricePaise: pricePaise || 0,
      priceType: draft.priceType,
      durationMin: draft.durationMin,
      modes: draft.modes,
      advancePaise: advancePaise || 0,
      // Sent as 0 rather than left stale when the job no longer travels.
      visitChargePaise: travels ? (visitPaise || 0) : 0,
      isActive: draft.isActive,
      sortOrder: Number(draft.sortOrder) || 0,
    });
  };

  const total = (pricePaise || 0) + (travels ? (visitPaise || 0) : 0);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.body}>
      <AppInput
        label="What is it called?"
        placeholder="AC servicing, deep clean, haircut…"
        value={draft.name}
        onChangeText={(v) => set('name', v)}
        disabled={!canManage}
      />

      <AppInput
        label="What it includes (optional)"
        value={draft.description}
        onChangeText={(v) => set('description', v)}
        multiline
        numberOfLines={2}
        disabled={!canManage}
      />

      {categories.length > 0 && (
        <View>
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>KIND OF WORK</Text>
          <View style={styles.chipRow}>
            <Chip label="Not set" active={!draft.categoryId} onPress={() => canManage && set('categoryId', '')} c={c} />
            {categories.map((cat) => (
              <Chip key={cat._id} label={cat.name} active={draft.categoryId === cat._id}
                onPress={() => canManage && set('categoryId', cat._id)} c={c} />
            ))}
          </View>
        </View>
      )}

      <View>
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>HOW IT IS PRICED</Text>
        <SegmentedButtons
          value={draft.priceType}
          onValueChange={(v) => canManage && set('priceType', v as ServicePriceType)}
          density="small"
          buttons={SERVICE_PRICE_TYPES.map((t) => ({ value: t, label: PRICE_TYPE_LABEL[t] }))}
        />
        <Text style={[styles.hint, { color: c.textSecondary }]}>{PRICE_TYPE_HINT[draft.priceType]}</Text>
      </View>

      {!quoted && (
        <AppInput
          label="Price (₹)"
          placeholder="499"
          value={draft.price}
          onChangeText={(v) => set('price', v)}
          keyboardType="numeric"
          disabled={!canManage}
        />
      )}

      <View>
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>HOW LONG IT TAKES</Text>
        <View style={styles.chipRow}>
          {DURATION_CHIPS.map((m) => (
            <Chip key={m} label={durationLabel(m)} active={draft.durationMin === m}
              onPress={() => canManage && set('durationMin', m)} c={c} />
          ))}
        </View>
        <AppInput
          label="Minutes"
          value={String(draft.durationMin)}
          onChangeText={(v) => set('durationMin', Number(v) || 0)}
          keyboardType="numeric"
          disabled={!canManage}
        />
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          The time blocked out in your diary, so nobody else is booked on top.
        </Text>
      </View>

      <View>
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>WHERE IT HAPPENS</Text>
        {worksNowhere ? (
          <View style={[styles.lockBox, { backgroundColor: c.warning + '18', borderColor: c.warning }]}>
            <MaterialCommunityIcons name="lock-outline" size={16} color={c.warning} />
            <Text style={[styles.lockText, { color: c.textPrimary }]}>
              Your business has not said where it works, so there is nowhere to offer this yet. Set it in
              Settings → Business details, then come back.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.chipRow}>
              {modeOptions.map((m) => {
                const on = draft.modes.includes(m);
                return (
                  <Chip
                    key={m}
                    label={MODE_LABEL[m]}
                    active={on}
                    onPress={() => canManage && set('modes', on ? draft.modes.filter((x) => x !== m) : [...draft.modes, m])}
                    c={c}
                  />
                );
              })}
            </View>
            {allowedModes && allowedModes.length > 0 && allowedModes.length < SERVICE_MODES.length && (
              <Text style={[styles.hint, { color: c.textSecondary }]}>
                Your business is set up for {allowedModes.map((m) => MODE_LABEL[m].toLowerCase()).join(' and ')} only.
              </Text>
            )}
          </>
        )}
      </View>

      {travels && (
        <AppInput
          label="Visit charge (₹, optional)"
          placeholder="0"
          value={draft.visitCharge}
          onChangeText={(v) => set('visitCharge', v)}
          keyboardType="numeric"
          disabled={!canManage}
        />
      )}

      <AppInput
        label="Advance to hold the slot (₹, optional)"
        placeholder="0"
        value={draft.advance}
        onChangeText={(v) => set('advance', v)}
        keyboardType="numeric"
        disabled={!canManage}
      />

      {!quoted && total > 0 && (
        <View style={[styles.summaryBox, { backgroundColor: c.surfaceVariant }]}>
          <Text style={[styles.summaryText, { color: c.textPrimary }]}>
            A customer booking this{travels ? ' as a home visit' : ''} is billed {formatPaise(total)}
            {advancePaise ? `, of which ${formatPaise(advancePaise)} is taken up front.` : '.'}
          </Text>
        </View>
      )}

      <View style={styles.switchBox}>
        <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>Offered to residents</Text>
        <Switch value={draft.isActive} onValueChange={(v) => set('isActive', v)} disabled={!canManage} />
      </View>

      {problem && !!draft.name && (
        <HelperText type="error" visible>{problem}</HelperText>
      )}

      {canManage && (
        <AppButton label={submitLabel} onPress={submit} loading={submitting} disabled={!!problem} />
      )}

      {footer && canManage && (
        footer.isActive ? (
          <Button
            mode="outlined"
            onPress={footer.onWithdraw}
            loading={footer.withdrawing}
            disabled={footer.withdrawing}
            textColor={c.error}
            style={styles.footerBtn}
          >
            Stop offering
          </Button>
        ) : (
          <Button mode="outlined" onPress={footer.onReoffer} style={styles.footerBtn}>
            Offer it again
          </Button>
        )
      )}
    </ScrollView>
  );
}

function Chip({ label, active, onPress, c }: { label: string; active: boolean; onPress: () => void; c: ReturnType<typeof themeColors> }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider }]}
    >
      <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 4, paddingBottom: 40 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  hint: { fontSize: 11.5, marginTop: 4, lineHeight: 16 },
  lockBox: { flexDirection: 'row', gap: 8, borderRadius: radii.md, borderWidth: 1, padding: 12, alignItems: 'flex-start' },
  lockText: { fontSize: 12, flex: 1, lineHeight: 17 },
  summaryBox: { borderRadius: radii.md, padding: 12, marginTop: 4 },
  summaryText: { fontSize: 12.5, lineHeight: 18 },
  switchBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, marginTop: 4 },
  footerBtn: { marginTop: 4, borderRadius: radii.card },
});
