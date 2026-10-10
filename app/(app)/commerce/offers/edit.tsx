import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { HelperText, IconButton, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueries, useQuery } from '@tanstack/react-query';

import { radii, themeColors, type ColorScheme } from '../../../../src/constants/colors';
import { Card, ErrorBlock, Loading, Screen } from '../../../../src/features/more/ui';
import { ActionRow, Banner, PillButton } from '../../../../src/features/p1/ui';
import { ChoiceChips } from '../../../../src/features/p2/ui';
import {
  CommerceHint, FeatureOff, NoAccess, NumberRow, PickedChip, ProductPickerSheet, SwitchRow, Tag,
} from '../../../../src/features/commerce/components/ui';
import { useCommerceAccess } from '../../../../src/features/commerce/access';
import { useCommerceSettings, useOffer, useSaveOffer } from '../../../../src/features/commerce/hooks';
import {
  emptyOfferForm, offerFormToInput, offerToForm, type OfferForm, type OfferFormErrors,
} from '../../../../src/features/commerce/logic';
import {
  channelsText, cleanCouponCode, foldsWithErrors, makeCouponCode, offerLocked, offerProductIds, type OfferFold,
} from '../../../../src/features/commerce/offersLogic';
import {
  OFFER_BENEFIT_TYPES, type OfferBenefitType, type OfferChannel, type OfferKind, type OfferScopeType,
} from '../../../../src/features/commerce/types';
import { catalogApi } from '../../../../src/features/catalog/api';
import { DateField } from '../../../../src/components/DateField';
import { TimeField } from '../../../../src/components/TimeField';
import { apiErrorMessage } from '../../../../src/api/axios';
import { newIdempotencyKey } from '../../../../src/lib/idempotency';
import { qk } from '../../../../src/lib/queryKeys';

const TILE_ICON: Record<OfferBenefitType, string> = {
  FLAT: 'currency-inr', PERCENT: 'percent-outline', BUY_X_GET_Y: 'gift-outline', FREE_DELIVERY: 'truck-delivery-outline',
};
const SCOPES: OfferScopeType[] = ['ORDER', 'PRODUCTS', 'CATEGORIES'];
const CHANNELS: OfferChannel[] = ['ONLINE', 'COUNTER'];
const DAYS = [0, 1, 2, 3, 4, 5, 6];
const NO_FOLDS: Record<OfferFold, boolean> = { who: false, which: false, where: false, limits: false, stacking: false };

type PickerFor = 'products' | 'exclude' | 'free' | null;

/**
 * Create / edit an offer (CONTRACT-commerce §8). The three-tap path sits at the
 * top — name, the kind of discount with its value, Save — and everything else
 * folds away under "Who and when", "Which items", "Where it works", "Limits"
 * and "Stacking". `?id=` edits; `?kind=COUPON` starts a coupon code.
 *
 * C-5: once a customer has used the offer its discount, items and code are
 * fixed — those inputs are locked here and the server refuses the same.
 */
