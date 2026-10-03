import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { themeColors, type ColorScheme } from '../../../src/constants/colors';
import { Card, ErrorBlock, Loading, Row, Screen, SectionLabel } from '../../../src/features/more/ui';
import { PillButton } from '../../../src/features/p1/ui';
import { CommerceHint, NoAccess, NumberRow, SwitchRow, Tag } from '../../../src/features/commerce/components/ui';
import { useCommerceAccess, type CommerceAccess } from '../../../src/features/commerce/access';
import { useCommerceSettings, useSaveCommerceSettings } from '../../../src/features/commerce/hooks';
import { COMMERCE_BOUNDS, type CommerceSettings, type CommerceSettingsPatch, type CommerceSettingsPayload } from '../../../src/features/commerce/types';
import { apiErrorMessage } from '../../../src/api/axios';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { formatPaise, paiseToInput, parseRupeesToPaise } from '../../../src/lib/money';
import { qk } from '../../../src/lib/queryKeys';
import { useDeliveryAreas } from '../../../src/features/commerce/storefrontApi';
import {
  DeliveryFeeSection, DeliverySlotsSection, FoldCard, FulfilmentSection, ShareSection, StorefrontSection, type SocietyOption,
} from '../../../src/features/commerce/components/StorefrontSettingsCards';
import { useCanPauseOrders } from '../../../src/features/commerce/components/PauseOrdersCard';
import {
  deliveryOf, fulfilmentOf, isPausedNow, shareOf, storefrontOf,
} from '../../../src/features/commerce/storefrontApi';

/**
 * Online shop settings (CONTRACT-commerce §1.1, §6, §7, §14 W/S-1), in two groups:
 *   Online orders  — Storefront (pause, hours enforcement, minimum order), Delivery
 *                    fee, Delivery slots, Fulfilment, Share (C1/C2; STOREFRONT_MANAGE);
 *   Grow your shop — Offers, Catalogue, Store credit, Points, Referral, Growth,
 *                    Counter (C3–C6; each section also needs its own row).
 * Every card is folded to one line (the first open) so the screen is not a wall.
 *
 * A switch saves on ONE tap (only that key of its section is sent; shown at
 * once, put back with a message if the server refuses). Numbers are typed
 * locally and saved per section with that section's Save, sending only the
 * keys that changed. A section the role cannot change is drawn read-only with
 * the reason on one line — the server checks the same rows.
 *
 * The C1/C2 cards live in `features/commerce/components/StorefrontSettingsCards.tsx`.
 */

type SectionKey = 'offers' | 'catalog' | 'wallet' | 'loyalty' | 'referral' | 'growth' | 'counter';
type Perm = keyof CommerceAccess['settings']['section'];
/** Which module opens each C3–C6 card (`SECTION_MODULES` on the server; a closed one answers 404 MODULE_NOT_AVAILABLE). */
const SECTION_VISIBLE: Record<SectionKey, keyof CommerceAccess['settings']['visible']> = {
  offers: 'offers', catalog: 'catalog', wallet: 'wallet', loyalty: 'wallet', referral: 'wallet', growth: 'growth', counter: 'counter',
};

interface SwitchField { kind: 'switch'; key: string; label: string; hint?: string; perm: Perm }
interface NumField {
  kind: 'int' | 'rupees'; key: string; label: string; hint?: string; perm: Perm;
  min: number; max: number; prefix?: string; suffix?: string;
}
type Field = SwitchField | NumField;

interface SectionDef { section: SectionKey; title: string; icon: string; fields: Field[] }

const rupeesText = (p: number | undefined) => paiseToInput(p ?? 0).replace(/\.00$/, '');

/** What a number field holds → the value to send, or null when it is not valid. */
function parseField(f: NumField, s: string): number | null {
  const raw = s.trim();
  if (f.kind === 'int') {
    if (!raw && f.min === 0) return 0;
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return n < f.min || n > f.max ? null : n;
  }
  if (!raw && f.min === 0) return 0;
  const p = parseRupeesToPaise(raw);
  if (p === null || p < f.min || p > f.max) return null;
  return p;
}

