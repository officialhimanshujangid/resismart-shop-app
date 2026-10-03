import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Divider, IconButton, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { formatPaise, paiseToInput, parseRupeesToPaise } from '../../../lib/money';
import { newIdempotencyKey } from '../../../lib/idempotency';
import { documentsApi, type CreateDocumentPayload } from '../../billing/documents.api';
import type { PartnerDocumentRecord } from '../../billing/types';
import { PillButton } from '../../p1/ui';
import { ChoiceChips, Sheet } from '../../p2/ui';
import { commerceApi } from '../api';
import { useWallet } from '../hooks';
import { tenderProblem } from '../logic';
import { COUPON_CODE_PATTERN, MAX_TENDER_PARTS, type PointsQuote, type TenderMode, type TenderPart } from '../types';
import { SwitchRow } from './ui';

/**
 * CHECKOUT at the counter (CONTRACT-commerce §8 counter offers, §11 split
 * tender, §16 hand-off): the bill on the till becomes a server DRAFT (so the
 * server prices the offers), then — when the shop has split payment or the
 * customer uses points — it is issued AND paid in one call
 * (`POST /counter/checkout`); otherwise it is issued as today and paid later.
 *
 * NEVER DOUBLE COUNT: the lines sent are the till's own, whose discounts are
 * the cashier's MANUAL ones. The server adds the offers' share itself (and keeps
 * it in `offerRequest.lineOfferPaise`); a coupon change is sent WITHOUT lines,
 * so the server re-prices from the manual part it already holds. Points are
 * never written onto the draft — they are quoted (`/points-quote`) and applied
 * only inside the checkout transaction.
 */

export interface CheckoutFeatures {
  /** OFFERS on and allowed at the counter. */
  offers: boolean;
  coupons: boolean;
  /** LOYALTY on (points can be used). */
  points: boolean;
  /** SPLIT_TENDER on. */
  split: boolean;
  /** WALLET on and allowed at the counter (a store-credit part). */
  credit: boolean;
}

/** One extra tender part as typed (the FIRST part always takes the balance). */
interface ExtraPart { mode: TenderMode; amount: string }

const MODES: TenderMode[] = ['CASH', 'UPI', 'CARD', 'BANK'];

