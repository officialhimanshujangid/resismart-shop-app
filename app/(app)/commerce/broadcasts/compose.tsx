import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { IconButton, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../../src/constants/colors';
import { apiErrorMessage } from '../../../../src/api/axios';
import { newIdempotencyKey } from '../../../../src/lib/idempotency';
import { formatPaise } from '../../../../src/lib/money';
import { DateField } from '../../../../src/components/DateField';
import { useDebouncedValue } from '../../../../src/features/billing/useDebouncedValue';
import { Card, SectionLabel } from '../../../../src/features/more/ui';
import { PillButton } from '../../../../src/features/p1/ui';
import { ChoiceChips, Sheet } from '../../../../src/features/p2/ui';
import { HelpButton } from '../../../../src/features/help/HelpButton';
import { useCommerceAccess } from '../../../../src/features/commerce/access';
import { useAudience, useBroadcasts, useOffers, useSaveBroadcast, useSendBroadcast } from '../../../../src/features/commerce/hooks';
import { cleanSegment, offerBenefitText, scheduleProblem, weeklyLeft } from '../../../../src/features/commerce/logic';
import { whenText } from '../../../../src/features/commerce/format';
import { SPEND_TIERS, type BroadcastSegment, type SpendTier } from '../../../../src/features/commerce/types';
import { CommerceHint, FeatureOff, NoAccess, PickedChip, ProductPickerSheet } from '../../../../src/features/commerce/components/ui';

type When = 'NOW' | 'LATER';
type HasOrdered = 'ANY' | 'YES' | 'NO';

/** Most towers / blocks one message can name (backend `segmentSchema.blockNames` max 50, each ≤ 40). */
const MAX_BLOCKS = 50;
const commaList = (s: string, max: number, len: number): string[] =>
  [...new Set(s.split(',').map((x) => x.trim().slice(0, len)).filter(Boolean))].slice(0, max);

/**
 * MP-1 (c1): the segment fields this screen has a control for. Anything else a
 * stored message carries (a society limit set on the web — `societyIds` — or a
 * field a later web adds) is kept as it was and sent back untouched, because
 * the server REPLACES the whole segment on an edit (`$set.segment`).
 */
const EDITED_HERE = new Set(['spendTiers', 'spendWindowDays', 'hasOrdered', 'lastOrderOlderThanDays', 'tags', 'blockNames']);
/** Every field `cleanSegment` copies; anything else is passed through as it came. */
const SEGMENT_KEYS = new Set([...EDITED_HERE, 'societyIds']);
function keptSegmentFields(s: BroadcastSegment | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s ?? {})) if (!EDITED_HERE.has(k) && v !== undefined) out[k] = v;
  return out;
}

/**
 * Compose an offer message (C5): words, an optional offer / item to open, WHO
 * gets it (with a live count — counts only, never names), and when. The simple
 * case is three taps: title, message, Send now. Both writes carry a key minted
 * when this screen opened, so a retry on a bad line never sends twice.
 */
