import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { IconButton, Modal, Portal, Snackbar, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../../src/hooks';
import { qk } from '../../../../src/lib/queryKeys';
import { apiErrorCode, apiErrorMessage } from '../../../../src/api/axios';
// >>> M20 — PHARMACY parity with the web receive screen: a batch number + expiry per
// medicine line (sent only when typed), and the "expired batch really received" confirm.
import { useCategoryModules } from '../../../../src/features/p2/useCategoryModules';
import { parseExpiryMonth } from '../../../../src/features/pharmacy/logic';
import { TextField } from '../../../../src/components/ui';
// <<< M20
import { newIdempotencyKey } from '../../../../src/lib/idempotency';
import { settingsApi } from '../../../../src/api/settings.api';
import { BarcodeScannerView, ProductScanOutcome } from '../../../../src/features/scanner';
import { purchasesApi, type ReceivePoBody } from '../../../../src/features/purchases/api';
import {
  buildReceiveBody, initialReceiveDraft, maxReceivable, ReceiveDraftLine, tickLineByItem,
} from '../../../../src/features/purchases/logic';
import { ReceiveLineRow } from '../../../../src/features/purchases/components/ReceiveLineRow';
import { ErrorBlock, Loading, Screen } from '../../../../src/features/more/ui';
import { ActionRow, Banner, PillButton, TwoPane } from '../../../../src/features/p1/ui';
import { ReasonDialog } from '../../../../src/features/p1/ReasonDialog';

/**
 * Receive goods against a purchase order (screen S4) — the GRN.
 *
 * Three taps for the common case: open the PO → Receive → Save. Every pending
 * line starts filled with what is still to come ("it all arrived"); the
 * partner only touches the lines that came short, or scans items to count
 * them up from zero. A rate can be changed per line when the goods came at a
 * different price. Over the pending quantity (plus the shop's over-receipt %)
 * is refused on the line before the server's 409 GRN_QTY_EXCEEDS_PENDING.
 */
export default function ReceiveAgainstPoScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { poId } = useLocalSearchParams<{ poId: string }>();
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const canManage = can('PURCHASES_MANAGE', 'FULL');

  const receipts = useQuery({ queryKey: qk.purchases.receipts(String(poId)), queryFn: () => purchasesApi.receipts(String(poId)), enabled: !!poId });
  const invoiceSettings = useQuery({ queryKey: qk.billing.settings(), queryFn: settingsApi.invoice.get, staleTime: 5 * 60_000 });
  const overPct = invoiceSettings.data?.overReceiptPercent ?? 0;

  const [draft, setDraft] = useState<Record<number, ReceiveDraftLine>>({});
  const [scanFromZero, setScanFromZero] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  // M20 — per PO line: what was typed in the batch boxes (PHARMACY only).
  const pharmacyOn = useCategoryModules().has('PHARMACY');
  const [batches, setBatches] = useState<Record<number, { batchNo: string; expiry: string }>>({});

  useEffect(() => {
    if (receipts.data) setDraft(initialReceiveDraft(receipts.data.lines));
  }, [receipts.data]);

  /** One key per "Save" intent; a changed form is a new intent. */
  const intentKey = useRef<string | null>(null);
  useEffect(() => { intentKey.current = null; }, [draft, batches]);

  const lines = receipts.data?.lines ?? [];
  const check = useMemo(() => buildReceiveBody(lines, draft, overPct), [lines, draft, overPct]);
  const overSet = new Set(check.over.map((o) => o.poLineIndex));

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.billing.all() });
    void queryClient.invalidateQueries({ queryKey: qk.catalog.all() });
  };

  /** M20: the lines with their batch (only typed ones, only for a pharmacy), or the first half-filled line. */
  const withBatches = (): { lines: ReceivePoBody['lines']; problem?: string } => {
    if (!pharmacyOn) return { lines: check.body };
    const out: ReceivePoBody['lines'] = [];
    for (const row of check.body) {
      const b = batches[row.poLineIndex];
      const no = b?.batchNo.trim() ?? '';
      const exp = b?.expiry.trim() ?? '';
      if (!no && !exp) { out.push(row); continue; }
      const month = parseExpiryMonth(exp);
      if (!no || !month) {
        const item = lines.find((l) => l.poLineIndex === row.poLineIndex)?.itemName ?? '';
        return { lines: [], problem: t('purchases.receive.batchIncomplete', { item }) };
      }
      out.push({ ...row, batch: { batchNo: no.toUpperCase(), expiryDate: month } });
    }
    return { lines: out };
  };

  const receive = useMutation({
    mutationFn: (confirmExpiredBatch: boolean = false) => {
      if (!intentKey.current) intentKey.current = newIdempotencyKey('grn');
      const { lines: body } = withBatches();
      return purchasesApi.receive(
        String(poId),
        { lines: body, issue: true, ...(pharmacyOn && confirmExpiredBatch ? { confirmExpiredBatch: true } : {}) },
        intentKey.current,
      );
    },
    onSuccess: (res) => {
      invalidate();
      Alert.alert(
        t('purchases.receive.savedTitle'),
        t('purchases.receive.savedBody', { number: res.grn.number ?? '' }),
        [
          { text: t('purchases.receive.openGrn'), onPress: () => router.replace({ pathname: '/billing/[id]', params: { id: res.grn._id } }) },
          { text: t('purchases.receive.billNow'), onPress: () => router.replace({ pathname: '/purchases/bill-from-grns', params: { grnId: res.grn._id } }) },
        ],
      );
    },
    onError: (e, confirmed) => {
      // M20 — an expired batch that really arrived: asked for, never assumed (web parity).
      if (pharmacyOn && !confirmed && apiErrorCode(e) === 'BATCH_EXPIRED_ON_RECEIPT') {
        Alert.alert(t('purchases.receive.expiredTitle'), apiErrorMessage(e), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('purchases.receive.expiredConfirm'), style: 'destructive', onPress: () => { intentKey.current = null; receive.mutate(true); } },
        ]);
        return;
      }
      setToast(apiErrorMessage(e, t('purchases.receive.failed')));
    },
  });
  const save = () => {
    const { problem } = withBatches();
    if (problem) { setToast(problem); return; }
    receive.mutate(false);
  };

  const closeShort = useMutation({
    mutationFn: (reason: string) => purchasesApi.closeShort(String(poId), reason),
    onSuccess: () => { setCloseOpen(false); invalidate(); router.back(); },
    onError: (e) => setToast(apiErrorMessage(e, t('purchases.receive.closeFailed'))),
  });

  const onScan = (outcome: ProductScanOutcome) => {
    if (outcome.status !== 'found') {
      setToast(outcome.status === 'error' ? outcome.message : t('purchases.receive.scanNotOnPo'));
      return;
    }
    const next = tickLineByItem(lines, draft, outcome.product._id, scanFromZero);
    if (!next) { setToast(t('purchases.receive.scanNotOnPo')); return; }
    setScanFromZero(false);
    setDraft(next);
  };

  const title = t('purchases.receive.title');
  if (receipts.isPending) return <Screen c={c} rise title={title}><Loading c={c} skeleton={3} /></Screen>;
  if (receipts.isError || !receipts.data) {
    return (
      <Screen c={c} rise title={title}>
        <ErrorBlock c={c} message={apiErrorMessage(receipts.error, t('purchases.receive.loadFailed'))} onRetry={() => receipts.refetch()} />
      </Screen>
    );
  }

  const { po } = receipts.data;
  const open = po.fulfilment === 'OPEN' || po.fulfilment === 'PARTIAL';
  const anyToReceive = check.body.length > 0;

  const summary = (
    <View style={{ gap: 10 }}>
      <Banner c={c} body={t('purchases.receive.intro', { number: po.number ?? '', supplier: po.partyName })} />
      {!open && <Banner c={c} tone="warn" body={t('purchases.receive.notOpen', { state: t(`purchases.fulfilment.${po.fulfilment}`) })} />}
      {open && canManage && (
        <ActionRow>
          <PillButton c={c} tone="outline" icon="barcode-scan" label={t('purchases.receive.scan')} onPress={() => { setScanFromZero(true); setScannerOpen(true); }} />
          <PillButton c={c} tone="outline" icon="numeric-0-box-outline" label={t('purchases.receive.clearAll')} onPress={() => setDraft(Object.fromEntries(lines.map((l) => [l.poLineIndex, { qty: 0 }])))} />
          <PillButton c={c} tone="danger" icon="close-circle-outline" label={t('purchases.receive.closeShort')} onPress={() => setCloseOpen(true)} />
        </ActionRow>
      )}
      {receipts.data.grns.length > 0 && (
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>
          {t('purchases.receive.earlierGrns', { list: receipts.data.grns.map((g) => g.number ?? '—').join(', ') })}
        </Text>
      )}
    </View>
  );

  const lineList = (
    <View style={{ gap: 10 }}>
      {pharmacyOn && open && canManage ? <Banner c={c} body={t('purchases.receive.batchHint')} /> : null}
      {lines.map((l) => (
        <View key={l.poLineIndex} style={styles.lineBlock}>
          <ReceiveLineRow
            c={c}
            line={l}
            value={draft[l.poLineIndex] ?? { qty: 0 }}
            max={maxReceivable(l.pending, overPct)}
            over={overSet.has(l.poLineIndex)}
            onChange={(next) => setDraft((d) => ({ ...d, [l.poLineIndex]: next }))}
          />
          {/* M20 — PHARMACY: batch + expiry for this line (both, or neither). */}
          {pharmacyOn && open && canManage && l.itemId && (draft[l.poLineIndex]?.qty ?? 0) > 0 ? (
            <View style={styles.batchRow} testID={`receive-batch-${l.poLineIndex}`}>
              <TextField
                label={t('p2.pharmacy.split.batchNo')}
                value={batches[l.poLineIndex]?.batchNo ?? ''}
                onChangeText={(v) => setBatches((b) => ({ ...b, [l.poLineIndex]: { batchNo: v.slice(0, 30), expiry: b[l.poLineIndex]?.expiry ?? '' } }))}
                autoCapitalize="characters"
                containerStyle={styles.batchField}
              />
              <TextField
                label={t('p2.pharmacy.split.expiry')}
                value={batches[l.poLineIndex]?.expiry ?? ''}
                onChangeText={(v) => setBatches((b) => ({ ...b, [l.poLineIndex]: { batchNo: b[l.poLineIndex]?.batchNo ?? '', expiry: v.slice(0, 10) } }))}
                placeholder="2027-03"
                keyboardType="numbers-and-punctuation"
                containerStyle={styles.batchField}
              />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );

  return (
    <Screen
      rise
      c={c}
      title={title}
      subtitle={po.number ? `${po.number} · ${po.partyName}` : po.partyName}
      floating={
        <>
          {open && canManage ? (
            <View style={[styles.bottomBar, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
              <PillButton
                c={c}
                icon="check"
                label={receive.isPending ? t('p1.saving') : t('purchases.receive.save', { count: check.body.length })}
                disabled={!anyToReceive || check.over.length > 0 || receive.isPending}
                onPress={save}
                testID="receive-save"
              />
            </View>
          ) : null}
          <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>
        </>
      }
    >
      <TwoPane left={summary} right={lineList} />
      <View style={{ height: 72 }} />

      <Portal>
        <Modal visible={scannerOpen} onDismiss={() => setScannerOpen(false)} contentContainerStyle={[styles.scanner, { backgroundColor: c.background }]}>
          <View style={styles.scanHeader}>
            <Text style={{ color: c.textPrimary, fontSize: 16, fontWeight: '600', flexShrink: 1 }}>{t('purchases.receive.scanTitle')}</Text>
            <IconButton icon="close" onPress={() => setScannerOpen(false)} accessibilityLabel={t('common.done')} />
          </View>
          {/* >>> SCANNER — stock in: a carton's full ITF-14 is accepted too. */}
          <BarcodeScannerView active={scannerOpen} onResult={onScan} hint={t('purchases.receive.scanHint')} cartonCodes />
        </Modal>
      </Portal>

      <ReasonDialog
        visible={closeOpen}
        title={t('purchases.receive.closeShortTitle')}
        body={t('purchases.receive.closeShortBody')}
        confirmLabel={t('purchases.receive.closeShort')}
        submitting={closeShort.isPending}
        onCancel={() => setCloseOpen(false)}
        onSubmit={(reason) => closeShort.mutate(reason)}
        danger
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'flex-end',
  },
  scanner: { flex: 1, margin: 0 },
  lineBlock: { gap: 8 },
  batchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 4 },
  batchField: { flexGrow: 1, flexBasis: 140, minWidth: 0 },
  scanHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingTop: 8 },
});