export default function OfferEditScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const access = useCommerceAccess();
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  const id = typeof params.id === 'string' && params.id ? params.id : undefined;
  const editing = !!id;
  const canManage = access.offers.canManage;

  const offerQ = useOffer(id, canManage);
  const settingsQ = useCommerceSettings(canManage && access.settings.canView && !editing);
  // Unreadable settings → offer the coupon and let the server answer COUPONS_OFF.
  const couponsAllowed = settingsQ.data?.settings?.offers?.couponsEnabled !== false;

  const [form, setForm] = useState<OfferForm>(() => emptyOfferForm(params.kind === 'COUPON' ? 'COUPON' : 'AUTO'));
  const [errors, setErrors] = useState<OfferFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [folds, setFolds] = useState<Record<OfferFold, boolean>>(NO_FOLDS);
  const [picker, setPicker] = useState<PickerFor>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const keyRef = useRef(newIdempotencyKey('offer'));
  const loaded = useRef(false);
  const save = useSaveOffer();

  // The stored offer → the form, once.
  useEffect(() => {
    if (loaded.current || !offerQ.data) return;
    loaded.current = true;
    setForm(offerToForm(offerQ.data));
  }, [offerQ.data]);

  // Coupons switched off: a new offer can only be automatic.
  useEffect(() => {
    if (!editing && !couponsAllowed) setForm((f) => (f.kind === 'COUPON' ? { ...f, kind: 'AUTO', code: '' } : f));
  }, [editing, couponsAllowed]);

  // Names of the items an existing offer already names (at most 20 looked up).
  const lookupIds = useMemo(
    () => (offerQ.data ? offerProductIds(offerToForm(offerQ.data)) : []),
    [offerQ.data],
  );
  const nameQueries = useQueries({
    queries: lookupIds.map((pid) => ({
      queryKey: qk.catalog.product(pid),
      queryFn: () => catalogApi.getOne(pid),
      staleTime: 5 * 60_000,
    })),
  });
  const knownNames = useMemo(() => {
    const out: Record<string, string> = {};
    lookupIds.forEach((pid, i) => {
      const n = nameQueries[i]?.data?.name;
      if (n) out[pid] = n;
    });
    return { ...out, ...names };
  }, [lookupIds, nameQueries, names]);

  const categoriesQ = useQuery({
    queryKey: qk.catalog.categories(),
    queryFn: () => catalogApi.listCategories(),
    enabled: canManage && form.scopeType === 'CATEGORIES',
    staleTime: 60_000,
  });

  const title = editing ? t('commerce.offers.edit.titleEdit') : t('commerce.offers.edit.titleNew');
  if (!canManage) {
    return <Screen rise c={c} title={title}><NoAccess c={c} /></Screen>;
  }
  if (editing && offerQ.isPending) {
    return <Screen rise c={c} title={title}><Loading c={c} skeleton={4} /></Screen>;
  }
  if (editing && (offerQ.isError || !offerQ.data)) {
    return (
      <Screen rise c={c} title={title}>
        <ErrorBlock c={c} message={apiErrorMessage(offerQ.error, t('commerce.common.loadFailed'))} onRetry={() => void offerQ.refetch()} />
      </Screen>
    );
  }
  if (!editing && !access.has('OFFERS')) {
    return <Screen rise c={c} title={title}><FeatureOff c={c} canSwitch={access.settings.section.offers} /></Screen>;
  }

  const offer = offerQ.data;
  const locked = editing && offerLocked(offer);
  const archived = offer?.status === 'ARCHIVED';
  const err = (k: keyof OfferForm) => (errors[k] ? t(errors[k] as string) : undefined);

  function set<K extends keyof OfferForm>(k: K, v: OfferForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  }
  const toggleFold = (f: OfferFold) => setFolds((o) => ({ ...o, [f]: !o[f] }));

  const pickType = (type: OfferBenefitType) => {
    set('benefitType', type);
    // Buy X get Y needs items or categories — open the place where they are chosen.
    if (type === 'BUY_X_GET_Y' && form.scopeType === 'ORDER') setFolds((o) => ({ ...o, which: true }));
  };

  const onPick = (p: { _id: string; name: string }) => {
    setNames((n) => ({ ...n, [p._id]: p.name }));
    if (picker === 'free') { set('getProductId', p._id); return; }
    if (picker === 'products') {
      set('productIds', form.productIds.includes(p._id) ? form.productIds.filter((x) => x !== p._id) : [...form.productIds, p._id]);
    } else if (picker === 'exclude') {
      set('excludeProductIds', form.excludeProductIds.includes(p._id)
        ? form.excludeProductIds.filter((x) => x !== p._id) : [...form.excludeProductIds, p._id]);
    }
  };

  const onSave = () => {
    setServerError(null);
    const r = offerFormToInput(form);
    if (!r.ok) {
      setErrors(r.errors);
      const open = foldsWithErrors(r.errors);
      if (open.length) setFolds((o) => { const n = { ...o }; for (const f of open) n[f] = true; return n; });
      return;
    }
    setErrors({});
    save.mutate({ id, body: r.body, key: keyRef.current }, {
      onSuccess: (saved) => {
        keyRef.current = newIdempotencyKey('offer');
        const nid = saved?.id ?? saved?._id ?? id;
        router.replace((nid ? `/commerce/offers/${nid}` : '/commerce/offers') as Href);
      },
      onError: (e) => setServerError(apiErrorMessage(e, t('commerce.common.saveFailed'))),
    });
  };

  const saveButton = (testID: string) => (
    <View style={styles.saveRow}>
      <PillButton
        c={c}
        icon="content-save-outline"
        label={save.isPending ? t('common.saving') : t('common.save')}
        onPress={onSave}
        disabled={save.isPending || archived}
        testID={testID}
      />
    </View>
  );

  const pickerList = picker === 'products' ? form.productIds : picker === 'exclude' ? form.excludeProductIds
    : form.getProductId ? [form.getProductId] : [];
  const pickerTitle = picker === 'free' ? t('commerce.offers.edit.pickFreeItem')
    : picker === 'exclude' ? t('commerce.offers.edit.pickExclude') : t('commerce.offers.edit.pickItems');

  // ── fold summaries (one line each, so a closed fold still says what it holds)
  const whoCount = [form.minOrder.trim(), form.firstOrderOnly, form.startsOn, form.endsOn, form.daysOfWeek.length,
    form.timeWindows.length, form.tags.trim()].filter(Boolean).length;
  const whoSummary = whoCount ? t('commerce.offers.edit.rulesSet', { count: whoCount }) : t('commerce.offers.edit.whoNone');
  const whichSummary = form.scopeType === 'PRODUCTS'
    ? t('commerce.offers.itemsCount', { count: form.productIds.length })
    : form.scopeType === 'CATEGORIES'
      ? t('commerce.offers.categoriesCount', { count: form.categoryIds.length })
      : t('commerce.offers.scope.ORDER');
  const limitParts = [
    form.perCustomer.trim() ? t('commerce.offers.perCustomerLine', { count: Number(form.perCustomer) || 0 }) : '',
    form.total.trim() ? t('commerce.offers.totalLine', { count: Number(form.total) || 0 }) : '',
  ].filter(Boolean);
  const stackSummary = t(form.stackable ? 'commerce.offers.stackYes' : 'commerce.offers.stackNo', { priority: form.priority || '0' });

  return (
    <Screen rise c={c} title={title} scroll={false}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <CommerceHint c={c} helpKey="offerEdit" />
        {archived ? <Banner c={c} tone="error" body={t('errors.OFFER_ARCHIVED')} testID="offer-archived" /> : null}
        {locked ? (
          <Banner c={c} tone="warn" title={t('commerce.offers.edit.lockedTitle')} body={t('commerce.offers.edit.lockedBody')} testID="offer-locked" />
        ) : null}

        {/* ── 1. name */}
        <Card c={c}>
          <TextInput
            mode="outlined"
            label={t('commerce.offers.edit.name')}
            placeholder={t('commerce.offers.edit.namePlaceholder')}
            value={form.name}
            onChangeText={(s) => set('name', s.slice(0, 60))}
            error={!!errors.name}
            outlineStyle={{ borderRadius: radii.field }}
            style={styles.input}
            testID="offer-name"
          />
          {errors.name ? <HelperText type="error" style={styles.helper}>{err('name')}</HelperText> : null}

          {/* ── 2. type + value */}
          <Text style={[styles.label, { color: c.textSecondary }]}>{t('commerce.offers.edit.type')}</Text>
          <View style={styles.tiles}>
            {OFFER_BENEFIT_TYPES.map((type) => {
              const on = form.benefitType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => pickType(type)}
                  disabled={locked}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled: locked }}
                  accessibilityLabel={t(`commerce.offers.edit.tile.${type}`)}
                  testID={`offer-type-${type}`}
                  style={[
                    styles.tile,
                    { backgroundColor: on ? `${c.primary}1A` : c.surfaceVariant, borderColor: on ? c.primary : c.divider },
                    locked && !on && { opacity: 0.45 },
                  ]}
                >
                  <MaterialCommunityIcons name={TILE_ICON[type] as never} size={22} color={on ? c.primary : c.textSecondary} />
                  <Text style={[styles.tileText, { color: on ? c.primary : c.textPrimary }]} numberOfLines={2}>
                    {t(`commerce.offers.edit.tile.${type}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {form.benefitType === 'FLAT' ? (
            <NumberRow
              c={c} label={t('commerce.offers.edit.amount')} prefix="₹" value={form.amount}
              onChangeText={(s) => set('amount', s)} error={err('amount')} disabled={locked} testID="offer-amount"
            />
          ) : null}
          {form.benefitType === 'PERCENT' ? (
            <>
              <NumberRow
                c={c} label={t('commerce.offers.edit.percent')} suffix="%" value={form.percent}
                onChangeText={(s) => set('percent', s)} error={err('percent')} disabled={locked} testID="offer-percent"
              />
              <NumberRow
                c={c} label={t('commerce.offers.edit.maxDiscount')} hint={t('commerce.common.optional')} prefix="₹"
                value={form.maxDiscount} onChangeText={(s) => set('maxDiscount', s)} error={err('maxDiscount')}
                disabled={locked} testID="offer-max-discount"
              />
            </>
          ) : null}
          {form.benefitType === 'BUY_X_GET_Y' ? (
            <>
              <NumberRow
                c={c} label={t('commerce.offers.edit.buyQty')} value={form.buyQty} width={90}
                onChangeText={(s) => set('buyQty', s)} error={err('buyQty')} disabled={locked} testID="offer-buy"
              />
              <NumberRow
                c={c} label={t('commerce.offers.edit.getQty')} value={form.getQty} width={90}
                onChangeText={(s) => set('getQty', s)} error={err('getQty')} disabled={locked} testID="offer-get"
              />
              <NumberRow
                c={c} label={t('commerce.offers.edit.bxgyPercent')} hint={t('commerce.offers.edit.bxgyPercentHint')} suffix="%"
                value={form.percent} onChangeText={(s) => set('percent', s)} error={err('percent')} disabled={locked}
                testID="offer-bxgy-percent"
              />
              <Text style={[styles.label, { color: c.textSecondary }]}>{t('commerce.offers.edit.freeItem')}</Text>
              <Text style={[styles.hint, { color: c.textSecondary }]}>{t('commerce.offers.edit.freeItemHint')}</Text>
              <ItemChips
                c={c} ids={form.getProductId ? [form.getProductId] : []} names={knownNames}
                onRemove={locked ? undefined : () => set('getProductId', '')}
              />
              {!locked ? (
                <ActionRow>
                  <PillButton c={c} tone="outline" icon="gift-outline" label={t('commerce.offers.edit.pickFreeItem')} onPress={() => setPicker('free')} />
                </ActionRow>
              ) : null}
              {errors.scopeType ? <Text style={[styles.error, { color: c.error }]}>{err('scopeType')}</Text> : null}
            </>
          ) : null}
          {form.benefitType === 'FREE_DELIVERY' ? (
            <Text style={[styles.hint, { color: c.textSecondary }]}>{t('commerce.offers.edit.freeDeliveryHint')}</Text>
          ) : null}
        </Card>

        {/* ── how customers get it (kind + code) */}
        <Card c={c}>
          <Text style={[styles.label, { color: c.textSecondary }]}>{t('commerce.offers.edit.howGiven')}</Text>
          {editing ? (
            <View style={styles.kindFixed}>
              <Tag c={c} tone="info" label={t(`commerce.offers.kind.${form.kind}`)} />
              <Text style={[styles.hint, { color: c.textSecondary, flex: 1, minWidth: 0 }]}>{t('commerce.offers.edit.kindFixed')}</Text>
            </View>
          ) : (
            <>
              <ChoiceChips<OfferKind>
                c={c}
                options={[
                  { key: 'AUTO', label: t('commerce.offers.kind.AUTO') },
                  ...(couponsAllowed ? [{ key: 'COUPON' as OfferKind, label: t('commerce.offers.kind.COUPON') }] : []),
                ]}
                value={[form.kind]}
                onChange={(v) => set('kind', v[0] ?? 'AUTO')}
                testID="offer-kind"
              />
              {!couponsAllowed ? <Text style={[styles.hint, { color: c.textSecondary }]}>{t('commerce.offers.edit.couponsOffHint')}</Text> : null}
            </>
          )}
          {form.kind === 'COUPON' ? (
            <>
              <View style={styles.codeRow}>
                <TextInput
                  mode="outlined"
                  dense
                  label={t('commerce.offers.edit.code')}
                  value={form.code}
                  onChangeText={(s) => set('code', cleanCouponCode(s))}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  disabled={locked}
                  error={!!errors.code}
                  outlineStyle={{ borderRadius: radii.field }}
                  style={[styles.input, styles.codeInput]}
                  testID="offer-code"
                />
                {!locked ? (
                  <PillButton c={c} tone="outline" icon="dice-5-outline" label={t('commerce.offers.edit.makeCode')}
                    onPress={() => set('code', makeCouponCode())} testID="offer-make-code" />
                ) : null}
              </View>
              <Text style={[styles.hint, { color: errors.code ? c.error : c.textSecondary }]}>
                {errors.code ? err('code') : t('commerce.offers.edit.codeHint')}
              </Text>
            </>
          ) : null}
        </Card>

        {serverError ? <Banner c={c} tone="error" body={serverError} testID="offer-server-error" /> : null}
        {saveButton('offer-save')}

        {/* ── Who and when */}
        <Fold c={c} title={t('commerce.offers.edit.fold.who')} summary={whoSummary} open={folds.who} onToggle={() => toggleFold('who')}
          error={!!(errors.minOrder || errors.endsOn || errors.timeWindows || errors.tags)} testID="fold-who">
          <TextInput
            mode="outlined" dense label={t('commerce.offers.edit.description')} value={form.description}
            onChangeText={(s) => set('description', s.slice(0, 300))} multiline
            outlineStyle={{ borderRadius: radii.field }} style={styles.input} testID="offer-description"
          />
          <NumberRow
            c={c} label={t('commerce.offers.edit.minOrder')} hint={t('commerce.common.optional')} prefix="₹"
            value={form.minOrder} onChangeText={(s) => set('minOrder', s)} error={err('minOrder')} testID="offer-min-order"
          />
          <SwitchRow
            c={c} label={t('commerce.offers.edit.firstOrderOnly')} hint={t('commerce.offers.edit.firstOrderOnlyHint')}
            value={form.firstOrderOnly} onValueChange={(v) => set('firstOrderOnly', v)} testID="offer-first-order"
          />
          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <DateField label={t('commerce.offers.edit.startsOn')} value={form.startsOn} onChangeText={(s) => set('startsOn', s)} />
            </View>
            <View style={styles.pairItem}>
              <DateField label={t('commerce.offers.edit.endsOn')} value={form.endsOn} onChangeText={(s) => set('endsOn', s)} error={err('endsOn')} />
            </View>
          </View>
          {form.startsOn || form.endsOn ? (
            <ActionRow>
              <PillButton c={c} tone="outline" icon="calendar-remove-outline" label={t('commerce.offers.edit.clearDates')}
                onPress={() => { set('startsOn', ''); set('endsOn', ''); }} />
            </ActionRow>
          ) : null}
          <Text style={[styles.label, { color: c.textSecondary }]}>{t('commerce.offers.edit.days')}</Text>
          <Text style={[styles.hint, { color: c.textSecondary }]}>{t('commerce.offers.edit.daysHint')}</Text>
          <ChoiceChips<number>
            c={c} multi
            options={DAYS.map((d) => ({ key: d, label: t(`common.days.${d}`) }))}
            value={form.daysOfWeek}
            onChange={(v) => set('daysOfWeek', [...v].sort((a, b) => a - b))}
            testID="offer-days"
          />
          <Text style={[styles.label, { color: c.textSecondary }]}>{t('commerce.offers.edit.hours')}</Text>
          <Text style={[styles.hint, { color: c.textSecondary }]}>{t('commerce.offers.edit.hoursHint')}</Text>
          {form.timeWindows.map((w, i) => (
            <View key={i} style={styles.hoursRow}>
              <View style={styles.pairItem}>
                <TimeField
                  label={t('commerce.offers.edit.from')} value={w.from}
                  onChangeText={(s) => set('timeWindows', form.timeWindows.map((x, j) => (j === i ? { ...x, from: s } : x)))}
                />
              </View>
              <View style={styles.pairItem}>
                <TimeField
                  label={t('commerce.offers.edit.to')} value={w.to}
                  onChangeText={(s) => set('timeWindows', form.timeWindows.map((x, j) => (j === i ? { ...x, to: s } : x)))}
                />
              </View>
              <IconButton
                icon="close" size={22}
                onPress={() => set('timeWindows', form.timeWindows.filter((_, j) => j !== i))}
                accessibilityLabel={t('commerce.offers.edit.removeHours')}
              />
            </View>
          ))}
          {errors.timeWindows ? <Text style={[styles.error, { color: c.error }]}>{err('timeWindows')}</Text> : null}
          {form.timeWindows.length < 4 ? (
            <ActionRow>
              <PillButton c={c} tone="outline" icon="clock-plus-outline" label={t('commerce.offers.edit.addHours')}
                onPress={() => set('timeWindows', [...form.timeWindows, { from: '16:00', to: '19:00' }])} testID="offer-add-hours" />
            </ActionRow>
          ) : null}
          <TextInput
            mode="outlined" dense label={t('commerce.offers.edit.tags')} value={form.tags}
            onChangeText={(s) => set('tags', s)} error={!!errors.tags}
            outlineStyle={{ borderRadius: radii.field }} style={styles.input} testID="offer-tags"
          />
          <Text style={[styles.hint, { color: errors.tags ? c.error : c.textSecondary }]}>
            {errors.tags ? err('tags') : t('commerce.offers.edit.tagsHint')}
          </Text>
        </Fold>

        {/* ── Which items */}
        <Fold c={c} title={t('commerce.offers.edit.fold.which')} summary={whichSummary} open={folds.which}
          onToggle={() => toggleFold('which')} error={!!(errors.scopeType || errors.productIds || errors.categoryIds)} testID="fold-which">
          <View pointerEvents={locked ? 'none' : 'auto'} style={locked ? styles.lockedBox : undefined}>
            <ChoiceChips<OfferScopeType>
              c={c}
              options={SCOPES.map((s) => ({ key: s, label: t(`commerce.offers.scope.${s}`) }))}
              value={[form.scopeType]}
              onChange={(v) => set('scopeType', v[0] ?? 'ORDER')}
              testID="offer-scope"
            />
          </View>
          {errors.scopeType ? <Text style={[styles.error, { color: c.error }]}>{err('scopeType')}</Text> : null}
          {form.scopeType === 'PRODUCTS' ? (
            <>
              <ItemChips c={c} ids={form.productIds} names={knownNames}
                onRemove={locked ? undefined : (pid) => set('productIds', form.productIds.filter((x) => x !== pid))} />
              {errors.productIds ? <Text style={[styles.error, { color: c.error }]}>{err('productIds')}</Text> : null}
              {!locked ? (
                <ActionRow>
                  <PillButton c={c} tone="outline" icon="playlist-plus" label={t('commerce.offers.edit.pickItems')} onPress={() => setPicker('products')} testID="offer-pick-items" />
                </ActionRow>
              ) : null}
            </>
          ) : null}
          {form.scopeType === 'CATEGORIES' ? (
            <>
              {categoriesQ.isPending ? <Text style={[styles.hint, { color: c.textSecondary }]}>{t('common.loading')}</Text> : null}
              {categoriesQ.isError ? (
                <Text style={[styles.error, { color: c.error }]}>{apiErrorMessage(categoriesQ.error, t('commerce.common.loadFailed'))}</Text>
              ) : null}
              {categoriesQ.data && !categoriesQ.data.length ? (
                <Text style={[styles.hint, { color: c.textSecondary }]}>{t('commerce.offers.edit.noCategories')}</Text>
              ) : null}
              {categoriesQ.data?.length ? (
                <View pointerEvents={locked ? 'none' : 'auto'} style={locked ? styles.lockedBox : undefined}>
                  <ChoiceChips<string>
                    c={c} multi
                    options={categoriesQ.data.map((cat) => ({ key: cat._id, label: cat.name }))}
                    value={form.categoryIds}
                    onChange={(v) => set('categoryIds', v)}
                    testID="offer-categories"
                  />
                </View>
              ) : null}
              {errors.categoryIds ? <Text style={[styles.error, { color: c.error }]}>{err('categoryIds')}</Text> : null}
            </>
          ) : null}
          {form.scopeType !== 'PRODUCTS' ? (
            <>
              <Text style={[styles.label, { color: c.textSecondary }]}>{t('commerce.offers.edit.exclude')}</Text>
              <ItemChips c={c} ids={form.excludeProductIds} names={knownNames}
                onRemove={locked ? undefined : (pid) => set('excludeProductIds', form.excludeProductIds.filter((x) => x !== pid))} />
              {!locked ? (
                <ActionRow>
                  <PillButton c={c} tone="outline" icon="playlist-remove" label={t('commerce.offers.edit.pickExclude')} onPress={() => setPicker('exclude')} />
                </ActionRow>
              ) : null}
            </>
          ) : null}
        </Fold>

        {/* ── Where it works */}
        <Fold c={c} title={t('commerce.offers.edit.fold.where')} summary={channelsText(form.channels, t) || '—'} open={folds.where}
          onToggle={() => toggleFold('where')} error={!!errors.channels} testID="fold-where">
          <ChoiceChips<OfferChannel>
            c={c} multi
            options={CHANNELS.map((ch) => ({ key: ch, label: t(`commerce.offers.channel.${ch}`) }))}
            value={form.channels}
            onChange={(v) => set('channels', v)}
            testID="offer-channels"
          />
          <Text style={[styles.hint, { color: errors.channels ? c.error : c.textSecondary }]}>
            {errors.channels ? err('channels') : t('commerce.offers.edit.channelsHint')}
          </Text>
        </Fold>

        {/* ── Limits */}
        <Fold c={c} title={t('commerce.offers.edit.fold.limits')} summary={limitParts.join(' · ') || t('commerce.offers.noLimit')}
          open={folds.limits} onToggle={() => toggleFold('limits')} error={!!(errors.perCustomer || errors.total)} testID="fold-limits">
          <Text style={[styles.hint, { color: c.textSecondary }]}>{t('commerce.offers.edit.limitsHint')}</Text>
          <NumberRow c={c} label={t('commerce.offers.edit.perCustomer')} value={form.perCustomer}
            onChangeText={(s) => set('perCustomer', s)} error={err('perCustomer')} testID="offer-per-customer" />
          <NumberRow c={c} label={t('commerce.offers.edit.total')} value={form.total}
            onChangeText={(s) => set('total', s)} error={err('total')} testID="offer-total" />
        </Fold>

        {/* ── Stacking */}
        <Fold c={c} title={t('commerce.offers.edit.fold.stacking')} summary={stackSummary} open={folds.stacking}
          onToggle={() => toggleFold('stacking')} error={!!errors.priority} testID="fold-stacking">
          <SwitchRow c={c} label={t('commerce.offers.edit.stackable')} hint={t('commerce.offers.edit.stackableHint')}
            value={form.stackable} onValueChange={(v) => set('stackable', v)} testID="offer-stackable" />
          <NumberRow c={c} label={t('commerce.offers.edit.priority')} hint={t('commerce.offers.edit.priorityHint')}
            value={form.priority} onChangeText={(s) => set('priority', s.replace(/[^0-9-]/g, ''))} error={err('priority')} testID="offer-priority" />
        </Fold>

        {saveButton('offer-save-bottom')}
      </ScrollView>

      <ProductPickerSheet
        visible={picker !== null}
        onDismiss={() => setPicker(null)}
        title={pickerTitle}
        multi={picker !== 'free'}
        picked={pickerList}
        onPick={onPick}
        testID="offer-picker"
      />
    </Screen>
  );
}

/** A collapsible group: one 52dp header line with a summary, the body when open. */
function Fold({
  c, title, summary, open, onToggle, error, children, testID,
}: {
  c: ColorScheme; title: string; summary: string; open: boolean; onToggle: () => void; error?: boolean;
  children: React.ReactNode; testID?: string;
}) {
  return (
    <View style={[styles.fold, { backgroundColor: c.surface, borderColor: error ? c.error : c.divider }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        style={styles.foldHead}
        testID={testID}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.foldTitle, { color: error ? c.error : c.textPrimary }]}>{title}</Text>
          <Text style={[styles.hint, { color: c.textSecondary }]} numberOfLines={2}>{summary}</Text>
        </View>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={24} color={c.textSecondary} />
      </Pressable>
      {open ? <View style={styles.foldBody}>{children}</View> : null}
    </View>
  );
}

/** Picked items as chips; ids whose names are not known yet are counted on one line. */
function ItemChips({
  c, ids, names, onRemove,
}: { c: ColorScheme; ids: string[]; names: Record<string, string>; onRemove?: (id: string) => void }) {
  const { t } = useTranslation();
  if (!ids.length) return null;
  const named = ids.filter((pid) => names[pid]);
  const unknown = ids.length - named.length;
  return (
    <View style={styles.chips}>
      {named.map((pid) => (
        <PickedChip key={pid} c={c} label={names[pid]} onRemove={onRemove ? () => onRemove(pid) : undefined} testID={`picked-${pid}`} />
      ))}
      {unknown > 0 ? (
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          {named.length ? t('commerce.offers.edit.otherItems', { count: unknown }) : t('commerce.offers.itemsCount', { count: unknown })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  input: { backgroundColor: 'transparent' },
  helper: { marginTop: -8 },
  label: { fontSize: 12.5, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 17 },
  error: { fontSize: 12, lineHeight: 17 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexGrow: 1, flexBasis: '45%', minWidth: 130, minHeight: 60, borderRadius: radii.card, borderWidth: 1.5,
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  tileText: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  kindFixed: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  codeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  codeInput: { flexGrow: 1, flexBasis: 160, minWidth: 0, letterSpacing: 1 },
  saveRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  fold: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth },
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 14, paddingVertical: 8 },
  foldTitle: { fontSize: 15, fontWeight: '700' },
  foldBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  pair: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  pairItem: { flexGrow: 1, flexBasis: 130, minWidth: 0 },
  hoursRow: { flexDirection: 'row', alignItems: 'center', columnGap: 8 },
  lockedBox: { opacity: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
});