export default function ComposeBroadcastScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { id } = useLocalSearchParams<{ id?: string }>();
  const access = useCommerceAccess();
  const canUse = access.broadcasts.canSend && access.has('BROADCAST');
  const list = useBroadcasts(access.broadcasts.canSend);
  const existing = id ? list.data?.data.find((b) => b.id === id) : undefined;
  const offers = useOffers({ status: 'ACTIVE' }, canUse && access.offers.canView);
  const save = useSaveBroadcast();
  const send = useSendBroadcast();
  const saveKey = useRef(newIdempotencyKey('broadcast'));
  const sendKey = useRef(newIdempotencyKey('broadcast-send'));

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [offerId, setOfferId] = useState<string | undefined>(undefined);
  const [product, setProduct] = useState<{ id: string; name: string } | null>(null);
  const [tiers, setTiers] = useState<SpendTier[]>([]);
  const [windowDays, setWindowDays] = useState(90);
  const [hasOrdered, setHasOrdered] = useState<HasOrdered>('ANY');
  const [quietDays, setQuietDays] = useState(0);
  const [tags, setTags] = useState('');
  const [blocks, setBlocks] = useState('');
  const [kept, setKept] = useState<Record<string, unknown>>({});
  const [when, setWhen] = useState<When>('NOW');
  const [at, setAt] = useState('');
  const [pickingOffer, setPickingOffer] = useState(false);
  const [pickingItem, setPickingItem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seeded = useRef(false);

  // Editing: fill the form once from the stored message.
  useEffect(() => {
    if (!existing || seeded.current) return;
    seeded.current = true;
    setTitle(existing.title);
    setBody(existing.body);
    setOfferId(existing.offerId);
    if (existing.productId) setProduct({ id: existing.productId, name: '…' });
    const s = existing.segment ?? {};
    setTiers(s.spendTiers ?? []);
    if (s.spendWindowDays) setWindowDays(s.spendWindowDays);
    setHasOrdered(s.hasOrdered === true ? 'YES' : s.hasOrdered === false ? 'NO' : 'ANY');
    setQuietDays(s.lastOrderOlderThanDays ?? 0);
    setTags((s.tags ?? []).join(', '));
    setBlocks((s.blockNames ?? []).join(', '));
    setKept(keptSegmentFields(s));
    if (existing.scheduledAt) {
      const d = new Date(existing.scheduledAt);
      const pad = (n: number) => String(n).padStart(2, '0');
      setWhen('LATER');
      setAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
    }
  }, [existing]);

  const segment: BroadcastSegment = useMemo(() => {
    const own = cleanSegment({
      ...(kept as BroadcastSegment),
      ...(tiers.length ? { spendTiers: tiers, spendWindowDays: windowDays } : {}),
      ...(hasOrdered !== 'ANY' ? { hasOrdered: hasOrdered === 'YES' } : {}),
      ...(quietDays ? { lastOrderOlderThanDays: quietDays } : {}),
      tags: commaList(tags, 10, 30),
      blockNames: commaList(blocks, MAX_BLOCKS, 40),
    });
    // A field cleanSegment does not know (added on the web later) rides along as it came.
    const unknown: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(kept)) if (!SEGMENT_KEYS.has(k)) unknown[k] = v;
    return { ...unknown, ...own } as BroadcastSegment;
  }, [kept, tiers, windowDays, hasOrdered, quietDays, tags, blocks]);
  const debouncedSegment = useDebouncedValue(segment, 500);
  const audience = useAudience(debouncedSegment, canUse);

  if (!access.broadcasts.canSend) return <Frame c={c} title={t('commerce.broadcasts.new')}><NoAccess c={c} /></Frame>;
  if (!access.has('BROADCAST')) return <Frame c={c} title={t('commerce.broadcasts.new')}><FeatureOff c={c} canSwitch={access.settings.section.growthBroadcast} /></Frame>;

  // Unknown until the list answers — never block Send on an allowance not yet read (the server checks it anyway).
  const left = list.data ? weeklyLeft(list.data.weekly) : Number.POSITIVE_INFINITY;
  const scheduledAt = when === 'LATER' && at ? new Date(at.replace(' ', 'T')) : null;
  const schedule = when === 'LATER' ? (at ? scheduleProblem(scheduledAt) : 'PAST') : 'NONE';
  const count = audience.data?.count;
  const pickedOffer = offers.data?.data.find((o) => o.id === offerId);

  const validate = (): string | null => {
    if (!title.trim()) return t('commerce.broadcasts.err.title');
    if (!body.trim()) return t('commerce.broadcasts.err.body');
    if (schedule === 'PAST') return t('commerce.broadcasts.err.past');
    if (schedule === 'TOO_FAR') return t('commerce.broadcasts.err.tooFar');
    return null;
  };

  const payload = () => ({
    title: title.trim().slice(0, 60),
    body: body.trim().slice(0, 240),
    ...(offerId ? { offerId } : {}),
    ...(product ? { productId: product.id } : {}),
    segment,
    ...(when === 'LATER' && scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
  });

  /** Save (create / update) and, when asked, send — a SCHEDULED one just keeps its new time. */
  const go = async (andSend: boolean) => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError(null);
    setBusy(true);
    try {
      // >>> GAP-C-SHOP — "Send now" on a draft that still holds a time clears that time on the SAME message
      // (`scheduledAt: null`), instead of cancelling it and starting a fresh one.
      const clearSchedule = !!existing && when === 'NOW' && !!existing.scheduledAt;
      const saved = await save.mutateAsync({ id: existing?.id, body: payload(), key: saveKey.current, clearSchedule });
      // <<< GAP-C-SHOP
      if (andSend && saved.status === 'DRAFT') {
        const out = await send.mutateAsync({ id: saved.id, key: sendKey.current });
        Alert.alert(
          out.status === 'SCHEDULED' ? t('commerce.broadcasts.scheduledTitle') : t('commerce.broadcasts.sentTitle'),
          out.status === 'SCHEDULED'
            ? t('commerce.broadcasts.scheduledToast', { when: whenText(out.scheduledAt, t) })
            : t('commerce.broadcasts.sentToast', { count: out.audienceCount ?? 0 }),
        );
      }
      saveKey.current = newIdempotencyKey('broadcast');
      sendKey.current = newIdempotencyKey('broadcast-send');
      router.back();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sendLabel = when === 'LATER' ? t('commerce.broadcasts.schedule') : t('commerce.broadcasts.sendNow');
  const sendBlocked = when === 'NOW' && left === 0;
  const scheduledEdit = existing?.status === 'SCHEDULED';

  // MP-1 (c2): like the web, a send (or a new schedule) is confirmed first — "Send this offer now?".
  const confirmThenSend = () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    const later = when === 'LATER';
    const n = count ?? 0;
    Alert.alert(
      later ? t('commerce.broadcasts.confirmScheduleTitle') : t('commerce.broadcasts.confirmSendTitle'),
      later
        ? t('commerce.broadcasts.confirmScheduleBody', { when: whenText(scheduledAt ?? undefined, t), count: n })
        : n > 0 ? t('commerce.broadcasts.confirmSendBody', { count: n }) : t('commerce.broadcasts.confirmSendBodyNone'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: sendLabel, onPress: () => void go(true) },
      ],
    );
  };
  // Same as the web preview: the shop is named generically ("your shop"); the push itself carries the real name.
  const shopName = t('commerce.broadcasts.previewShop');

  return (
    <Frame
      c={c}
      title={existing ? t('commerce.broadcasts.editTitle') : t('commerce.broadcasts.new')}
      footer={(
        <View style={styles.footer}>
          {!scheduledEdit ? (
            <PillButton c={c} tone="outline" icon="content-save-outline" label={t('commerce.broadcasts.saveDraft')} onPress={() => void go(false)} disabled={busy} testID="broadcast-save-draft" />
          ) : null}
          <PillButton
            c={c}
            icon={when === 'LATER' ? 'calendar-clock' : 'send'}
            label={scheduledEdit ? t('common.save') : sendLabel}
            onPress={() => (scheduledEdit ? void go(false) : confirmThenSend())}
            disabled={busy || (!scheduledEdit && sendBlocked) || count === 0}
            testID="broadcast-send"
          />
          {busy ? <ActivityIndicator color={c.primary} /> : null}
        </View>
      )}
    >
      <CommerceHint c={c} helpKey="broadcastCompose" />

      <TextInput
        mode="outlined"
        label={t('commerce.broadcasts.titleLabel')}
        value={title}
        onChangeText={setTitle}
        maxLength={60}
        outlineStyle={{ borderRadius: radii.field }}
        style={styles.input}
        right={<TextInput.Affix text={`${title.length}/60`} />}
        testID="broadcast-title"
      />
      <TextInput
        mode="outlined"
        label={t('commerce.broadcasts.bodyLabel')}
        value={body}
        onChangeText={setBody}
        maxLength={240}
        multiline
        numberOfLines={3}
        outlineStyle={{ borderRadius: radii.field }}
        style={styles.input}
        testID="broadcast-body"
      />
      <Text style={{ color: c.textSecondary, fontSize: 12, alignSelf: 'flex-end' }}>{`${body.length}/240`}</Text>

      {/* MP-1 (c2): "What they see" — the push as it arrives (backend notification copy: "Offer: {title}" / "{body} — from {shop}"). */}
      <SectionLabel c={c}>{t('commerce.broadcasts.previewLabel')}</SectionLabel>
      <View style={[styles.preview, { borderColor: c.divider, backgroundColor: c.surface }]} testID="broadcast-preview">
        <View style={styles.previewHead}>
          <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>{t('commerce.broadcasts.previewApp')}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 11 }}>{t('commerce.broadcasts.previewNow')}</Text>
        </View>
        <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 14 }} numberOfLines={2} testID="broadcast-preview-title">
          {t('commerce.broadcasts.previewTitle', { title: title.trim() || t('commerce.broadcasts.previewTitlePlaceholder') })}
        </Text>
        <Text style={{ color: c.textPrimary, fontSize: 13 }} numberOfLines={4} testID="broadcast-preview-body">
          {t('commerce.broadcasts.previewBody', { body: body.trim() || t('commerce.broadcasts.previewBodyPlaceholder'), shop: shopName })}
        </Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('commerce.broadcasts.previewNote')}</Text>

      <SectionLabel c={c}>{t('commerce.broadcasts.opens')}</SectionLabel>
      <View style={styles.chips}>
        {pickedOffer ? (
          <PickedChip c={c} label={`${pickedOffer.name} · ${offerBenefitText(pickedOffer.benefit, t, (p) => formatPaise(p))}`} onRemove={() => setOfferId(undefined)} />
        ) : offerId ? <PickedChip c={c} label={t('commerce.broadcasts.linkedOffer')} onRemove={() => setOfferId(undefined)} /> : null}
        {product ? <PickedChip c={c} label={product.name} onRemove={() => setProduct(null)} /> : null}
      </View>
      {!offerId && !product ? (
        <View style={styles.chips}>
          {access.offers.canView ? <PillButton c={c} tone="outline" icon="ticket-percent-outline" label={t('commerce.broadcasts.linkOffer')} onPress={() => setPickingOffer(true)} /> : null}
          <PillButton c={c} tone="outline" icon="package-variant" label={t('commerce.broadcasts.linkItem')} onPress={() => setPickingItem(true)} />
        </View>
      ) : null}

      <SectionLabel c={c}>{t('commerce.broadcasts.who')}</SectionLabel>
      <Card c={c}>
        <View style={styles.audience} testID="broadcast-audience">
          {audience.isFetching && count === undefined ? <ActivityIndicator color={c.primary} /> : null}
          {count !== undefined ? (
            <Text style={{ color: count === 0 ? c.warning : c.primary, fontSize: 22, fontWeight: '800' }}>
              {t('commerce.broadcasts.willGet', { count })}
            </Text>
          ) : null}
          {audience.isError ? <Text style={{ color: c.error, fontSize: 12.5 }}>{apiErrorMessage(audience.error)}</Text> : null}
        </View>
        {audience.data?.suppressed ? (
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>
            {t('commerce.broadcasts.suppressed', {
              optedOut: audience.data.suppressed.optedOut, muted: audience.data.suppressed.muted, tooSoon: audience.data.suppressed.tooSoon,
            })}
          </Text>
        ) : null}
        {count === 0 ? <Text style={{ color: c.warning, fontSize: 12.5 }}>{t('errors.BROADCAST_NO_AUDIENCE')}</Text> : null}

        <Text style={[styles.label, { color: c.textPrimary }]}>{t('commerce.broadcasts.tiers')}</Text>
        <ChoiceChips c={c} multi options={SPEND_TIERS.map((s) => ({ key: s, label: t(`commerce.broadcasts.tier.${s}`) }))} value={tiers} onChange={setTiers} testID="broadcast-tiers" />
        {tiers.length ? (
          <>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('commerce.broadcasts.tiersHint')}</Text>
            <ChoiceChips c={c} options={[30, 90, 180].map((d) => ({ key: d, label: t('commerce.broadcasts.inLastDays', { count: d }) }))} value={[windowDays]} onChange={(v) => setWindowDays(v[0] ?? 90)} />
          </>
        ) : null}
        <Text style={[styles.label, { color: c.textPrimary }]}>{t('commerce.broadcasts.hasOrdered')}</Text>
        <ChoiceChips
          c={c}
          options={[{ key: 'ANY' as const, label: t('commerce.common.anyone') }, { key: 'YES' as const, label: t('commerce.broadcasts.orderedYes') }, { key: 'NO' as const, label: t('commerce.broadcasts.orderedNo') }]}
          value={[hasOrdered]}
          onChange={(v) => setHasOrdered(v[0] ?? 'ANY')}
        />
        <Text style={[styles.label, { color: c.textPrimary }]}>{t('commerce.broadcasts.quiet')}</Text>
        <ChoiceChips
          c={c}
          options={[0, 15, 30, 60, 90].map((d) => ({ key: d, label: d ? t('commerce.broadcasts.quietDays', { count: d }) : t('commerce.common.anyone') }))}
          value={[quietDays]}
          onChange={(v) => setQuietDays(v[0] ?? 0)}
        />
        <TextInput
          mode="outlined"
          dense
          label={t('commerce.broadcasts.tags')}
          value={tags}
          onChangeText={setTags}
          outlineStyle={{ borderRadius: radii.field }}
          style={styles.input}
        />
        {/* MP-1 (c1): Tower / block audience, like the web (typed as the society spells it). */}
        <TextInput
          mode="outlined"
          dense
          label={t('commerce.broadcasts.blocks')}
          value={blocks}
          onChangeText={setBlocks}
          outlineStyle={{ borderRadius: radii.field }}
          style={styles.input}
          testID="broadcast-blocks"
        />
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('commerce.broadcasts.blocksHint')}</Text>
        {Array.isArray(kept.societyIds) && kept.societyIds.length ? (
          <Text style={{ color: c.textSecondary, fontSize: 12 }} testID="broadcast-societies-kept">
            {t('commerce.broadcasts.societiesKept', { count: kept.societyIds.length })}
          </Text>
        ) : null}
      </Card>

      <SectionLabel c={c}>{t('commerce.broadcasts.when')}</SectionLabel>
      {!scheduledEdit ? (
        <ChoiceChips
          c={c}
          options={[{ key: 'NOW' as const, label: t('commerce.broadcasts.sendNow') }, { key: 'LATER' as const, label: t('commerce.broadcasts.schedule') }]}
          value={[when]}
          onChange={(v) => setWhen(v[0] ?? 'NOW')}
          testID="broadcast-when"
        />
      ) : null}
      {when === 'LATER' ? (
        <DateField
          label={t('commerce.broadcasts.sendAt')}
          value={at}
          onChangeText={setAt}
          mode="datetime"
          minimumDate={new Date()}
          error={schedule === 'TOO_FAR' ? t('commerce.broadcasts.err.tooFar') : schedule === 'PAST' && at ? t('commerce.broadcasts.err.past') : undefined}
        />
      ) : null}
      {when === 'NOW' && left === 0 ? (
        <Text style={{ color: c.warning, fontSize: 12.5 }}>
          {list.data?.weekly.nextAllowedAt
            ? t('commerce.broadcasts.nextAfter', { when: whenText(list.data.weekly.nextAllowedAt, t) })
            : t('commerce.broadcasts.noneLeft')}
        </Text>
      ) : null}
      {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="broadcast-error">{error}</Text> : null}

      <Sheet visible={pickingOffer} onDismiss={() => setPickingOffer(false)} title={t('commerce.broadcasts.linkOffer')}>
        {offers.isPending ? <ActivityIndicator color={c.primary} /> : null}
        {(offers.data?.data ?? []).filter((o) => o.live).map((o) => (
          <Pressable
            key={o.id}
            onPress={() => { setOfferId(o.id); setProduct(null); setPickingOffer(false); }}
            accessibilityRole="button"
            style={[styles.pick, { borderColor: c.divider }]}
          >
            <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>{o.name}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>{offerBenefitText(o.benefit, t, (p) => formatPaise(p))}</Text>
          </Pressable>
        ))}
        {offers.isSuccess && !(offers.data?.data ?? []).some((o) => o.live) ? (
          <Text style={{ color: c.textSecondary }}>{t('commerce.broadcasts.noOffers')}</Text>
        ) : null}
      </Sheet>
      <ProductPickerSheet
        visible={pickingItem}
        onDismiss={() => setPickingItem(false)}
        title={t('commerce.broadcasts.linkItem')}
        onPick={(p) => { setProduct({ id: p._id, name: p.name }); setOfferId(undefined); }}
      />
    </Frame>
  );
}

/** Header + scroll + a footer that stays on screen (the Send button is never below the fold). */
function Frame({ c, title, children, footer }: { c: ReturnType<typeof themeColors>; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton icon="chevron-left" size={26} onPress={() => router.back()} accessibilityLabel={t('common.back')} style={{ margin: 0 }} />
        <Text style={{ flex: 1, textAlign: 'center', color: c.textPrimary, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
        <HelpButton c={c} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.wrap}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
      {footer ? <View style={[styles.footerBar, { borderTopColor: c.divider, backgroundColor: c.surface }]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 4 },
  body: { padding: 16, paddingBottom: 24 },
  wrap: { gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  input: { backgroundColor: 'transparent' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { fontSize: 13.5, fontWeight: '700', marginTop: 6 },
  audience: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32, flexWrap: 'wrap' },
  pick: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, minHeight: 52 },
  preview: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.sm, padding: 12, gap: 4 },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'flex-end' },
  footerBar: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12 },
});
