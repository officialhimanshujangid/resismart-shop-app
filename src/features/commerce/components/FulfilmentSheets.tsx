import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { apiErrorCode, apiErrorMessage, apiErrorParams } from '../../../api/axios';
import { uploadPublicImage } from '../../../api/partner.api';
import { formatPaise } from '../../../lib/money';
import { newIdempotencyKey } from '../../../lib/idempotency';
import type { PartnerOrder } from '../../orders/types';
import { Banner, PillButton, Stepper } from '../../p1/ui';
import { ChoiceChips, Sheet } from '../../p2/ui';
import { DateField } from '../../../components/DateField';
import { fulfilmentApi, PARTIAL_REASONS, type PartialReason, type PickingGroup } from '../fulfilmentApi';
import {
  attemptsLeftOf, otpDigits, partialChanges, partialProducts, proofStart, type ProofMode,
} from '../fulfilmentLogic';
import { slotText, whenText } from '../format';
import { Tag } from './ui';
import { SkeletonList } from '../../../components/ui';

// ═══════════════════════════════════════════════════════════════ order info block

const SUB_KEYS: Record<string, string> = {
  CALL_ME: 'commerce.fulfilment.sub.CALL_ME',
  SUBSTITUTE_SIMILAR: 'commerce.fulfilment.sub.SUBSTITUTE_SIMILAR',
  REMOVE_ITEM: 'commerce.fulfilment.sub.REMOVE_ITEM',
};

/**
 * The commerce facts on an order (C1–C4, partner view): slot, the customer's
 * substitution wish, what was changed at acceptance, the rider and the
 * hand-over proof, offers / points / store credit. Draws nothing on an order
 * that has none of them.
 */
