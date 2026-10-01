import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable, useColorScheme } from 'react-native';
import { Text, Switch, SegmentedButtons, HelperText, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { AppButton } from '../../../components/AppButton';
import { parseRupeesToPaise, paiseToInput, formatPaise } from '../../../lib/money';
import {
  ServiceFormInput, ServiceMode, ServicePriceType, PartnerServiceRow, PartnerCategoryLite,
  SERVICE_MODES, SERVICE_PRICE_TYPES, MODE_LABEL_KEY, PRICE_TYPE_LABEL_KEY, PRICE_TYPE_HINT_KEY,
  MIN_DURATION_MIN, MAX_DURATION_MIN, MIN_SERVICE_CAPACITY, MAX_SERVICE_CAPACITY,
} from '../types';
import { durationLabel } from '../duration';
import { useCategoryModules } from '../../p2/useCategoryModules';
import { p2BodyPart, p2DraftFromRow, p2Problem, P2ServiceDraft } from '../p2Fields';
import { ServiceP2Fields } from './ServiceP2Fields';

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
  /**
   * Does this service have a resource of its own? The OPT-IN half of the
   * capacity control — see `capacityPerSlotOverride` in `../types.ts`.
   *
   * Kept as its own boolean rather than reading "is `capacity` filled in",
   * because the two answers are not the same: "use the day's number" has to be a
   * state the partner can be IN, not merely a box they have left empty. Off is
   * what the server means by an absent field, and it is the default for every
   * new service.
   */
  dedicated: boolean;
  /** Only sent while `dedicated`. A string because it is typed. */
  capacity: string;
  modes: ServiceMode[];
  advance: string;
  visitCharge: string;
  isActive: boolean;
  sortOrder: string;
}

const DURATION_CHIPS = [15, 30, 45, 60, 90, 120, 180];