const sectionOf = (s: CommerceSettings | undefined, section: SectionKey): Record<string, unknown> =>
  ((s?.[section] as Record<string, unknown> | undefined) ?? {});

export default function CommerceSettingsScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const access = useCommerceAccess();
  const query = useCommerceSettings(access.settings.canView);
  const save = useSaveCommerceSettings();
  const client = useQueryClient();

  /** Switch taps in flight: `section.key` → the value shown until the server answers. */
  const [pending, setPending] = useState<Record<string, boolean>>({});
  /** Typed numbers: `section` → `key` → text. */
  const [drafts, setDrafts] = useState<Partial<Record<SectionKey, Record<string, string>>>>({});
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  /** Which cards are unfolded; the first (Storefront) starts open. */
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({ storefront: true });
  const canPause = useCanPauseOrders();
  // The societies (and towers) the fee tables may name — `GET /partners/me/commerce/delivery-areas`.
  const areas = useDeliveryAreas(access.settings.visible.online && access.settings.canView);

  if (!access.settings.canView) {
    return (
      <Screen c={c} title={t('commerce.settings.title')}>
        <NoAccess c={c} />
      </Screen>
    );
  }

  const settings = query.data?.settings;
  const sections = sectionDefs(t);

  const applyPayload = (payload: CommerceSettingsPayload | undefined) => {
    if (payload && payload.settings) client.setQueryData(qk.commerce.settings(), payload);
  };

  const toggleCard = (key: string) => setOpenCards((o) => ({ ...o, [key]: !o[key] }));

  /** One section's changed values → PUT; true when the server took them. */
  const saveValues = async (section: string, values: Record<string, unknown>): Promise<boolean> => {
    try {
      const payload = await save.mutateAsync({
        patch: { [section]: values } as CommerceSettingsPatch,
        key: newIdempotencyKey('settings'),
      });
      applyPayload(payload);
      setSnack(t('commerce.common.saved'));
      return true;
    } catch (e) {
      Alert.alert(t('commerce.common.saveFailed'), apiErrorMessage(e, t('commerce.common.saveFailed')));
      return false;
    }
  };

  const flip = async (section: string, key: string, value: boolean) => {
    const id = `${section}.${key}`;
    setPending((p) => ({ ...p, [id]: value }));
    try {
      const payload = await save.mutateAsync({
        patch: { [section]: { [key]: value } } as CommerceSettingsPatch,
        key: newIdempotencyKey('settings'),
      });
      applyPayload(payload);
      setSnack(t('commerce.common.saved'));
    } catch (e) {
      Alert.alert(t('commerce.common.saveFailed'), apiErrorMessage(e, t('commerce.common.saveFailed')));
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  };

  const saveSection = async (def: SectionDef) => {
    const changes = changedValues(def, settings, drafts[def.section]);
    if (!changes.ok || !Object.keys(changes.values).length) return;
    setSavingSection(def.section);
    try {
      const payload = await save.mutateAsync({
        patch: { [def.section]: changes.values } as CommerceSettingsPatch,
        key: newIdempotencyKey('settings'),
      });
      applyPayload(payload);
      setDrafts((d) => ({ ...d, [def.section]: {} }));
      setSnack(t('commerce.common.saved'));
    } catch (e) {
      Alert.alert(t('commerce.common.saveFailed'), apiErrorMessage(e, t('commerce.common.saveFailed')));
    } finally {
      setSavingSection(null);
    }
  };

  let body: React.ReactNode;
  if (query.isPending) body = <Loading c={c} />;
  else if (query.isError || !settings) {
    body = <ErrorBlock c={c} message={apiErrorMessage(query.error, t('commerce.common.loadFailed'))} onRetry={() => void query.refetch()} />;
  } else {
    const features = query.data?.features ?? [];
    body = (
      <>
        <Card c={c}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('commerce.settings.featuresOn')}</Text>
          {features.length ? (
            <View style={styles.tags} testID="settings-features">
              {features.map((f) => <Tag key={f} c={c} tone="good" label={t(`commerce.settings.feature.${f}`)} />)}
            </View>
          ) : (
            <Text style={[styles.note, { color: c.textSecondary }]}>{t('commerce.settings.featuresNone')}</Text>
          )}
        </Card>

        {/* ── Online orders (C1/C2): module ORDERS only; STOREFRONT_MANAGE alone writes these sections. */}
        {access.settings.visible.online ? <SectionLabel c={c}>{t('commerce.storefront.groupOnline')}</SectionLabel> : null}
        {access.settings.visible.online ? (() => {
          const payload = query.data;
          const canEdit = access.settings.section.storefront;
          const common = (section: string) => ({
            c, canEdit, pending,
            onFlip: (key: string, v: boolean) => void flip(section, key, v),
            onSave: (values: Record<string, unknown>) => saveValues(section, values),
          });
          const sf = storefrontOf(payload);
          const delivery = deliveryOf(payload);
          const fulfilment = fulfilmentOf(payload);
          const share = shareOf(payload);
          // The places this shop delivers to (home, linked, ordered-from, already in a fee rule), with their towers.
          const societies: SocietyOption[] = (areas.data ?? []).map((a) => ({ id: a.societyId, name: a.name, towers: a.towers }));
          const onOff = (on: boolean) => t(on ? 'commerce.storefront.on' : 'commerce.storefront.off');
          const fulfilOn = [fulfilment.partialAcceptEnabled, fulfilment.substitutionEnabled, fulfilment.deliveryStaffEnabled,
            fulfilment.reserveStockAtPlace, fulfilment.proofMode !== 'NONE', fulfilment.autoCancelPlacedAfterHours > 0].filter(Boolean).length;
          return (
            <>
              <FoldCard c={c} title={t('commerce.storefront.title')} open={!!openCards.storefront} onToggle={() => toggleCard('storefront')}
                summary={isPausedNow(sf) ? t('commerce.storefront.pause.pausedTitle') : t('commerce.storefront.pause.openTitle')}
                testID="settings-fold-storefront">
                {payload ? <StorefrontSection {...common('storefront')} payload={payload} canPause={canPause} /> : null}
              </FoldCard>
              <FoldCard c={c} title={t('commerce.storefront.fee.title')} open={!!openCards.deliveryFee} onToggle={() => toggleCard('deliveryFee')}
                summary={onOff(delivery.feeEnabled)} testID="settings-fold-deliveryFee">
                <DeliveryFeeSection {...common('delivery')} delivery={delivery} societies={societies} />
              </FoldCard>
              <FoldCard c={c} title={t('commerce.storefront.slots.title')} open={!!openCards.deliverySlots} onToggle={() => toggleCard('deliverySlots')}
                summary={onOff(delivery.slotsEnabled)} testID="settings-fold-deliverySlots">
                <DeliverySlotsSection {...common('delivery')} delivery={delivery} />
              </FoldCard>
              <FoldCard c={c} title={t('commerce.storefront.fulfil.title')} open={!!openCards.fulfilment} onToggle={() => toggleCard('fulfilment')}
                summary={fulfilOn ? t('commerce.storefront.switchesOn', { count: fulfilOn }) : t('commerce.storefront.allOff')}
                testID="settings-fold-fulfilment">
                <FulfilmentSection {...common('fulfilment')} fulfilment={fulfilment} />
              </FoldCard>
              <FoldCard c={c} title={t('commerce.storefront.share.title')} open={!!openCards.share} onToggle={() => toggleCard('share')}
                summary={onOff(share.enabled)} testID="settings-fold-share">
                <ShareSection c={c} canEdit={canEdit} pending={pending} onFlip={(key, v) => void flip('share', key, v)}
                  share={share} featureOn={features.includes('SHARE')} canReadLinks={access.catalog.canView} />
              </FoldCard>
            </>
          );
        })() : null}

        {/* ── Grow your shop (C3–C6) */}
        <SectionLabel c={c}>{t('commerce.storefront.groupGrow')}</SectionLabel>
        {sections.filter((def) => access.settings.visible[SECTION_VISIBLE[def.section]]).map((def) => (
          <SectionCard
            key={def.section}
            c={c}
            open={!!openCards[def.section]}
            onToggle={() => toggleCard(def.section)}
            def={def}
            access={access}
            values={sectionOf(settings, def.section)}
            pending={pending}
            draft={drafts[def.section] ?? {}}
            saving={savingSection === def.section}
            onFlip={(key, v) => void flip(def.section, key, v)}
            onType={(key, s) => setDrafts((d) => ({ ...d, [def.section]: { ...(d[def.section] ?? {}), [key]: s } }))}
            onSave={() => void saveSection(def)}
            settings={settings}
          />
        ))}
      </>
    );
  }

  return (
    <Screen
      c={c}
      title={t('commerce.settings.title')}
      scroll={false}
      floating={
        <Snackbar visible={!!snack} onDismiss={() => setSnack(null)} duration={2000} testID="settings-snack">
          {snack ?? ''}
        </Snackbar>
      }
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <CommerceHint c={c} helpKey="settings" />
        {body}
      </ScrollView>
    </Screen>
  );
}

