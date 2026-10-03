import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text, TextInput } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../../src/constants/colors';
import { apiErrorMessage } from '../../../../src/api/axios';
import { formatPaise, paiseToInput, parseRupeesToPaise } from '../../../../src/lib/money';
import { newIdempotencyKey } from '../../../../src/lib/idempotency';
import { formatI18nDate } from '../../../../src/i18n';
import { documentsApi, documentStatusGroup } from '../../../../src/features/billing/documents.api';
import { Card, ChipRow, EmptyBlock, ErrorBlock, Loading, Screen, SectionLabel } from '../../../../src/features/more/ui';
import { ActionRow, PillButton, StatGrid, StatTile } from '../../../../src/features/p1/ui';
import { ChoiceChips, Sheet } from '../../../../src/features/p2/ui';
import { useCommerceAccess } from '../../../../src/features/commerce/access';
import {
  useWallet, useWalletAdjust, useWalletPayBill, useWalletRefund, useWalletStatement, useWalletTopUp,
} from '../../../../src/features/commerce/hooks';
import { adjustBody, statementLabelKey, topUpAmount } from '../../../../src/features/commerce/logic';
// >>> GAP-C-SHOP
import { useWalletReferralCode } from '../../../../src/features/commerce/hooks';
import { statementReceiptOf } from '../../../../src/features/commerce/logic';
// <<< GAP-C-SHOP
import { shareWalletReceipt } from '../../../../src/features/commerce/pdf';
import { TOPUP_MODES, type TopUpMode, type TopUpResult, type WalletBucket, type WalletStatementRow } from '../../../../src/features/commerce/types';
import { CommerceHint, NoAccess } from '../../../../src/features/commerce/components/ui';

type SheetKind = 'TOPUP' | 'REFUND' | 'ADJUST' | 'PAY_BILL' | null;

/**
 * One customer's store credit & points (C4): balances, what expires, the
 * referral code, the four actions and the statement. Each action is a sheet
 * whose idempotency key is minted when it OPENS, so a retry on a bad line is
 * one top-up, not two.
 */