export function CounterCheckoutSheet({
  visible, onDismiss, payload, draftId, onDraftId, partyId, initialCoupon, features, canViewWallet, onDone,
}: {
  visible: boolean;
  onDismiss: () => void;
  /** The bill exactly as the till holds it — MANUAL line discounts only. */
  payload: CreateDocumentPayload;
  /** The server draft from an earlier open of this sheet, if any. */
  draftId: string | null;
  onDraftId: (id: string | null) => void;
  partyId?: string;
  initialCoupon?: string;
  features: CheckoutFeatures;
  canViewWallet: boolean;
  onDone: (documentId: string) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');

  const [doc, setDoc] = useState<PartnerDocumentRecord | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [auto, setAuto] = useState(features.offers);
  const [couponText, setCouponText] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PointsQuote | null>(null);
  const [quoteNote, setQuoteNote] = useState<string | null>(null);
  const [usePts, setUsePts] = useState(false);
  const [firstMode, setFirstMode] = useState<TenderMode>('CASH');
  const [extra, setExtra] = useState<ExtraPart[]>([]);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const createKey = useRef(newIdempotencyKey('counter-draft'));
  const payKey = useRef<{ key: string; print: string } | null>(null);
  const currentDraft = useRef<string | null>(draftId);
  // Follow the parent's id when it changes (a draft made here is set on the ref at once, before the parent re-renders).
  useEffect(() => { currentDraft.current = draftId; }, [draftId]);

  const wallet = useWallet(partyId, visible && features.credit && canViewWallet && !!partyId);
  const creditBalance = wallet.data?.creditPaise;

  /** Quote the most points this bill can take (nothing is written). A refusal is shown, not thrown. */
  const requote = useCallback(async (docId: string) => {
    setQuote(null);
    setQuoteNote(null);
    if (!features.points || !partyId) return;
    try {
      const q = await commerceApi.counter.pointsQuote(docId, 'MAX');
      setQuote(q);
      if (!(q.points > 0)) setUsePts(false);
    } catch (e) {
      setUsePts(false);
      setQuoteNote(apiErrorMessage(e));
    }
  }, [features.points, partyId]);

  /** The till's bill → the server draft (create once, then update with the till's MANUAL lines). */
  const syncDraft = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      let next: PartnerDocumentRecord;
      const offerAsk = features.offers ? { applyAutoOffers: auto } : {};
      if (!currentDraft.current) {
        next = await documentsApi.create({ ...payload, ...offerAsk }, createKey.current);
        onDraftId(next._id);
        currentDraft.current = next._id;
        if (initialCoupon && features.coupons && COUPON_CODE_PATTERN.test(initialCoupon)) {
          try {
            next = await documentsApi.update(next._id, { couponCode: initialCoupon });
          } catch (e) {
            setCouponText(initialCoupon);
            setCouponError(apiErrorMessage(e));
          }
        }
      } else {
        next = await documentsApi.update(currentDraft.current, {
          ...(payload.partyId ? { partyId: payload.partyId } : {}),
          partySnapshot: payload.partySnapshot,
          lines: payload.lines,
          ...(payload.documentDate ? { documentDate: payload.documentDate } : {}),
          ...offerAsk,
        });
      }
      setDoc(next);
      await requote(next._id);
    } catch (e) {
      setSyncError(apiErrorMessage(e));
      // A draft that is no longer editable (issued elsewhere, deleted) is forgotten.
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 409) { onDraftId(null); currentDraft.current = null; }
    } finally {
      setSyncing(false);
    }
  }, [auto, features.offers, features.coupons, initialCoupon, onDraftId, payload, requote]);

  // Every open re-sends the till's bill (it may have changed since the last open).
  useEffect(() => {
    if (!visible) return;
    setPayError(null);
    setCouponError(null);
    setExtra([]);
    setFirstMode('CASH');
    setUsePts(false);
    void syncDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /** A coupon / auto-offer change goes WITHOUT lines: the server re-prices from the manual part it keeps. */
  const changeOffers = async (patch: { couponCode?: string | null; applyAutoOffers?: boolean }) => {
    if (!currentDraft.current) return;
    setSyncing(true);
    setCouponError(null);
    try {
      const next = await documentsApi.update(currentDraft.current, patch);
      setDoc(next);
      if (patch.couponCode === null) setCouponText('');
      await requote(next._id);
    } catch (e) {
      if (patch.applyAutoOffers !== undefined) setAuto(!patch.applyAutoOffers);
      setCouponError(apiErrorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  const applyCoupon = () => {
    const code = couponText.trim().toUpperCase();
    if (!COUPON_CODE_PATTERN.test(code)) { setCouponError(t('commerce.counter.couponInvalid')); return; }
    void changeOffers({ couponCode: code });
  };

  const billTotal = doc?.totals.grandPaise ?? 0;
  const pointsOn = usePts && !!quote && quote.points > 0;
  const toPay = pointsOn ? quote!.totalAfterPaise : billTotal;

  const parts: TenderPart[] = useMemo(() => {
    const typed = extra.map((p) => ({ mode: p.mode, amountPaise: parseRupeesToPaise(p.amount) ?? 0 }));
    const rest = toPay - typed.reduce((s, p) => s + p.amountPaise, 0);
    // The other parts cover the bill exactly: the balancing first part simply drops out.
    if (rest === 0 && typed.length) return typed;
    return [{ mode: firstMode, amountPaise: rest }, ...typed];
  }, [extra, firstMode, toPay]);

  const canCheckout = !!partyId && (features.split || (features.points && pointsOn));
  // The first part takes the balance, so "too much" shows up as that part going below zero.
  const problem = !canCheckout ? 'NONE'
    : extra.length && parts[0].amountPaise < 0 ? 'OVER'
      : tenderProblem(toPay, parts, creditBalance);
  const modes: TenderMode[] = features.credit && features.split && partyId ? [...MODES, 'STORE_CREDIT'] : MODES;
  const modeLabel = (m: TenderMode) => (m === 'STORE_CREDIT' ? t('commerce.common.storeCredit') : t(`payments.mode.${m}`));

  const addPart = (mode: TenderMode, amountPaise?: number) => {
    if (parts.length >= MAX_TENDER_PARTS) return;
    setExtra((x) => [...x, { mode, amount: amountPaise ? paiseToInput(amountPaise) : '' }]);
  };

  const pay = async () => {
    if (!currentDraft.current || !doc) return;
    setPaying(true);
    setPayError(null);
    // One key per payment INTENT: the same parts retried reuse it; a changed split is a new intent.
    const print = JSON.stringify({ d: currentDraft.current, parts, p: pointsOn ? quote!.points : 0, c: canCheckout });
    if (!payKey.current || payKey.current.print !== print) payKey.current = { key: newIdempotencyKey('checkout'), print };
    try {
      if (canCheckout) {
        const out = await commerceApi.counter.checkout({
          documentId: currentDraft.current,
          payments: parts.map((p) => ({ mode: p.mode, amountPaise: p.amountPaise })),
          ...(pointsOn ? { usePoints: quote!.points } : {}),
        }, payKey.current.key);
        onDraftId(null);
        onDone(String(out.document._id));
      } else {
        const out = await documentsApi.issue(currentDraft.current, payKey.current.key);
        onDraftId(null);
        onDone(String(out.document._id));
      }
    } catch (e) {
      setPayError(apiErrorMessage(e));
      // The server re-prices at issue (offers, points): show what it now says.
      void syncDraft();
    } finally {
      setPaying(false);
    }
  };

  const actionLabel = canCheckout
    ? t('commerce.counter.takePayment', { amount: formatPaise(toPay) })
    : t('commerce.counter.issueBill', { amount: formatPaise(toPay) });

  const problemText = problem === 'OVER' ? t('commerce.counter.tenderOver')
    : problem === 'ZERO_PART' ? t('commerce.counter.tenderZero')
      : problem === 'CREDIT_SHORT' ? t('commerce.counter.tenderCreditShort', { amount: formatPaise(creditBalance ?? 0) })
        : problem === 'TOO_MANY' ? t('commerce.counter.tenderTooMany') : null;

  return (
    <Sheet
      visible={visible}
      onDismiss={() => { if (!paying) onDismiss(); }}
      title={t('commerce.counter.checkout')}
      testID="checkout-sheet"
      footer={(
        <PillButton
          c={c}
          icon={canCheckout ? 'cash-register' : 'file-check-outline'}
          label={actionLabel}
          onPress={() => void pay()}
          disabled={!doc || syncing || paying || problem !== 'NONE' || toPay <= 0}
          testID="checkout-pay"
        />
      )}
    >
      {syncing && !doc ? <ActivityIndicator color={c.primary} /> : null}
      {syncError ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: c.error, fontSize: 13 }} testID="checkout-sync-error">{syncError}</Text>
          <PillButton c={c} tone="outline" icon="refresh" label={t('common.tryAgain')} onPress={() => void syncDraft()} />
        </View>
      ) : null}

      {doc ? (
        <>
          {/* ── offers */}
          {features.offers ? (
            <View style={styles.block}>
              <SwitchRow
                c={c}
                label={t('commerce.counter.autoOffers')}
                hint={t('commerce.counter.autoOffersHint')}
                value={auto}
                disabled={syncing}
                onValueChange={(v) => { setAuto(v); void changeOffers({ applyAutoOffers: v }); }}
                testID="checkout-auto"
              />
              {features.coupons ? (
                doc.offerRequest?.couponCode ? (
                  <View style={[styles.couponOn, { backgroundColor: `${c.success}14`, borderColor: `${c.success}55` }]} testID="checkout-coupon-on">
                    <Text style={{ color: c.success, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                      {t('commerce.counter.couponApplied', { code: doc.offerRequest.couponCode })}
                    </Text>
                    <IconButton icon="close" size={20} onPress={() => void changeOffers({ couponCode: null })} accessibilityLabel={t('commerce.counter.couponRemove')} />
                  </View>
                ) : (
                  <View style={styles.couponRow}>
                    <TextInput
                      mode="outlined"
                      dense
                      label={t('commerce.counter.coupon')}
                      value={couponText}
                      onChangeText={(s) => setCouponText(s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16))}
                      autoCapitalize="characters"
                      outlineStyle={{ borderRadius: radii.field }}
                      style={styles.couponInput}
                      testID="checkout-coupon"
                    />
                    <PillButton c={c} tone="outline" label={t('commerce.counter.apply')} onPress={applyCoupon} disabled={syncing || !couponText} testID="checkout-coupon-apply" />
                  </View>
                )
              ) : null}
              {couponError ? <Text style={{ color: c.error, fontSize: 13 }} testID="checkout-coupon-error">{couponError}</Text> : null}
              {(doc.offers ?? []).map((o) => (
                <View key={o.offerId} style={styles.money}>
                  <Text style={{ color: c.textPrimary, flex: 1 }} numberOfLines={2}>{o.code ? `${o.name} (${o.code})` : o.name}</Text>
                  <Text style={{ color: c.success, fontWeight: '700' }}>{`−${formatPaise(o.discountPaise)}`}</Text>
                </View>
              ))}
              {auto && !(doc.offers ?? []).length ? (
                <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>{t('commerce.counter.noOfferApplies')}</Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.money}>
            <Text style={{ color: c.textSecondary, flex: 1 }}>{t('commerce.counter.billTotal')}</Text>
            <Text style={{ color: c.textPrimary, fontWeight: '700' }} testID="checkout-bill-total">{formatPaise(billTotal)}</Text>
          </View>

          {/* ── points */}
          {features.points ? (
            partyId ? (
              quote && quote.points > 0 ? (
                <SwitchRow
                  c={c}
                  label={t('commerce.counter.usePoints', { count: quote.points })}
                  hint={`${t('commerce.counter.pointsOff', { count: quote.points, amount: formatPaise(quote.discountPaise) })} ${t('commerce.counter.pointsHave', { count: quote.usablePoints })}`}
                  value={usePts}
                  onValueChange={setUsePts}
                  testID="checkout-points"
                />
              ) : quoteNote ? (
                <Text style={{ color: c.textSecondary, fontSize: 12.5 }} testID="checkout-points-note">{quoteNote}</Text>
              ) : null
            ) : (
              <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>{t('commerce.counter.pickCustomerForPoints')}</Text>
            )
          ) : null}

          <Divider />
          <View style={styles.money}>
            <Text style={{ color: c.textPrimary, fontWeight: '700', flex: 1 }}>{t('commerce.counter.toPay')}</Text>
            <Text style={{ color: c.primary, fontWeight: '800', fontSize: 20 }} testID="checkout-to-pay">{formatPaise(toPay)}</Text>
          </View>

          {/* ── tender */}
          {canCheckout ? (
            <View style={styles.block}>
              <Text style={[styles.label, { color: c.textPrimary }]}>{t('commerce.counter.howPaid')}</Text>
              <ChoiceChips c={c} options={modes.map((m) => ({ key: m, label: modeLabel(m) }))} value={[firstMode]} onChange={(v) => setFirstMode(v[0] ?? 'CASH')} testID="tender-first-mode" />
              {extra.length ? (
                <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>
                  {t('commerce.counter.firstPartRest', { amount: formatPaise(parts[0].amountPaise) })}
                </Text>
              ) : null}
              {extra.map((p, i) => (
                <View key={i} style={[styles.part, { borderColor: c.divider }]} testID={`tender-part-${i + 1}`}>
                  <ChoiceChips
                    c={c}
                    options={modes.map((m) => ({ key: m, label: modeLabel(m) }))}
                    value={[p.mode]}
                    onChange={(v) => setExtra((x) => x.map((q, j) => (j === i ? { ...q, mode: v[0] ?? q.mode } : q)))}
                  />
                  <View style={styles.partRow}>
                    <TextInput
                      mode="outlined"
                      dense
                      label={t('commerce.counter.partAmount')}
                      value={p.amount}
                      keyboardType="numeric"
                      onChangeText={(s) => setExtra((x) => x.map((q, j) => (j === i ? { ...q, amount: s } : q)))}
                      outlineStyle={{ borderRadius: radii.field }}
                      style={styles.partInput}
                      left={<TextInput.Affix text="₹" />}
                      testID={`tender-amount-${i + 1}`}
                    />
                    <IconButton icon="close-circle-outline" size={24} onPress={() => setExtra((x) => x.filter((_, j) => j !== i))} accessibilityLabel={t('commerce.counter.removePart')} />
                  </View>
                </View>
              ))}
              {features.split && parts.length < MAX_TENDER_PARTS ? (
                <View style={styles.actions}>
                  <PillButton c={c} tone="outline" icon="call-split" label={t('commerce.counter.splitPayment')} onPress={() => addPart(firstMode === 'UPI' ? 'CASH' : 'UPI')} testID="tender-split" />
                  {features.credit && partyId && (creditBalance ?? 0) > 0 && !parts.some((p) => p.mode === 'STORE_CREDIT') ? (
                    <PillButton
                      c={c}
                      tone="outline"
                      icon="wallet-giftcard"
                      label={t('commerce.counter.useCredit', { amount: formatPaise(Math.min(creditBalance ?? 0, toPay)) })}
                      onPress={() => addPart('STORE_CREDIT', Math.min(creditBalance ?? 0, toPay))}
                      testID="tender-credit"
                    />
                  ) : null}
                </View>
              ) : null}
              {problemText ? <Text style={{ color: c.error, fontSize: 13 }} testID="tender-problem">{problemText}</Text> : null}
            </View>
          ) : (
            <Text style={{ color: c.textSecondary, fontSize: 12.5 }} testID="checkout-issue-only">
              {partyId ? t('commerce.counter.issueOnlyHint') : t('commerce.counter.pickCustomerForSplit')}
            </Text>
          )}
        </>
      ) : null}

      {payError ? <Text style={{ color: c.error, fontSize: 13 }} testID="checkout-error">{payError}</Text> : null}
      {paying ? (
        <Pressable disabled style={styles.busy}><ActivityIndicator color={c.primary} /></Pressable>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  label: { fontSize: 14, fontWeight: '700' },
  money: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  couponRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  couponInput: { flexGrow: 1, flexBasis: 160, backgroundColor: 'transparent' },
  couponOn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radii.card, paddingLeft: 12, minHeight: 48 },
  part: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 6 },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  partInput: { width: 160, backgroundColor: 'transparent' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  busy: { alignItems: 'center', paddingVertical: 4 },
});