/** The changed, valid values of a section's number fields (only those keys are sent). */
function changedValues(
  def: SectionDef, settings: CommerceSettings | undefined, draft: Record<string, string> | undefined,
): { ok: boolean; values: Record<string, number> } {
  const values: Record<string, number> = {};
  let ok = true;
  const current = sectionOf(settings, def.section);
  for (const f of def.fields) {
    if (f.kind === 'switch') continue;
    const text = draft?.[f.key];
    if (text === undefined) continue;
    const v = parseField(f, text);
    if (v === null) { ok = false; continue; }
    if (v !== current[f.key]) values[f.key] = v;
  }
  return { ok, values };
}

function SectionCard({
  c, open, onToggle, def, access, values, pending, draft, saving, onFlip, onType, onSave, settings,
}: {
  c: ColorScheme;
  open: boolean;
  onToggle: () => void;
  def: SectionDef;
  access: CommerceAccess;
  values: Record<string, unknown>;
  pending: Record<string, boolean>;
  draft: Record<string, string>;
  saving: boolean;
  onFlip: (key: string, v: boolean) => void;
  onType: (key: string, s: string) => void;
  onSave: () => void;
  settings: CommerceSettings | undefined;
}) {
  const { t } = useTranslation();
  const allowed = (p: Perm) => access.settings.section[p];
  const anyLocked = def.fields.some((f) => !allowed(f.perm));
  const numbers = def.fields.filter((f): f is NumField => f.kind !== 'switch');
  const changes = changedValues(def, settings, draft);
  const canSave = numbers.some((f) => allowed(f.perm)) && changes.ok && Object.keys(changes.values).length > 0 && !saving;

  const switchesOn = def.fields.filter((f) => f.kind === 'switch' && (pending[`${def.section}.${f.key}`] ?? !!values[f.key])).length;
  return (
    <FoldCard
      c={c}
      title={def.title}
      summary={switchesOn ? t('commerce.storefront.switchesOn', { count: switchesOn }) : t('commerce.storefront.allOff')}
      open={open}
      onToggle={onToggle}
      testID={`settings-fold-${def.section}`}
    >
      {anyLocked ? (
        <Text style={[styles.note, { color: c.textSecondary }]} testID={`settings-readonly-${def.section}`}>
          {t('commerce.settings.readOnly')}
        </Text>
      ) : null}
      {def.fields.map((f) => {
        const disabled = !allowed(f.perm);
        if (f.kind === 'switch') {
          const id = `${def.section}.${f.key}`;
          const value = pending[id] ?? !!values[f.key];
          return (
            <SwitchRow
              key={f.key}
              c={c}
              label={f.label}
              hint={f.hint}
              value={value}
              disabled={disabled || id in pending}
              onValueChange={(v) => onFlip(f.key, v)}
              testID={`settings-switch-${def.section}-${f.key}`}
            />
          );
        }
        const server = values[f.key] as number | undefined;
        const text = draft[f.key] ?? (f.kind === 'rupees' ? rupeesText(server) : String(server ?? 0));
        const bad = draft[f.key] !== undefined && parseField(f, text) === null;
        return (
          <NumberRow
            key={f.key}
            c={c}
            label={f.label}
            hint={f.hint}
            value={text}
            prefix={f.prefix}
            suffix={f.suffix}
            disabled={disabled}
            error={bad ? (f.kind === 'rupees'
              ? t('commerce.settings.err.rupees', { min: formatPaise(f.min), max: formatPaise(f.max) })
              : t('commerce.settings.err.range', { min: f.min, max: f.max })) : undefined}
            onChangeText={(s) => onType(f.key, s)}
            testID={`settings-number-${def.section}-${f.key}`}
          />
        );
      })}
      {def.section === 'counter' && allowed('counter') ? (
        <Row
          c={c}
          icon="keyboard-outline"
          title={t('commerce.settings.counter.quickKeys')}
          subtitle={t('commerce.settings.counter.quickKeysHint')}
          onPress={() => router.push('/commerce/quick-keys' as Href)}
        />
      ) : null}
      {numbers.length ? (
        <View style={styles.saveRow}>
          <PillButton
            c={c}
            icon="content-save-outline"
            label={saving ? t('common.saving') : t('common.save')}
            onPress={onSave}
            disabled={!canSave}
            testID={`settings-save-${def.section}`}
          />
        </View>
      ) : null}
    </FoldCard>
  );
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function sectionDefs(t: TFn): SectionDef[] {
  const B = COMMERCE_BOUNDS;
  return [
    {
      section: 'offers', title: t('commerce.settings.offers.title'), icon: 'ticket-percent-outline',
      fields: [
        { kind: 'switch', key: 'enabled', perm: 'offers', label: t('commerce.settings.offers.enabled'), hint: t('commerce.settings.offers.enabledHint') },
        { kind: 'switch', key: 'couponsEnabled', perm: 'offers', label: t('commerce.settings.offers.couponsEnabled'), hint: t('commerce.settings.offers.couponsEnabledHint') },
        { kind: 'switch', key: 'allowAtCounter', perm: 'offers', label: t('commerce.settings.offers.allowAtCounter'), hint: t('commerce.settings.offers.allowAtCounterHint') },
        { kind: 'int', key: 'maxOffersPerOrder', perm: 'offers', min: 1, max: B.maxOffersPerOrder, label: t('commerce.settings.offers.maxOffersPerOrder'), hint: t('commerce.settings.offers.maxOffersPerOrderHint', { max: B.maxOffersPerOrder }) },
      ],
    },
    {
      section: 'catalog', title: t('commerce.settings.catalog.title'), icon: 'package-variant',
      fields: [
        { kind: 'switch', key: 'bundlesEnabled', perm: 'catalog', label: t('commerce.settings.catalog.bundlesEnabled'), hint: t('commerce.settings.catalog.bundlesHint') },
        { kind: 'switch', key: 'variantsEnabled', perm: 'catalog', label: t('commerce.settings.catalog.variantsEnabled'), hint: t('commerce.settings.catalog.variantsHint') },
      ],
    },
    {
      section: 'wallet', title: t('commerce.settings.wallet.title'), icon: 'wallet-outline',
      fields: [
        { kind: 'switch', key: 'enabled', perm: 'wallet', label: t('commerce.settings.wallet.enabled'), hint: t('commerce.settings.wallet.enabledHint') },
        { kind: 'switch', key: 'refundToCreditDefault', perm: 'wallet', label: t('commerce.settings.wallet.refundToCreditDefault') },
        { kind: 'switch', key: 'allowAtCounter', perm: 'wallet', label: t('commerce.settings.wallet.allowAtCounter'), hint: t('commerce.settings.wallet.allowAtCounterHint') },
      ],
    },
    {
      section: 'loyalty', title: t('commerce.settings.loyalty.title'), icon: 'star-circle-outline',
      fields: [
        { kind: 'switch', key: 'enabled', perm: 'wallet', label: t('commerce.settings.loyalty.enabled'), hint: t('commerce.settings.loyalty.enabledHint') },
        { kind: 'switch', key: 'earnAtCounter', perm: 'wallet', label: t('commerce.settings.loyalty.earnAtCounter') },
        { kind: 'int', key: 'pointsPer100Rupees', perm: 'wallet', min: 0, max: B.maxPointsPer100Rupees, label: t('commerce.settings.loyalty.pointsPer100Rupees'), hint: t('commerce.settings.loyalty.pointsPer100RupeesHint', { max: B.maxPointsPer100Rupees }) },
        { kind: 'rupees', key: 'pointValuePaise', perm: 'wallet', min: 1, max: B.maxPointValuePaise, prefix: '₹', label: t('commerce.settings.loyalty.pointValue'), hint: t('commerce.settings.loyalty.pointValueHint') },
        { kind: 'int', key: 'minRedeemPoints', perm: 'wallet', min: 0, max: 1_000_000, label: t('commerce.settings.loyalty.minRedeemPoints') },
        { kind: 'int', key: 'maxRedeemPercent', perm: 'wallet', min: 0, max: B.maxRedeemPercent, suffix: '%', label: t('commerce.settings.loyalty.maxRedeemPercent'), hint: t('commerce.settings.loyalty.maxRedeemPercentHint') },
        { kind: 'int', key: 'expiryDays', perm: 'wallet', min: 0, max: B.maxExpiryDays, label: t('commerce.settings.loyalty.expiryDays'), hint: t('commerce.settings.loyalty.expiryDaysHint', { max: B.maxExpiryDays }) },
      ],
    },
    {
      section: 'referral', title: t('commerce.settings.referral.title'), icon: 'account-multiple-plus-outline',
      fields: [
        { kind: 'switch', key: 'enabled', perm: 'wallet', label: t('commerce.settings.referral.enabled'), hint: t('commerce.settings.referral.enabledHint') },
        { kind: 'int', key: 'referrerPoints', perm: 'wallet', min: 0, max: 1_000_000, label: t('commerce.settings.referral.referrerPoints') },
        { kind: 'int', key: 'refereePoints', perm: 'wallet', min: 0, max: 1_000_000, label: t('commerce.settings.referral.refereePoints') },
        { kind: 'rupees', key: 'minQualifyingOrderPaise', perm: 'wallet', min: 0, max: 10_000_000_00, prefix: '₹', label: t('commerce.settings.referral.minQualifyingOrder'), hint: t('commerce.settings.referral.minQualifyingOrderHint') },
      ],
    },
    {
      section: 'growth', title: t('commerce.settings.growth.title'), icon: 'bullhorn-outline',
      fields: [
        { kind: 'switch', key: 'broadcastEnabled', perm: 'growthBroadcast', label: t('commerce.settings.growth.broadcastEnabled'), hint: t('commerce.settings.growth.broadcastHint') },
        { kind: 'int', key: 'maxBroadcastsPerWeek', perm: 'growthBroadcast', min: 0, max: B.maxBroadcastsPerWeek, label: t('commerce.settings.growth.maxBroadcastsPerWeek'), hint: t('commerce.settings.growth.maxBroadcastsHint', { max: B.maxBroadcastsPerWeek }) },
        { kind: 'switch', key: 'backInStockEnabled', perm: 'growthStock', label: t('commerce.settings.growth.backInStockEnabled'), hint: t('commerce.settings.growth.backInStockHint') },
      ],
    },
    {
      section: 'counter', title: t('commerce.settings.counter.title'), icon: 'cash-register',
      fields: [
        { kind: 'switch', key: 'holdEnabled', perm: 'counter', label: t('commerce.settings.counter.holdEnabled'), hint: t('commerce.settings.counter.holdHint') },
        { kind: 'switch', key: 'splitTenderEnabled', perm: 'counter', label: t('commerce.settings.counter.splitTenderEnabled'), hint: t('commerce.settings.counter.splitHint') },
      ],
    },
  ];
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 96, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  cardTitle: { fontSize: 15.5, fontWeight: '700' },
  note: { fontSize: 12.5, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  saveRow: { flexDirection: 'row', justifyContent: 'flex-end' },
});