const draftFromRow = (row: PartnerServiceRow | null, fallbackModes: readonly ServiceMode[]): Draft => ({
  name: row?.name ?? '',
  description: row?.description ?? '',
  categoryId: row?.categoryId ?? '',
  price: row && row.priceType !== 'QUOTE' ? paiseToInput(row.pricePaise) : '',
  priceType: row?.priceType ?? 'FIXED',
  durationMin: row?.durationMin ?? 60,
  // `!= null` catches both shapes the server treats as "no override": the field
  // absent on a service that never had one, and a stored `null` written by a
  // previous edit that cleared it.
  dedicated: row?.capacityPerSlotOverride != null,
  capacity: row?.capacityPerSlotOverride != null ? String(row.capacityPerSlotOverride) : '1',
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
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);

  const modeOptions = useMemo<ServiceMode[]>(
    () => (allowedModes && allowedModes.length ? allowedModes : [...SERVICE_MODES]),
    [allowedModes],
  );
  const [draft, setDraft] = useState<Draft>(() => draftFromRow(initial, modeOptions));

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  // P2 (buffer / SAC / GST / repair job): drawn and sent ONLY while APPOINTMENTS or JOBS is on.
  const categoryModules = useCategoryModules();
  const showP2 = categoryModules.has('APPOINTMENTS') || categoryModules.has('JOBS');
  const jobsOn = categoryModules.has('JOBS');
  const [p2, setP2] = useState<P2ServiceDraft>(() => p2DraftFromRow(initial));

  /** A category the service holds but the loaded list cannot name — see the chip row. */
  const orphanCategory = Boolean(draft.categoryId) && !categories.some((cat) => cat._id === draft.categoryId);

  const quoted = draft.priceType === 'QUOTE';
  const travels = draft.modes.includes('AT_CUSTOMER');

  const pricePaise = quoted ? 0 : parseRupeesToPaise(draft.price);
  const advancePaise = draft.advance ? parseRupeesToPaise(draft.advance) : 0;
  const visitPaise = draft.visitCharge ? parseRupeesToPaise(draft.visitCharge) : 0;

  /** The business says it works nowhere — every service will be refused, whatever is typed. */
  const worksNowhere = allowedModes !== null && allowedModes.length === 0;

  /**
   * The override, as a number, or `null` when what is typed is not one.
   *
   * `null` is the INVALID marker here (the `problem` list below turns it into a
   * sentence) and must not reach `submit`, where `null` means something quite
   * different — "put this service back on the day's capacity".
   */
  const capacityValue = ((): number | null => {
    if (!draft.dedicated) return null;
    const n = Number(draft.capacity);
    return Number.isInteger(n) && n >= MIN_SERVICE_CAPACITY && n <= MAX_SERVICE_CAPACITY ? n : null;
  })();

  const problem = ((): string | null => {
    if (worksNowhere) return t('services.form.worksNowhere');
    if (draft.name.trim().length < 2) return t('services.form.nameTooShort');
    if (!quoted && pricePaise === null) return t('services.form.priceInvalid');
    if (draft.advance && advancePaise === null) return t('services.form.advanceInvalid');
    if (draft.visitCharge && visitPaise === null) return t('services.form.visitInvalid');
    if (draft.durationMin < MIN_DURATION_MIN) return t('services.form.durationTooShort', { min: MIN_DURATION_MIN });
    if (draft.durationMin > MAX_DURATION_MIN) return t('services.form.durationTooLong');
    if (draft.dedicated && capacityValue === null) {
      return t('services.form.capacityInvalid', { min: MIN_SERVICE_CAPACITY, max: MAX_SERVICE_CAPACITY });
    }
    if (!draft.modes.length) return t('services.form.modeRequired');
    if (draft.priceType === 'FIXED' && (advancePaise || 0) > (pricePaise || 0)) {
      return t('services.form.advanceOverPrice');
    }
    const p2Key = p2Problem(p2, showP2);
    if (p2Key) return t(p2Key);
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
      /**
       * Three outcomes, and the two "no override" ones are NOT the same request.
       *
       *   a number  — this service has its own resource.
       *   `null`    — EDIT only: put it back on the day's capacity. The clear
       *               signal `updatePartnerServiceSchema` adds `.nullable()`
       *               for; without it there would be no way to undo an override
       *               once set, since an omitted key on a patch means "leave it
       *               alone".
       *   omitted   — CREATE only. `createPartnerServiceSchema` is optional but
       *               NOT nullable, so a `null` here is a 400. `undefined` is
       *               dropped by `JSON.stringify` before it reaches the wire,
       *               which is exactly the absent field the server reads as
       *               "use the day's number".
       *
       * `initial` is the honest discriminator between the two — it is `null`
       * precisely when this form is creating.
       */
      capacityPerSlotOverride: capacityValue ?? (initial ? null : undefined),
      modes: draft.modes,
      advancePaise: advancePaise || 0,
      // Sent as 0 rather than left stale when the job no longer travels.
      visitChargePaise: travels ? (visitPaise || 0) : 0,
      isActive: draft.isActive,
      sortOrder: Number(draft.sortOrder) || 0,
      // `{}` while neither module is on — today's body, byte for byte.
      ...p2BodyPart(p2, initial, showP2, jobsOn),
    });
  };

  const total = (pricePaise || 0) + (travels ? (visitPaise || 0) : 0);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.body}>
      {/* The same banner Orders and the availability editor use — this form has
          no Save button for a viewer, so without it the screen just refuses
          everything with no word about why. */}
      {!canManage && (
        <View style={[styles.readOnlyBanner, { backgroundColor: c.surfaceVariant }]}>
          <Text style={[styles.readOnlyText, { color: c.textSecondary }]}>
            {t('services.form.readOnlyBanner')}
          </Text>
        </View>
      )}

      <AppInput
        label={t('services.form.name')}
        placeholder={t('services.form.namePlaceholder')}
        value={draft.name}
        onChangeText={(v) => set('name', v)}
        disabled={!canManage}
      />

      <AppInput
        label={t('services.form.description')}
        value={draft.description}
        onChangeText={(v) => set('description', v)}
        multiline
        numberOfLines={2}
        disabled={!canManage}
      />

      {/*
        Always drawn, never conditional on the list having arrived.
        `/partner-categories/public` is a separate request from the service
        itself, and hiding the whole control when it comes back empty took the
        only way to CHANGE a category off the screen with nothing said — the
        partner is left to conclude the field does not exist. Web's picker is
        always there with a "Not set" option, and so is this one.

        `orphanCategory` is the case that made hiding it look safe: a service
        whose category is set but whose name we do not have. It gets its own
        selected chip so the row can be honest — the current choice is still
        the current choice, and "Not set" beside it is a deliberate clearing
        rather than the only tappable option.
      */}
      <View>
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('services.form.categorySection')}</Text>
        <View style={styles.chipRow}>
          {/* Only these two chips are copy; `cat.name` below is the category the
              platform named, shown back as it came. */}
          <Chip label={t('services.form.categoryNotSet')} active={!draft.categoryId} onPress={() => set('categoryId', '')} disabled={!canManage} c={c} />
          {orphanCategory && <Chip label={t('services.form.categoryCurrent')} active onPress={() => {}} c={c} />}
          {categories.map((cat) => (
            <Chip key={cat._id} label={cat.name} active={draft.categoryId === cat._id}
              onPress={() => set('categoryId', cat._id)} disabled={!canManage} c={c} />
          ))}
        </View>
        {categories.length === 0 && (
          <Text style={[styles.hint, { color: c.textSecondary }]}>
            {t('services.form.categoryUnavailable')}
          </Text>
        )}
      </View>

      <View>
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('services.form.priceSection')}</Text>
        <SegmentedButtons
          value={draft.priceType}
          onValueChange={(v) => set('priceType', v as ServicePriceType)}
          density="small"
          // Paper's own per-button `disabled`, so a viewer's tap is refused by
          // the control rather than absorbed by the handler. Same reason as the
          // `Chip`s above and the fields below.
          /* `pt`, not `t` — the callback used to shadow the translator. The
             `value` stays the wire literal; only the label is looked up. */
          buttons={SERVICE_PRICE_TYPES.map((pt) => ({ value: pt, label: t(PRICE_TYPE_LABEL_KEY[pt]), disabled: !canManage }))}
        />
        <Text style={[styles.hint, { color: c.textSecondary }]}>{t(PRICE_TYPE_HINT_KEY[draft.priceType])}</Text>
      </View>

      {!quoted && (
        <AppInput
          label={t('services.form.price')}
          placeholder={t('services.form.pricePlaceholder')}
          value={draft.price}
          onChangeText={(v) => set('price', v)}
          keyboardType="numeric"
          disabled={!canManage}
        />
      )}

      <View>
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('services.form.durationSection')}</Text>
        <View style={styles.chipRow}>
          {DURATION_CHIPS.map((m) => (
            <Chip key={m} label={durationLabel(m, t)} active={draft.durationMin === m}
              onPress={() => set('durationMin', m)} disabled={!canManage} c={c} />
          ))}
        </View>
        <AppInput
          label={t('services.form.minutes')}
          value={String(draft.durationMin)}
          onChangeText={(v) => set('durationMin', Number(v) || 0)}
          keyboardType="numeric"
          disabled={!canManage}
        />
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          {t('services.form.durationHint')}
        </Text>
      </View>

      {/*
        HOW MANY AT ONCE — an opt-in, and the default is visibly "the day's".

        The switch is off for every service until the partner says otherwise, and
        that is the contract rather than a UI preference: an absent
        `capacityPerSlotOverride` means "use the day's `capacityPerSlot`", so a
        form that always posted a number would pin every service to one customer
        at a time and quietly override the day capacity of every partner who had
        set one. `submit` above is what keeps that promise on the wire.

        The sentence under the switch is doing the real work. "5 chairs but one
        massage room" is the entire reason the field exists and a bare number
        does not convey it: an override is a DEDICATED RESOURCE, so this service
        is counted against its own bookings only AND stops counting against the
        shop's shared pool. Without that second half a partner would reasonably
        read "1" as "three haircuts now make the empty massage room unbookable",
        which is the opposite of what it does.
      */}
      <View>
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('services.form.capacitySection')}</Text>
        <View style={styles.switchBox}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>
              {t('services.form.dedicated')}
            </Text>
            <Text style={[styles.hint, { color: c.textSecondary }]}>
              {t(draft.dedicated ? 'services.form.dedicatedOn' : 'services.form.dedicatedOff')}
            </Text>
          </View>
          <Switch
            value={draft.dedicated}
            onValueChange={(v) => { if (canManage) set('dedicated', v); }}
            disabled={!canManage}
          />
        </View>
        {draft.dedicated && (
          <>
            <AppInput
              label={t('services.form.capacity')}
              value={draft.capacity}
              onChangeText={(v) => set('capacity', v.replace(/\D/g, '').slice(0, 3))}
              keyboardType="numeric"
              disabled={!canManage}
            />
            <Text style={[styles.hint, { color: c.textSecondary }]}>
              {t('services.form.capacityHint')}
            </Text>
          </>
        )}
      </View>

      <View>
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{t('services.form.whereSection')}</Text>
        {worksNowhere ? (
          <View style={[styles.lockBox, { backgroundColor: c.warning + '18', borderColor: c.warning }]}>
            <MaterialCommunityIcons name="lock-outline" size={16} color={c.warning} />
            <Text style={[styles.lockText, { color: c.textPrimary }]}>
              {t('services.form.whereLocked')}
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
                    label={t(MODE_LABEL_KEY[m])}
                    active={on}
                    onPress={() => set('modes', on ? draft.modes.filter((x) => x !== m) : [...draft.modes, m])}
                    disabled={!canManage}
                    c={c}
                  />
                );
              })}
            </View>
            {allowedModes && allowedModes.length > 0 && allowedModes.length < SERVICE_MODES.length && (
              <Text style={[styles.hint, { color: c.textSecondary }]}>
                {t('services.form.modesLimited', {
                  modes: allowedModes.map((m) => t(MODE_LABEL_KEY[m]).toLowerCase()).join(t('services.form.modesJoin')),
                })}
              </Text>
            )}
          </>
        )}
      </View>

      {travels && (
        <AppInput
          label={t('services.form.visitCharge')}
          placeholder={t('services.form.zero')}
          value={draft.visitCharge}
          onChangeText={(v) => set('visitCharge', v)}
          keyboardType="numeric"
          disabled={!canManage}
        />
      )}

      <AppInput
        label={t('services.form.advance')}
        placeholder={t('services.form.zero')}
        value={draft.advance}
        onChangeText={(v) => set('advance', v)}
        keyboardType="numeric"
        disabled={!canManage}
      />

      {!quoted && total > 0 && (
        <View style={[styles.summaryBox, { backgroundColor: c.surfaceVariant }]}>
          <Text style={[styles.summaryText, { color: c.textPrimary }]}>
            {t('services.form.summary', {
              visit: travels ? t('services.form.summaryVisit') : '',
              total: formatPaise(total),
              advance: advancePaise
                ? t('services.form.summaryAdvance', { amount: formatPaise(advancePaise) })
                : t('services.form.summaryNoAdvance'),
            })}
          </Text>
        </View>
      )}

      {showP2 && <ServiceP2Fields c={c} value={p2} onChange={setP2} jobs={jobsOn} disabled={!canManage} />}

      <View style={styles.switchBox}>
        <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>{t('services.form.offered')}</Text>
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
            {t('services.form.stopOffering')}
          </Button>
        ) : (
          <Button mode="outlined" onPress={footer.onReoffer} style={styles.footerBtn}>
            {t('services.form.offerAgain')}
          </Button>
        )
      )}
    </ScrollView>
  );
}