export default function WalletDetailScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { partyId = '' } = useLocalSearchParams<{ partyId: string }>();
  const access = useCommerceAccess();
  const wallet = useWallet(partyId, access.wallet.canView);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [bucket, setBucket] = useState<WalletBucket | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const statement = useWalletStatement(partyId, bucket, page, access.wallet.canView);
  const [entries, setEntries] = useState<WalletStatementRow[]>([]);
  // >>> GAP-C-SHOP — receipts off the statement, and the referral code made from here.
  const [notice, setNotice] = useState<string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null);
  const makeCode = useWalletReferralCode(partyId);
  const [codeError, setCodeError] = useState<string | null>(null);
  const openReceipt = async (row: WalletStatementRow) => {
    const paymentId = statementReceiptOf(row);
    if (!paymentId) return;
    setReceiptBusy(row.id);
    try {
      await shareWalletReceipt(partyId, paymentId, row.sourceRef || 'receipt');
    } catch (e) {
      setNotice(apiErrorMessage(e, t('commerce.wallet.receiptFailed')));
    } finally {
      setReceiptBusy(null);
    }
  };
  const createCode = () => {
    setCodeError(null);
    makeCode.mutate(undefined, {
      onSuccess: (r) => setNotice(t('commerce.wallet.referralMade', { code: r.referralCode })),
      // The server's sentence (COMMERCE_FEATURE_OFF when referral was switched off meanwhile).
      onError: (e) => setCodeError(apiErrorMessage(e)),
    });
  };
  // <<< GAP-C-SHOP

  useEffect(() => {
    if (!statement.data) return;
    setEntries((prev) => {
      if (statement.data.page === 1) return statement.data.data;
      const seen = new Set(prev.map((e) => e.id));
      return [...prev, ...statement.data.data.filter((e) => !seen.has(e.id))];
    });
  }, [statement.data]);

  if (!access.wallet.canView) {
    return <Screen title={t('commerce.wallet.title')} c={c}><NoAccess c={c} /></Screen>;
  }

  const w = wallet.data;
  const credit = w?.creditPaise ?? 0;
  const can = {
    topUp: access.wallet.canMoveMoney && access.has('WALLET'),
    refund: access.wallet.canMoveMoney && credit > 0,
    adjust: access.wallet.canManage && (access.has('WALLET') || access.has('LOYALTY')),
    payBill: access.wallet.canPayBill && access.has('WALLET') && credit > 0,
    // GAP-C-SHOP: the REFERRAL feature on and WALLET_MANAGE FULL (the route's own gates).
    makeCode: access.wallet.canManage && access.has('REFERRAL'),
  };

  return (
    <Screen
      title={w?.name ?? t('commerce.wallet.title')}
      subtitle={t('commerce.wallet.title')}
      c={c}
      floating={<Snackbar visible={!!notice} onDismiss={() => setNotice(null)} duration={3000}>{notice}</Snackbar>}
    >
      <View style={styles.wrap}>
        <CommerceHint c={c} helpKey="walletDetail" />
        {wallet.isPending ? <Loading c={c} /> : null}
        {wallet.isError ? <ErrorBlock c={c} message={apiErrorMessage(wallet.error)} onRetry={() => void wallet.refetch()} /> : null}
        {w ? (
          <>
            <StatGrid>
              <StatTile c={c} label={t('commerce.common.storeCredit')} value={formatPaise(w.creditPaise)} testID="wallet-credit" />
              <StatTile c={c} label={t('commerce.wallet.points')} value={String(w.points)} testID="wallet-points" />
            </StatGrid>
            {w.usablePoints !== w.points ? (
              <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>{t('commerce.wallet.usable', { count: w.usablePoints })}</Text>
            ) : null}
            {w.expiring.length ? (
              <Card c={c}>
                <Text style={{ color: c.warning, fontWeight: '700' }}>{t('commerce.wallet.expiringTitle')}</Text>
                {w.expiring.map((x) => (
                  <Text key={x.expiresAt} style={{ color: c.textPrimary, fontSize: 13 }}>
                    {t('commerce.wallet.expiringRow', { count: x.points, date: formatI18nDate(x.expiresAt, t) })}
                  </Text>
                ))}
              </Card>
            ) : null}
            {w.referralCode ? (
              <Card c={c}>
                <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{t('commerce.wallet.referralTitle')}</Text>
                <View style={styles.refRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('commerce.wallet.referralCode')}</Text>
                    <Text style={{ color: c.textPrimary, fontWeight: '800', fontSize: 18, letterSpacing: 1 }} selectable>{w.referralCode}</Text>
                  </View>
                  <PillButton
                    c={c}
                    tone="outline"
                    icon="share-variant"
                    label={t('commerce.common.share')}
                    onPress={() => void Share.share({ message: t('commerce.wallet.referralShare', { code: w.referralCode }) })}
                  />
                </View>
                <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>
                  {t('commerce.wallet.referrals', { rewarded: w.referrals.rewarded, pending: w.referrals.pending })}
                </Text>
              </Card>
            ) : access.has('REFERRAL') ? (
              // >>> GAP-C-SHOP — no code yet: say so, and let a manager make one now (to share at the counter).
              <Card c={c}>
                <View testID="wallet-referral-none" style={{ gap: 8 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{t('commerce.wallet.referralTitle')}</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('commerce.wallet.referralCode')}</Text>
                  <Text style={{ color: c.textPrimary, fontSize: 13, lineHeight: 19 }}>{t('commerce.wallet.referralNoCode')}</Text>
                  {can.makeCode ? (
                    <View style={{ alignSelf: 'flex-start' }}>
                      <PillButton
                        c={c}
                        tone="outline"
                        icon="account-multiple-plus-outline"
                        label={t('commerce.wallet.makeReferralCode')}
                        onPress={createCode}
                        disabled={makeCode.isPending}
                        testID="wallet-make-referral"
                      />
                    </View>
                  ) : null}
                  {codeError ? <Text style={{ color: c.error, fontSize: 13 }} testID="wallet-referral-error">{codeError}</Text> : null}
                </View>
              </Card>
              // <<< GAP-C-SHOP
            ) : null}

            {can.topUp || can.refund || can.adjust || can.payBill ? (
              <ActionRow>
                {can.topUp ? <PillButton c={c} icon="plus-circle-outline" label={t('commerce.wallet.addCredit')} onPress={() => setSheet('TOPUP')} testID="wallet-topup" /> : null}
                {can.payBill ? <PillButton c={c} tone="outline" icon="receipt" label={t('commerce.wallet.payBill')} onPress={() => setSheet('PAY_BILL')} testID="wallet-paybill" /> : null}
                {can.refund ? <PillButton c={c} tone="outline" icon="cash-refund" label={t('commerce.wallet.payBack')} onPress={() => setSheet('REFUND')} testID="wallet-refund" /> : null}
                {can.adjust ? <PillButton c={c} tone="outline" icon="tune-variant" label={t('commerce.wallet.adjust')} onPress={() => setSheet('ADJUST')} testID="wallet-adjust" /> : null}
              </ActionRow>
            ) : null}
          </>
        ) : null}

        <SectionLabel c={c}>{t('commerce.wallet.statement')}</SectionLabel>
        <ChipRow
          c={c}
          value={bucket}
          options={[
            { key: 'ALL', label: t('commerce.wallet.filterAll') },
            { key: 'CREDIT', label: t('commerce.common.storeCredit') },
            { key: 'POINTS', label: t('commerce.wallet.points') },
          ]}
          onChange={(b) => { setBucket(b); setPage(1); }}
        />
        {statement.isPending ? <ActivityIndicator color={c.primary} /> : null}
        {statement.isError ? <ErrorBlock c={c} message={apiErrorMessage(statement.error)} onRetry={() => void statement.refetch()} /> : null}
        {statement.isSuccess && statement.data.page === 1 && statement.data.data.length === 0 ? (
          <EmptyBlock c={c} icon="format-list-bulleted" title={t('commerce.wallet.noEntries')} />
        ) : null}
        {entries.length ? (
          <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
            {entries.map((e) => (
              <StatementRow key={e.id} row={e} onReceipt={() => void openReceipt(e)} receiptBusy={receiptBusy === e.id} />
            ))}
          </Card>
        ) : null}
        {statement.data && entries.length < statement.data.total ? (
          <PillButton c={c} tone="outline" label={t('commerce.common.more')} onPress={() => setPage((p) => p + 1)} disabled={statement.isFetching} />
        ) : null}
      </View>

      {w && (sheet === 'TOPUP' || sheet === 'REFUND') ? (
        <MoneySheet kind={sheet} partyId={partyId} creditPaise={credit} onDismiss={() => setSheet(null)} />
      ) : null}
      {w && sheet === 'ADJUST' ? (
        <AdjustSheet partyId={partyId} walletOn={access.has('WALLET')} loyaltyOn={access.has('LOYALTY')} onDismiss={() => setSheet(null)} />
      ) : null}
      {w && sheet === 'PAY_BILL' ? (
        <PayBillSheet partyId={partyId} creditPaise={credit} onDismiss={() => setSheet(null)} />
      ) : null}
    </Screen>
  );
}