export function OrderCommerceInfo({ order }: { order: PartnerOrder }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const has = order.deliverySlot || order.substitutionPreference || order.partial || order.delivery
    || order.offers?.length || order.loyalty || order.wallet;
  if (!has) return null;
  return (
    <View style={[styles.info, { backgroundColor: c.surface, borderColor: c.divider }]} testID="order-commerce">
      <View style={styles.chips}>
        {order.deliverySlot ? <Tag c={c} tone="info" label={t('commerce.fulfilment.slotChip', { slot: slotText(order.deliverySlot, t) })} /> : null}
        {order.substitutionPreference ? <Tag c={c} tone="warn" label={t(SUB_KEYS[order.substitutionPreference] ?? 'commerce.fulfilment.sub.CALL_ME')} /> : null}
        {order.delivery?.staffName ? <Tag c={c} tone="good" label={t('commerce.fulfilment.riderChip', { name: order.delivery.staffName })} /> : null}
      </View>
      {order.partial ? (
        <View style={{ gap: 2 }}>
          <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{t('commerce.fulfilment.changedTitle')}</Text>
          {order.partial.changes.map((ch) => (
            <Text key={ch.productId} style={{ color: c.textSecondary, fontSize: 12.5 }}>
              {t(ch.toQty > 0 ? 'commerce.fulfilment.changedLine' : 'commerce.fulfilment.removedLine', {
                name: ch.name, from: ch.fromQty, to: ch.toQty, reason: t(`commerce.fulfilment.reason.${ch.reason}`),
              })}
            </Text>
          ))}
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>
            {t('commerce.fulfilment.wasTotal', { amount: formatPaise(order.partial.previousTotalPaise) })}
          </Text>
        </View>
      ) : null}
      {order.delivery?.proof ? (
        <View style={styles.proof}>
          <MaterialCommunityIcons name={order.delivery.proof.method === 'PHOTO' ? 'camera' : 'numeric'} size={18} color={c.success} />
          <Text style={{ color: c.textPrimary, flex: 1, fontSize: 12.5 }}>
            {t(order.delivery.proof.method === 'PHOTO' ? 'commerce.fulfilment.proofPhoto' : 'commerce.fulfilment.proofOtp', { when: whenText(order.delivery.proof.at, t) })}
          </Text>
          {order.delivery.proof.photoUrl ? <Image source={{ uri: order.delivery.proof.photoUrl }} style={styles.thumb} accessibilityIgnoresInvertColors /> : null}
        </View>
      ) : null}
      {(order.offers ?? []).map((o) => (
        <View key={o.offerId} style={styles.money}>
          <Text style={{ color: c.textSecondary, flex: 1, fontSize: 12.5 }} numberOfLines={2}>{o.code ? `${o.name} (${o.code})` : o.name}</Text>
          <Text style={{ color: c.success, fontWeight: '700', fontSize: 12.5 }}>{`−${formatPaise(o.discountPaise)}`}</Text>
        </View>
      ))}
      {order.loyalty?.pointsRedeemed ? (
        <View style={styles.money}>
          <Text style={{ color: c.textSecondary, flex: 1, fontSize: 12.5 }}>{t('commerce.fulfilment.pointsUsed', { count: order.loyalty.pointsRedeemed })}</Text>
          {order.amounts.pointsDiscountPaise ? <Text style={{ color: c.success, fontWeight: '700', fontSize: 12.5 }}>{`−${formatPaise(order.amounts.pointsDiscountPaise)}`}</Text> : null}
        </View>
      ) : null}
      {order.wallet?.appliedPaise ? (
        <View style={styles.money}>
          <Text style={{ color: c.textSecondary, flex: 1, fontSize: 12.5 }}>{t('commerce.fulfilment.creditUsed')}</Text>
          <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 12.5 }}>{formatPaise(order.wallet.appliedPaise)}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════ accept with changes (B-1)

export function PartialAcceptSheet({
  order, onDismiss, onDone,
}: { order: PartnerOrder; onDismiss: () => void; onDone: (o: PartnerOrder) => void }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const lines = useMemo(() => partialProducts(order.items.map((i) => ({ productId: i.productId, name: i.snapshot.name, qty: i.qty }))), [order.items]);
  const [toQty, setToQty] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, PartialReason | undefined>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey('accept-partial'));

  const plan = partialChanges(lines, toQty, reasons, notes);
  const changedCount = lines.filter((l) => (toQty[l.productId] ?? l.qty) !== l.qty).length;

  const submit = async () => {
    if (!plan.ok) { setError(t(`commerce.fulfilment.partialErr.${plan.problem}`)); return; }
    setBusy(true);
    setError(null);
    try {
      const out = await fulfilmentApi.acceptPartial(order.id, { changes: plan.changes, ...(note.trim() ? { note: note.trim().slice(0, 300) } : {}) }, key.current);
      onDone(out);
      onDismiss();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      onDismiss={onDismiss}
      title={t('commerce.fulfilment.partialTitle', { code: order.code })}
      testID="partial-sheet"
      footer={(
        <PillButton
          c={c}
          icon="check"
          label={t('commerce.fulfilment.partialAccept', { count: changedCount })}
          onPress={() => void submit()}
          disabled={busy || changedCount === 0}
          testID="partial-submit"
        />
      )}
    >
      <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>{t('commerce.fulfilment.partialBody')}</Text>
      {lines.map((l) => {
        const now = toQty[l.productId] ?? l.qty;
        const changed = now !== l.qty;
        return (
          <View key={l.productId} style={[styles.partRow, { borderColor: changed ? c.warning : c.divider }]} testID={`partial-line-${l.productId}`}>
            <View style={styles.partHead}>
              <Text style={{ color: c.textPrimary, fontWeight: '600', flexGrow: 1, flexBasis: 140, minWidth: 0 }} numberOfLines={2}>
                {l.name}
              </Text>
              <Stepper
                c={c}
                value={now}
                min={0}
                max={l.qty}
                onChange={(n) => setToQty((x) => ({ ...x, [l.productId]: Math.min(l.qty, Math.max(0, n)) }))}
                label={l.name}
                testID={`partial-qty-${l.productId}`}
              />
            </View>
            <Text style={{ color: now === 0 ? c.error : c.textSecondary, fontSize: 12 }}>
              {now === 0 ? t('commerce.fulfilment.willRemove') : t('commerce.fulfilment.ordered', { qty: l.qty })}
            </Text>
            {changed ? (
              <>
                <ChoiceChips
                  c={c}
                  options={PARTIAL_REASONS.map((r) => ({ key: r, label: t(`commerce.fulfilment.reason.${r}`) }))}
                  value={reasons[l.productId] ? [reasons[l.productId] as PartialReason] : []}
                  onChange={(v) => setReasons((x) => ({ ...x, [l.productId]: v[0] }))}
                  testID={`partial-reason-${l.productId}`}
                />
                {reasons[l.productId] === 'OTHER' ? (
                  <TextInput
                    mode="outlined"
                    dense
                    label={t('commerce.fulfilment.noteForItem')}
                    value={notes[l.productId] ?? ''}
                    onChangeText={(s) => setNotes((x) => ({ ...x, [l.productId]: s }))}
                    maxLength={200}
                    outlineStyle={{ borderRadius: radii.field }}
                    style={{ backgroundColor: 'transparent' }}
                  />
                ) : null}
              </>
            ) : null}
          </View>
        );
      })}
      <TextInput
        mode="outlined"
        dense
        label={t('commerce.fulfilment.noteForCustomer')}
        value={note}
        onChangeText={setNote}
        maxLength={300}
        outlineStyle={{ borderRadius: radii.field }}
        style={{ backgroundColor: 'transparent' }}
      />
      {!plan.ok && changedCount > 0 && plan.problem !== 'NOTHING_CHANGED' ? (
        <Text style={{ color: c.warning, fontSize: 12.5 }}>{t(`commerce.fulfilment.partialErr.${plan.problem}`)}</Text>
      ) : null}
      {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="partial-error">{error}</Text> : null}
    </Sheet>
  );
}

// ═══════════════════════════════════════════════════════════════ assign a rider (B-3)

export function AssignRiderSheet({
  order, onDismiss, onDone,
}: { order: PartnerOrder; onDismiss: () => void; onDone: (o: PartnerOrder) => void }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  // Only staff whose role can deliver — the same test the server's assign applies.
  const staff = useQuery({ queryKey: ['commerce', 'eligibleRiders'], queryFn: fulfilmentApi.eligibleRiders, staleTime: 60_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = staff.data ?? [];

  const pick = async (staffId: string | null) => {
    setBusy(staffId ?? 'none');
    setError(null);
    try {
      onDone(await fulfilmentApi.assign(order.id, staffId));
      onDismiss();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet visible onDismiss={onDismiss} title={t('commerce.fulfilment.assignTitle', { code: order.code })} testID="assign-sheet">
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('commerce.fulfilment.assignBody')}</Text>
      {staff.isPending ? <SkeletonList rows={2} /> : null}
      {staff.isError ? <Text style={{ color: c.error }}>{apiErrorMessage(staff.error)}</Text> : null}
      {staff.isSuccess && rows.length === 0 ? <Text style={{ color: c.textSecondary }}>{t('commerce.fulfilment.noStaff')}</Text> : null}
      {rows.map((s) => {
        const name = s.name || s.designation || '';
        const current = order.delivery?.staffId === s.staffId;
        return (
          <Pressable
            key={s.staffId}
            onPress={() => void pick(s.staffId)}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityState={{ selected: current }}
            style={[styles.riderRow, { borderColor: current ? c.primary : c.divider, backgroundColor: current ? c.surfaceVariant : c.surface }]}
            testID={`rider-${s.staffId}`}
          >
            <MaterialCommunityIcons name="moped-outline" size={22} color={c.primary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>{name}</Text>
              {s.designation ? <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>{s.designation}</Text> : null}
            </View>
            {busy === s.staffId ? <ActivityIndicator color={c.primary} /> : current ? <MaterialCommunityIcons name="check-circle" size={22} color={c.success} /> : null}
          </Pressable>
        );
      })}
      {order.delivery?.staffId ? (
        <PillButton c={c} tone="danger" label={t('commerce.fulfilment.unassign')} onPress={() => void pick(null)} disabled={!!busy} testID="rider-unassign" />
      ) : null}
      {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="assign-error">{error}</Text> : null}
    </Sheet>
  );
}

// ═══════════════════════════════════════════════════════════════ picking list (B-8)

export function PickingListSheet({ onDismiss, orderIds }: { onDismiss: () => void; orderIds?: string[] }) {
  const { t, i18n } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [group, setGroup] = useState<PickingGroup>('NONE');
  const [date, setDate] = useState('');
  const [lang, setLang] = useState<'en' | 'hi'>(String(i18n.language).startsWith('hi') ? 'hi' : 'en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      await fulfilmentApi.sharePickingList({ groupBy: group, lang, ...(date ? { date } : {}), ...(orderIds?.length ? { orderIds } : {}) });
      onDismiss();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      onDismiss={onDismiss}
      title={t('commerce.fulfilment.pickingTitle')}
      testID="picking-sheet"
      footer={<PillButton c={c} icon="file-pdf-box" label={t('commerce.fulfilment.pickingMake')} onPress={() => void make()} disabled={busy} testID="picking-make" />}
    >
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('commerce.fulfilment.pickingBody')}</Text>
      <Text style={[styles.label, { color: c.textPrimary }]}>{t('commerce.fulfilment.groupBy')}</Text>
      <ChoiceChips
        c={c}
        options={(['NONE', 'TOWER', 'SLOT'] as PickingGroup[]).map((g) => ({ key: g, label: t(`commerce.fulfilment.group.${g}`) }))}
        value={[group]}
        onChange={(v) => setGroup(v[0] ?? 'NONE')}
        testID="picking-group"
      />
      <DateField label={t('commerce.fulfilment.slotDate')} value={date} onChangeText={setDate} mode="date" placeholder={t('commerce.fulfilment.anyDay')} />
      <Text style={[styles.label, { color: c.textPrimary }]}>{t('commerce.fulfilment.paperLanguage')}</Text>
      <ChoiceChips c={c} options={[{ key: 'en' as const, label: 'English' }, { key: 'hi' as const, label: 'हिन्दी' }]} value={[lang]} onChange={(v) => setLang(v[0] ?? 'en')} />
      {busy ? <ActivityIndicator color={c.primary} /> : null}
      {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="picking-error">{error}</Text> : null}
    </Sheet>
  );
}

// ═══════════════════════════════════════════════════════════════ deliver with proof (B-5)

const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export function DeliverProofSheet({
  order, mode, onDismiss, onDone,
}: { order: PartnerOrder; mode: ProofMode | undefined; onDismiss: () => void; onDone: (o: PartnerOrder) => void }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [how, setHow] = useState<'OTP' | 'PHOTO'>(proofStart(mode));
  const [otp, setOtp] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otpAllowed = mode !== 'PHOTO' && !locked;
  const photoAllowed = mode !== 'OTP' || locked;

  const deliver = async (body: { otp?: string; proofPhotoUrl?: string }) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await fulfilmentApi.deliver(order.id, body));
      onDismiss();
    } catch (e) {
      const code = apiErrorCode(e);
      if (code === 'DELIVERY_OTP_WRONG') {
        const n = attemptsLeftOf(apiErrorParams(e));
        setOtp('');
        setError(n !== undefined ? t('commerce.fulfilment.otpWrongLeft', { count: n }) : apiErrorMessage(e));
      } else if (code === 'DELIVERY_OTP_LOCKED' || code === 'DELIVERY_OTP_MISSING') {
        setLocked(true);
        setHow('PHOTO');
        setError(apiErrorMessage(e));
      } else {
        setError(apiErrorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const press = (k: string) => {
    if (busy) return;
    if (k === '⌫') { setOtp((s) => s.slice(0, -1)); return; }
    if (!k) return;
    const next = otpDigits(otp + k);
    setOtp(next);
    if (next.length === 4) void deliver({ otp: next });
  };

  const takePhoto = async () => {
    setError(null);
    try {
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 });
      if (shot.canceled || !shot.assets.length) return;
      setBusy(true);
      const asset = shot.assets[0];
      const url = await uploadPublicImage({
        uri: asset.uri, name: asset.fileName ?? `delivery-${order.code}-${Date.now()}.jpg`, mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setPhotoUrl(url);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible onDismiss={onDismiss} title={t('commerce.fulfilment.deliverTitle', { code: order.code })} testID="proof-sheet">
      {otpAllowed && photoAllowed ? (
        <ChoiceChips
          c={c}
          options={[{ key: 'OTP' as const, label: t('commerce.fulfilment.useCode') }, { key: 'PHOTO' as const, label: t('commerce.fulfilment.usePhoto') }]}
          value={[how]}
          onChange={(v) => { setHow(v[0] ?? 'OTP'); setError(null); }}
        />
      ) : null}
      {locked ? <Banner c={c} tone="warn" body={t('commerce.fulfilment.codeLocked')} /> : null}
      {how === 'OTP' && otpAllowed ? (
        <>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('commerce.fulfilment.askCode')}</Text>
          <View style={styles.otpBoxes} testID="otp-boxes">
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.otpBox, { borderColor: otp.length === i ? c.primary : c.divider }]}>
                <Text style={{ color: c.textPrimary, fontSize: 24, fontWeight: '800' }}>{otp[i] ?? ''}</Text>
              </View>
            ))}
          </View>
          <View style={styles.pad}>
            {PAD.map((k, i) => (
              <Pressable
                key={i}
                onPress={() => press(k)}
                disabled={!k || busy}
                accessibilityRole="button"
                accessibilityLabel={k === '⌫' ? t('commerce.fulfilment.backspace') : k}
                style={({ pressed }) => [styles.key, { backgroundColor: !k ? 'transparent' : pressed ? c.surfaceVariant : c.surface, borderColor: k ? c.divider : 'transparent' }]}
                testID={k ? `otp-key-${k === '⌫' ? 'back' : k}` : undefined}
              >
                <Text style={{ color: c.textPrimary, fontSize: 22, fontWeight: '700' }}>{k}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      {how === 'PHOTO' || !otpAllowed ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('commerce.fulfilment.photoBody')}</Text>
          {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.photo} accessibilityIgnoresInvertColors /> : null}
          <View style={styles.chips}>
            <PillButton c={c} tone={photoUrl ? 'outline' : 'primary'} icon="camera" label={photoUrl ? t('commerce.fulfilment.retake') : t('commerce.fulfilment.takePhoto')} onPress={() => void takePhoto()} disabled={busy} testID="proof-photo" />
            {photoUrl ? (
              <PillButton c={c} icon="check" label={t('commerce.fulfilment.markDelivered')} onPress={() => void deliver({ proofPhotoUrl: photoUrl })} disabled={busy} testID="proof-photo-deliver" />
            ) : null}
          </View>
        </View>
      ) : null}
      {busy ? <ActivityIndicator color={c.primary} /> : null}
      {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="proof-error">{error}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  info: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  proof: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: { width: 44, height: 44, borderRadius: radii.sm },
  money: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partRow: { borderWidth: 1, borderRadius: radii.card, padding: 10, gap: 6 },
  partHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: radii.card, paddingHorizontal: 12, minHeight: 56 },
  label: { fontSize: 13.5, fontWeight: '700' },
  otpBoxes: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  otpBox: { width: 52, height: 60, borderWidth: 2, borderRadius: radii.card, alignItems: 'center', justifyContent: 'center' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: 300, alignSelf: 'center' },
  key: { width: 84, height: 56, borderRadius: radii.card, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', maxWidth: 320, aspectRatio: 4 / 3, borderRadius: radii.card, alignSelf: 'center' },
});