/**
 * `disabled` rather than an `onPress` that quietly evaluates to `false`, which
 * is what every caller here used to pass. A view-only staff member tapped a
 * category or a duration and got nothing back — no change, no explanation —
 * while the fields either side of these chips refused them visibly. The row is
 * dimmed as a whole so the CHOSEN chip stays readable: it is still the answer
 * they opened the screen to read.
 */
function Chip({ label, active, onPress, disabled, c }: {
  label: string; active: boolean; onPress: () => void; disabled?: boolean; c: ReturnType<typeof themeColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.chip,
        disabled && styles.chipReadOnly,
        { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider },
      ]}
    >
      <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 4, paddingBottom: 40 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  chipReadOnly: { opacity: 0.65 },
  readOnlyBanner: { borderRadius: radii.sm, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 10 },
  readOnlyText: { fontSize: 11.5, fontWeight: '600' },
  hint: { fontSize: 11.5, marginTop: 4, lineHeight: 16 },
  lockBox: { flexDirection: 'row', gap: 8, borderRadius: radii.md, borderWidth: 1, padding: 12, alignItems: 'flex-start' },
  lockText: { fontSize: 12, flex: 1, lineHeight: 17 },
  summaryBox: { borderRadius: radii.md, padding: 12, marginTop: 4 },
  summaryText: { fontSize: 12.5, lineHeight: 18 },
  switchBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, marginTop: 4 },
  footerBtn: { marginTop: 4, borderRadius: radii.card },
});