function StatementRow({ row, onReceipt, receiptBusy }: { row: WalletStatementRow; onReceipt?: () => void; receiptBusy?: boolean }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const plus = row.amount > 0;
  const amount = row.bucket === 'CREDIT'
    ? `${plus ? '+' : '−'}${formatPaise(Math.abs(row.amount))}`
    : `${plus ? '+' : '−'}${t('commerce.common.points', { count: Math.abs(row.amount) })}`;
  const after = row.bucket === 'CREDIT' ? formatPaise(row.balanceAfter) : t('commerce.common.points', { count: row.balanceAfter });
  const when = new Date(row.createdAt);
  const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
  return (
    <View style={[styles.entry, { borderColor: c.divider }]} testID={`entry-${row.id}`}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={2}>{t(statementLabelKey(row))}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={2}>
          {[`${formatI18nDate(row.createdAt, t)} ${time}`, row.sourceRef, row.createdByName].filter(Boolean).join(' · ')}
        </Text>
        {row.note ? <Text style={{ color: c.textSecondary, fontSize: 12, fontStyle: 'italic' }} numberOfLines={2}>{row.note}</Text> : null}
        {/* >>> GAP-C-SHOP — a top-up / pay-back opens its receipt PDF (the same share sheet as after the top-up). */}
        {onReceipt && statementReceiptOf(row) ? (
          <View style={{ alignSelf: 'flex-start', marginTop: 6 }}>
            <PillButton c={c} tone="outline" icon="file-pdf-box" label={t('commerce.wallet.receipt')} onPress={onReceipt} disabled={receiptBusy} testID={`entry-receipt-${row.id}`} />
          </View>
        ) : null}
        {/* <<< GAP-C-SHOP */}
      </View>
      <View style={{ alignItems: 'flex-end', maxWidth: '45%' }}>
        <Text style={{ color: plus ? c.success : c.error, fontWeight: '700' }}>{amount}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 11.5 }}>{t('commerce.wallet.balanceAfter', { amount: after })}</Text>
      </View>
    </View>
  );
}

/** Add credit (money received → credit) or Pay back (credit → money). Same form; the receipt is shared after. */
function MoneySheet({ kind, partyId, creditPaise, onDismiss }: {
  kind: 'TOPUP' | 'REFUND'; partyId: string; creditPaise: number; onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const topUp = useWalletTopUp(partyId);
  const refund = useWalletRefund(partyId);
  const m = kind === 'TOPUP' ? topUp : refund;
  const key = useRef(newIdempotencyKey(kind === 'TOPUP' ? 'wallet-topup' : 'wallet-refund'));
  const [amount, setAmount] = useState(kind === 'REFUND' ? paiseToInput(creditPaise) : '');
  const [mode, setMode] = useState<TopUpMode>('CASH');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<TopUpResult | null>(null);
  const [sharing, setSharing] = useState(false);

  const submit = () => {
    setError(null);
    const paise = topUpAmount(amount);
    if (!paise) { setError(t('commerce.wallet.err.amount')); return; }
    if (kind === 'REFUND' && paise > creditPaise) { setError(t('commerce.wallet.err.moreThanCredit', { amount: formatPaise(creditPaise) })); return; }
    m.mutate(
      { body: { amountPaise: paise, mode, ...(reference.trim() ? { reference: reference.trim().slice(0, 80) } : {}) }, key: key.current },
      { onSuccess: (r) => setDone(r), onError: (e) => setError(apiErrorMessage(e)) },
    );
  };

  const share = async () => {
    if (!done) return;
    setSharing(true);
    try { await shareWalletReceipt(partyId, done.paymentId, done.receiptNo); } catch (e) { setError(apiErrorMessage(e)); } finally { setSharing(false); }
  };

  const title = kind === 'TOPUP' ? t('commerce.wallet.addCredit') : t('commerce.wallet.payBack');
  return (
    <Sheet
      visible
      onDismiss={onDismiss}
      title={title}
      testID="wallet-money-sheet"
      footer={done ? (
        <>
          <PillButton c={c} icon="share-variant" label={t('commerce.wallet.shareReceipt')} onPress={() => void share()} disabled={sharing} testID="wallet-share-receipt" />
          <PillButton c={c} tone="outline" label={t('commerce.common.done')} onPress={onDismiss} />
        </>
      ) : (
        <PillButton c={c} icon="check" label={title} onPress={submit} disabled={m.isPending} testID="wallet-money-save" />
      )}
    >
      {done ? (
        <View style={{ gap: 6 }} testID="wallet-money-done">
          <Text style={{ color: c.success, fontWeight: '700', fontSize: 15 }}>
            {kind === 'TOPUP'
              ? t('commerce.wallet.topUpDone', { amount: formatPaise(done.amountPaise) })
              : t('commerce.wallet.refundDone', { amount: formatPaise(done.amountPaise) })}
          </Text>
          <Text style={{ color: c.textPrimary }}>{t('commerce.wallet.receiptNo', { number: done.receiptNo })}</Text>
          <Text style={{ color: c.textSecondary }}>{t('commerce.wallet.newBalance', { amount: formatPaise(done.creditPaise) })}</Text>
        </View>
      ) : (
        <>
          <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {kind === 'TOPUP' ? t('commerce.wallet.topUpBody') : t('commerce.wallet.refundBody', { amount: formatPaise(creditPaise) })}
          </Text>
          <TextInput
            mode="outlined"
            label={t('commerce.wallet.amount')}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            left={<TextInput.Affix text="₹" />}
            outlineStyle={{ borderRadius: radii.field }}
            style={{ backgroundColor: 'transparent', maxWidth: 240 }}
            testID="wallet-amount"
          />
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{kind === 'TOPUP' ? t('commerce.wallet.howReceived') : t('commerce.wallet.howPaid')}</Text>
          <ChoiceChips c={c} options={TOPUP_MODES.map((md) => ({ key: md, label: t(`payments.mode.${md}`) }))} value={[mode]} onChange={(v) => setMode(v[0] ?? 'CASH')} />
          <TextInput
            mode="outlined"
            dense
            label={t('commerce.wallet.reference')}
            value={reference}
            onChangeText={setReference}
            maxLength={80}
            outlineStyle={{ borderRadius: radii.field }}
            style={{ backgroundColor: 'transparent' }}
          />
        </>
      )}
      {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="wallet-money-error">{error}</Text> : null}
    </Sheet>
  );
}

/** A manual correction with a reason (WALLET_MANAGE): credit in rupees, points whole. */
function AdjustSheet({ partyId, walletOn, loyaltyOn, onDismiss }: {
  partyId: string; walletOn: boolean; loyaltyOn: boolean; onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const adjust = useWalletAdjust(partyId);
  const key = useRef(newIdempotencyKey('wallet-adjust'));
  const buckets = [...(walletOn ? ['CREDIT' as const] : []), ...(loyaltyOn ? ['POINTS' as const] : [])];
  const [bucket, setBucket] = useState<WalletBucket>(buckets[0] ?? 'CREDIT');
  const [direction, setDirection] = useState<'ADD' | 'REMOVE'>('ADD');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const out = adjustBody({ bucket, direction, amount, reason });
    if (!out.ok) { setError(t(out.field === 'amount' ? 'commerce.wallet.err.amount' : 'commerce.wallet.err.reason')); return; }
    adjust.mutate({ body: out.body, key: key.current }, { onSuccess: () => onDismiss(), onError: (e) => setError(apiErrorMessage(e)) });
  };

  return (
    <Sheet
      visible
      onDismiss={onDismiss}
      title={t('commerce.wallet.adjust')}
      testID="wallet-adjust-sheet"
      footer={<PillButton c={c} icon="check" label={t('common.save')} onPress={submit} disabled={adjust.isPending} testID="wallet-adjust-save" />}
    >
      {buckets.length > 1 ? (
        <ChoiceChips
          c={c}
          options={buckets.map((b) => ({ key: b, label: b === 'CREDIT' ? t('commerce.common.storeCredit') : t('commerce.wallet.points') }))}
          value={[bucket]}
          onChange={(v) => setBucket(v[0] ?? bucket)}
        />
      ) : null}
      <ChoiceChips
        c={c}
        options={[{ key: 'ADD' as const, label: t('commerce.wallet.add') }, { key: 'REMOVE' as const, label: t('commerce.wallet.remove') }]}
        value={[direction]}
        onChange={(v) => setDirection(v[0] ?? 'ADD')}
        testID="wallet-adjust-direction"
      />
      <TextInput
        mode="outlined"
        label={bucket === 'CREDIT' ? t('commerce.wallet.amount') : t('commerce.wallet.pointsAmount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        left={bucket === 'CREDIT' ? <TextInput.Affix text="₹" /> : undefined}
        outlineStyle={{ borderRadius: radii.field }}
        style={{ backgroundColor: 'transparent', maxWidth: 240 }}
        testID="wallet-adjust-amount"
      />
      <TextInput
        mode="outlined"
        label={t('commerce.wallet.reason')}
        value={reason}
        onChangeText={setReason}
        maxLength={300}
        multiline
        outlineStyle={{ borderRadius: radii.field }}
        style={{ backgroundColor: 'transparent' }}
        testID="wallet-adjust-reason"
      />
      {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="wallet-adjust-error">{error}</Text> : null}
    </Sheet>
  );
}

/** Store credit onto one of this customer's unpaid bills. */
function PayBillSheet({ partyId, creditPaise, onDismiss }: { partyId: string; creditPaise: number; onDismiss: () => void }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const pay = useWalletPayBill(partyId);
  const key = useRef(newIdempotencyKey('wallet-paybill'));
  const bills = useQuery({
    queryKey: ['billing', 'documents', { partyId, type: 'TAX_INVOICE', status: documentStatusGroup.UNPAID, for: 'wallet' }],
    queryFn: () => documentsApi.list({ partyId, type: 'TAX_INVOICE', status: documentStatusGroup.UNPAID, limit: 20 }),
  });
  const [picked, setPicked] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(() => (bills.data?.data ?? []).map((d) => ({
    id: d._id, number: d.number ?? '—', date: d.documentDate, outstanding: Math.max(0, d.totals.grandPaise - (d.paidPaise ?? 0)),
  })).filter((r) => r.outstanding > 0), [bills.data]);

  const choose = (id: string, outstanding: number) => {
    setPicked(id);
    setAmount(paiseToInput(Math.min(outstanding, creditPaise)));
    key.current = newIdempotencyKey('wallet-paybill');
  };
  const submit = () => {
    setError(null);
    const row = rows.find((r) => r.id === picked);
    const paise = parseRupeesToPaise(amount);
    if (!row || !paise || paise <= 0 || paise > row.outstanding || paise > creditPaise) { setError(t('commerce.wallet.err.payAmount')); return; }
    pay.mutate({ documentId: row.id, amountPaise: paise, key: key.current }, { onSuccess: () => onDismiss(), onError: (e) => setError(apiErrorMessage(e)) });
  };

  return (
    <Sheet
      visible
      onDismiss={onDismiss}
      title={t('commerce.wallet.payBill')}
      testID="wallet-paybill-sheet"
      footer={<PillButton c={c} icon="check" label={t('commerce.wallet.payBill')} onPress={submit} disabled={!picked || pay.isPending} testID="wallet-paybill-save" />}
    >
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('commerce.wallet.payBillBody', { amount: formatPaise(creditPaise) })}</Text>
      {bills.isPending ? <ActivityIndicator color={c.primary} /> : null}
      {bills.isError ? <Text style={{ color: c.error }}>{apiErrorMessage(bills.error)}</Text> : null}
      {bills.isSuccess && rows.length === 0 ? <Text style={{ color: c.textSecondary }}>{t('commerce.wallet.noUnpaid')}</Text> : null}
      {rows.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => choose(r.id, r.outstanding)}
          accessibilityRole="radio"
          accessibilityState={{ selected: picked === r.id }}
          style={[styles.bill, { borderColor: picked === r.id ? c.primary : c.divider, backgroundColor: picked === r.id ? c.surfaceVariant : c.surface }]}
          testID={`wallet-bill-${r.id}`}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>{r.number}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{formatI18nDate(r.date, t)}</Text>
          </View>
          <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{formatPaise(r.outstanding)}</Text>
        </Pressable>
      ))}
      {picked ? (
        <TextInput
          mode="outlined"
          label={t('commerce.wallet.amount')}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          left={<TextInput.Affix text="₹" />}
          outlineStyle={{ borderRadius: radii.field }}
          style={{ backgroundColor: 'transparent', maxWidth: 240 }}
          testID="wallet-paybill-amount"
        />
      ) : null}
      {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="wallet-paybill-error">{error}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  entry: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  bill: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: radii.card, paddingHorizontal: 12, minHeight: 56 },
});
