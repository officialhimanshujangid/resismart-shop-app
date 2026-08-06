import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import {
  ActivityIndicator, Button, Dialog, Divider, IconButton, Menu, Portal, RadioButton, SegmentedButtons, Snackbar, Surface, Text, TextInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { formatPaise, parseRupeesToPaise, paiseToInput } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { documentsApi } from '../../../src/features/billing/documents.api';
import { shareDocumentPdf } from '../../../src/features/billing/pdf';
import { getThermalPrinter } from '../../../src/features/printing';
import { CONVERSION_TARGETS, DOCUMENT_TYPE_LABEL, PartnerDocumentType, behaviourOf } from '../../../src/features/billing/types';
import { DocumentStatusChip } from '../../../src/features/billing/components/StatusChip';
import { toHref } from '../../../src/features/billing/routeHref';
import { paymentsApi } from '../../../src/features/payments/payments.api';
import { PAYMENT_MODES, PAYMENT_MODE_LABEL, PaymentMode } from '../../../src/features/payments/types';

/**
 * The channels `sendDocumentSchema` accepts server-side — `documentsApi.send`
 * already spoke this shape (see that file's own header on why: a dialog that
 * posted a list against a route validating one channel would 400 every time).
 * What was missing was a caller offering the choice at all — the only send
 * path on this screen fired `WHATSAPP` unconditionally as a side effect of
 * "Share". This dialog is the mobile twin of web `SendDialog.tsx`.
 */
const SEND_CHANNELS = [
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'EMAIL', label: 'Email' },
  { key: 'SMS', label: 'SMS' },
] as const;
type SendChannel = typeof SEND_CHANNELS[number]['key'];

/**
 * A document's own page: what it says, and the three things this screen does
 * with a real, issued bill — share it (spec §4's "one-tap WhatsApp"), print
 * it (spec §4's printer question, via `getThermalPrinter()`), or cancel it.
 *
 * DRAFT documents seen here are the one edge case worth naming: normally a
 * bill never reaches the server as a DRAFT the partner has to look at — `New
 * Invoice` issues it in the same tap it creates it (via `draftStore`). A
 * lingering DRAFT means either a sync was interrupted between `create` and
 * `issue` on a previous app run (closed correctly — see `draftStore.ts`'s
 * header, `serverDraftId` makes the NEXT sync attempt call `issue`, never
 * `create`, on it) or, rarely, the one ambiguous-`create` gap that same file
 * documents. Either way this screen offers "Issue now" rather than hiding it.
 */
export default function DocumentDetailScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const canManage = can('INVOICING_MANAGE', 'FULL');

  const query = useQuery({
    queryKey: qk.billing.document(String(id)),
    queryFn: () => documentsApi.get(String(id)),
    enabled: !!id,
  });

  const [busy, setBusy] = useState<'share' | 'print' | 'issue' | 'cancel' | 'convert' | 'pay' | 'send' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // ---- send via channel (C7) ----
  const [sendOpen, setSendOpen] = useState(false);
  const [sendChannel, setSendChannel] = useState<SendChannel>('WHATSAPP');

  // ---- convert (C4) ----
  const [convertMenuOpen, setConvertMenuOpen] = useState(false);

  // ---- record payment (C1) ----
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<PaymentMode>('CASH');
  const [payReference, setPayReference] = useState('');

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.billing.all() });
    void queryClient.invalidateQueries({ queryKey: qk.usage() });
  }, [queryClient]);

  const doc = query.data;
  const label = doc ? (doc.number ?? `${DOCUMENT_TYPE_LABEL[doc.type]}-draft`) : '';

  const handleShare = useCallback(async () => {
    if (!doc) return;
    setBusy('share');
    try {
      await shareDocumentPdf(doc._id, label);
      // Best-effort — the share sheet itself already succeeded from the
      // partner's point of view; a failure here just leaves `sentVia` stale,
      // which `partner-document.controller.ts`'s own comment calls the honest
      // trade for not blocking on it.
      documentsApi.send(doc._id, 'WHATSAPP').catch(() => undefined);
    } catch (e: unknown) {
      setToast(apiErrorMessage(e, 'Could not share this invoice.'));
    } finally {
      setBusy(null);
    }
  }, [doc, label]);

  const handlePrint = useCallback(async () => {
    if (!doc) return;
    setBusy('print');
    try {
      await getThermalPrinter().print({ documentId: doc._id, label });
    } catch (e: unknown) {
      setToast(apiErrorMessage(e, 'Could not open the print dialog.'));
    } finally {
      setBusy(null);
    }
  }, [doc, label]);

  const handleIssue = useCallback(async () => {
    if (!doc) return;
    setBusy('issue');
    try {
      const { document } = await documentsApi.issue(doc._id);
      queryClient.setQueryData(qk.billing.document(doc._id), document);
      invalidate();
    } catch (e: unknown) {
      setToast(apiErrorMessage(e, 'Could not issue this document.'));
    } finally {
      setBusy(null);
    }
  }, [doc, queryClient, invalidate]);

  const handleCancel = useCallback(async () => {
    if (!doc) return;
    setBusy('cancel');
    try {
      const result = await documentsApi.cancel(doc._id, cancelReason.trim() || undefined);
      queryClient.setQueryData(qk.billing.document(doc._id), result.data.cancelled);
      invalidate();
      setCancelOpen(false);
      setCancelReason('');
    } catch (e: unknown) {
      setToast(apiErrorMessage(e, 'Could not cancel this document.'));
    } finally {
      setBusy(null);
    }
  }, [doc, cancelReason, queryClient, invalidate]);

  /**
   * Turn this document into its target type — C4, mirroring web
   * `ConvertDialog.tsx`. One server transaction writes both documents; the
   * new one is a DRAFT (its own `documentDate` is set to "now" here, exactly
   * as the web dialog does), so this navigates straight to it rather than
   * back to this screen — there is nothing further to do on the source.
   */
  const handleConvert = useCallback(
    async (to: PartnerDocumentType) => {
      if (!doc) return;
      setConvertMenuOpen(false);
      setBusy('convert');
      try {
        const { created } = await documentsApi.convert(doc._id, { to, documentDate: new Date().toISOString() });
        invalidate();
        router.replace(toHref(`/(app)/billing/${created._id}`));
      } catch (e: unknown) {
        setToast(apiErrorMessage(e, 'That could not be converted.'));
      } finally {
        setBusy(null);
      }
    },
    [doc, invalidate],
  );

  /**
   * Send this document on a chosen channel — C7. `handleShare` above already
   * fires a best-effort `WHATSAPP` send as a side effect of the native share
   * sheet; this is the explicit path for a partner who wants Email or SMS
   * instead, or who wants to send WITHOUT opening the share sheet at all.
   */
  const handleSend = useCallback(async () => {
    if (!doc) return;
    setBusy('send');
    try {
      await documentsApi.send(doc._id, sendChannel);
      setSendOpen(false);
      setToast(`Sent to ${doc.partySnapshot.name}.`);
    } catch (e: unknown) {
      setToast(apiErrorMessage(e, 'That could not be sent.'));
    } finally {
      setBusy(null);
    }
  }, [doc, sendChannel]);

  /**
   * Record what came in (or went out) against exactly this document — C1.
   * `direction` is never a choice here: it comes straight off the document
   * type's `settlement` column, the same rule `RecordPaymentDialog.tsx` uses
   * on web. Requires `doc.partyId` — `createPaymentSchema` on the server
   * requires a party, and a walk-in document (no party selected when it was
   * raised) genuinely has nobody to attribute the payment to; `canRecordPayment`
   * below gates the button on that so this handler is never reached without one.
   */
  const handleRecordPayment = useCallback(async () => {
    if (!doc || !doc.partyId) return;
    const outstandingPaise = Math.max(0, doc.totals.grandPaise - doc.paidPaise);
    const amountPaise = parseRupeesToPaise(payAmount) ?? 0;
    if (amountPaise <= 0) {
      setToast('Enter an amount greater than zero.');
      return;
    }
    if (amountPaise > outstandingPaise) {
      setToast(`Only ${formatPaise(outstandingPaise)} is outstanding on this document.`);
      return;
    }
    const behaviour = behaviourOf(doc.type);
    const direction = behaviour.settlement === 'NONE' ? 'IN' : behaviour.settlement;
    setBusy('pay');
    try {
      await paymentsApi.create({
        partyId: doc.partyId,
        direction,
        mode: payMode,
        amountPaise,
        allocations: [{ documentId: doc._id, amountPaise }],
        reference: payReference.trim() || undefined,
        receivedAt: new Date().toISOString(),
      });
      const fresh = await documentsApi.get(doc._id);
      queryClient.setQueryData(qk.billing.document(doc._id), fresh);
      invalidate();
      setPayOpen(false);
      setPayAmount('');
      setPayReference('');
      setToast(direction === 'IN' ? 'Payment recorded.' : 'Payment out recorded.');
    } catch (e: unknown) {
      setToast(apiErrorMessage(e, 'That payment could not be recorded.'));
    } finally {
      setBusy(null);
    }
  }, [doc, payAmount, payMode, payReference, queryClient, invalidate]);

  if (query.isPending) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <ActivityIndicator style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!doc) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.topBar}>
          <IconButton icon="arrow-left" onPress={() => router.back()} />
        </View>
        <View style={styles.centerBox}>
          <Text style={{ color: c.textSecondary }}>{apiErrorMessage(query.error, 'That document could not be found.')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isDraft = doc.status === 'DRAFT';
  const canShareOrPrint = !isDraft;
  const canCancel = canManage && doc.status === 'ISSUED';
  // C7 — mirrors web `canSend`: issued (or later) and not cancelled. Sending a
  // DRAFT makes no sense (it has no number yet); sending a CANCELLED document
  // is nothing the party should receive.
  const canSend = canManage && !isDraft && doc.status !== 'CANCELLED';

  const outstandingPaise = Math.max(0, doc.totals.grandPaise - doc.paidPaise);
  const behaviour = behaviourOf(doc.type);
  const conversionTargets = CONVERSION_TARGETS[doc.type];
  const settledStatus = doc.status === 'ISSUED' || doc.status === 'PARTIALLY_PAID' || doc.status === 'PAID';
  // C4 — mirrors web's `canConvert`: not already converted, in a status the
  // server will accept, and the type actually has somewhere to go.
  const canConvert = canManage && !doc.convertedToId && settledStatus && conversionTargets.length > 0;
  // C1 — mirrors web's `canRecordPayment`, plus one check the web dialog skips:
  // `createPaymentSchema` requires a `partyId`, so a walk-in document (no party
  // on file) has nobody to record the payment against.
  const paymentEligible = canManage && behaviour.settlement !== 'NONE'
    && (doc.status === 'ISSUED' || doc.status === 'PARTIALLY_PAID') && outstandingPaise > 0;
  const canRecordPayment = paymentEligible && !!doc.partyId;
  const missingPartyForPayment = paymentEligible && !doc.partyId;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-left" onPress={() => router.back()} accessibilityLabel="Back" />
        <Text style={[styles.topBarTitle, { color: c.textPrimary }]} numberOfLines={1}>
          {label}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.docType, { color: c.textSecondary }]}>{DOCUMENT_TYPE_LABEL[doc.type]}</Text>
              <Text style={[styles.docNumber, { color: c.textPrimary }]}>{label}</Text>
            </View>
            <DocumentStatusChip status={doc.status} c={c} />
          </View>
          <Text style={[styles.docDate, { color: c.textSecondary }]}>
            {new Date(doc.documentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </Surface>

        <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{doc.partySnapshot.name}</Text>
          {!!doc.partySnapshot.phone && <Text style={[styles.cardBody, { color: c.textSecondary }]}>{doc.partySnapshot.phone}</Text>}
          {!!doc.partySnapshot.address && <Text style={[styles.cardBody, { color: c.textSecondary }]}>{doc.partySnapshot.address}</Text>}
          {!!doc.partySnapshot.gstin && <Text style={[styles.cardBody, { color: c.textSecondary }]}>GSTIN: {doc.partySnapshot.gstin}</Text>}
        </Surface>

        <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Items</Text>
          {doc.lines.map((line, idx) => (
            <View key={idx} style={styles.lineRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.lineName, { color: c.textPrimary }]}>{line.itemName}</Text>
                <Text style={[styles.lineMeta, { color: c.textSecondary }]}>
                  {line.qty} {line.unit} × {formatPaise(line.ratePaise)}
                </Text>
              </View>
              <Text style={[styles.lineAmount, { color: c.textPrimary }]}>{formatPaise(line.totalPaise)}</Text>
            </View>
          ))}

          <Divider style={{ marginVertical: 8 }} />
          <TotalRow label="Subtotal" value={doc.totals.subPaise} c={c} />
          {doc.totals.discountPaise > 0 && <TotalRow label="Discount" value={-doc.totals.discountPaise} c={c} />}
          <TotalRow label="Tax" value={doc.totals.taxPaise} c={c} />
          {doc.totals.roundOffPaise !== 0 && <TotalRow label="Round off" value={doc.totals.roundOffPaise} c={c} />}
          <TotalRow label="Total" value={doc.totals.grandPaise} c={c} bold />
          {doc.paidPaise > 0 && <TotalRow label="Paid" value={doc.paidPaise} c={c} />}
          {doc.status !== 'DRAFT' && doc.paidPaise < doc.totals.grandPaise && (
            <TotalRow label="Outstanding" value={doc.totals.grandPaise - doc.paidPaise} c={c} bold tone={c.error} />
          )}
        </Surface>

        {doc.status === 'CANCELLED' && !!doc.cancelledReason && (
          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Cancelled</Text>
            <Text style={[styles.cardBody, { color: c.textSecondary }]}>{doc.cancelledReason}</Text>
          </Surface>
        )}

        {!!doc.convertedToId && (
          <Surface style={[styles.card, { backgroundColor: c.surfaceVariant }]} elevation={0}>
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              Converted into a new document.
            </Text>
            <Button
              mode="text"
              compact
              onPress={() => router.push(toHref(`/(app)/billing/${doc.convertedToId}`))}
              style={{ alignSelf: 'flex-start' }}
            >
              View it
            </Button>
          </Surface>
        )}

        {missingPartyForPayment && (
          <Surface style={[styles.card, { backgroundColor: c.surfaceVariant }]} elevation={0}>
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              This bill has no linked customer, so a payment cannot be attributed to anyone yet. Raise
              it against a searched party (not walk-in) to be able to record what they paid.
            </Text>
          </Surface>
        )}

        {isDraft && (
          <Surface style={[styles.card, { backgroundColor: c.surfaceVariant }]} elevation={0}>
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              This document has not been issued yet — it has no number and cannot be shared or printed.
            </Text>
          </Surface>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
        {isDraft && canManage ? (
          <Button mode="contained" loading={busy === 'issue'} disabled={!!busy} onPress={handleIssue} style={styles.actionButton}>
            Issue now
          </Button>
        ) : (
          <View style={styles.actionRow}>
            <Button
              mode="contained"
              icon="whatsapp"
              loading={busy === 'share'}
              disabled={!!busy || !canShareOrPrint}
              onPress={handleShare}
              style={[styles.actionButton, { flex: 1 }]}
            >
              Share
            </Button>
            <Button
              mode="contained-tonal"
              icon="printer-outline"
              loading={busy === 'print'}
              disabled={!!busy || !canShareOrPrint}
              onPress={handlePrint}
              style={[styles.actionButton, { flex: 1 }]}
            >
              Print
            </Button>
          </View>
        )}
        {(canRecordPayment || canConvert) && (
          <View style={[styles.actionRow, { marginTop: 8 }]}>
            {canRecordPayment && (
              <Button
                mode="contained-tonal"
                icon="cash-plus"
                disabled={!!busy}
                onPress={() => { setPayAmount(paiseToInput(outstandingPaise)); setPayReference(''); setPayMode('CASH'); setPayOpen(true); }}
                style={[styles.actionButton, { flex: 1 }]}
              >
                Record payment
              </Button>
            )}
            {canConvert && (
              <Menu
                visible={convertMenuOpen}
                onDismiss={() => setConvertMenuOpen(false)}
                anchor={
                  <Button
                    mode="outlined"
                    icon="swap-horizontal"
                    loading={busy === 'convert'}
                    disabled={!!busy}
                    onPress={() => setConvertMenuOpen(true)}
                    style={[styles.actionButton, { flex: 1 }]}
                  >
                    Convert
                  </Button>
                }
              >
                {conversionTargets.map((t) => (
                  <Menu.Item key={t} onPress={() => handleConvert(t)} title={`Turn into a ${DOCUMENT_TYPE_LABEL[t].toLowerCase()}`} />
                ))}
              </Menu>
            )}
          </View>
        )}
        {canSend && (
          <Button
            mode="outlined"
            icon="send"
            disabled={!!busy}
            onPress={() => { setSendChannel('WHATSAPP'); setSendOpen(true); }}
            style={{ marginTop: 8, borderRadius: radii.field }}
          >
            Send
          </Button>
        )}
        {canCancel && (
          <Button mode="text" textColor={c.error} disabled={!!busy} onPress={() => setCancelOpen(true)} style={{ marginTop: 4 }}>
            Cancel document
          </Button>
        )}
      </View>

      <Portal>
        <Dialog visible={cancelOpen} onDismiss={() => setCancelOpen(false)}>
          <Dialog.Title>Cancel {label}?</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 10 }}>This cannot be undone. The number stays on record as cancelled.</Text>
            <TextInput
              mode="outlined"
              label="Reason (optional)"
              value={cancelReason}
              onChangeText={setCancelReason}
              outlineStyle={{ borderRadius: radii.field }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCancelOpen(false)} disabled={busy === 'cancel'}>Not now</Button>
            {/* A7: `disabled` used to be implied by `loading` alone, which
                react-native-paper does NOT do on its own — a fast double-tap
                here could fire `handleCancel` twice before the first request
                settled. */}
            <Button loading={busy === 'cancel'} disabled={busy === 'cancel'} onPress={handleCancel} textColor={c.error}>
              Cancel document
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={payOpen} onDismiss={() => setPayOpen(false)}>
          <Dialog.Title>
            {behaviour.settlement === 'OUT' ? 'Record what went out' : 'Record what came in'}
          </Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>
              Against {label} — {formatPaise(outstandingPaise)} outstanding of {formatPaise(doc.totals.grandPaise)}.
            </Text>
            <TextInput
              mode="outlined"
              label="Amount (₹)"
              keyboardType="decimal-pad"
              value={payAmount}
              onChangeText={setPayAmount}
              outlineStyle={{ borderRadius: radii.field }}
            />
            <SegmentedButtons
              value={payMode}
              onValueChange={(v) => setPayMode(v as PaymentMode)}
              density="small"
              buttons={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABEL[m] }))}
            />
            <TextInput
              mode="outlined"
              label="Reference (optional)"
              placeholder="UTR, cheque no., UPI ref…"
              value={payReference}
              onChangeText={setPayReference}
              outlineStyle={{ borderRadius: radii.field }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPayOpen(false)}>Cancel</Button>
            <Button loading={busy === 'pay'} disabled={busy === 'pay'} onPress={handleRecordPayment}>
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* C7 — send channel picker, mirroring web `SendDialog.tsx`. One
            channel per request, matching `sendDocumentSchema`'s enum. */}
        <Dialog visible={sendOpen} onDismiss={() => setSendOpen(false)}>
          <Dialog.Title>Send {label}</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 8 }}>
              To {doc.partySnapshot.name}.
            </Text>
            <RadioButton.Group value={sendChannel} onValueChange={(v) => setSendChannel(v as SendChannel)}>
              {SEND_CHANNELS.map((ch) => (
                <RadioButton.Item key={ch.key} label={ch.label} value={ch.key} labelStyle={{ color: c.textPrimary }} />
              ))}
            </RadioButton.Group>
            {!!doc.sentVia?.length && (
              <Text style={{ color: c.textDisabled, fontSize: 11, marginTop: 4 }}>
                Already sent via {doc.sentVia.join(', ')}.
              </Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSendOpen(false)} disabled={busy === 'send'}>Cancel</Button>
            <Button loading={busy === 'send'} disabled={busy === 'send'} onPress={handleSend}>
              Send
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>
        {toast}
      </Snackbar>
    </SafeAreaView>
  );
}

function TotalRow({
  label, value, c, bold, tone,
}: {
  label: string;
  value: number;
  c: ReturnType<typeof themeColors>;
  bold?: boolean;
  tone?: string;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={{ color: tone ?? c.textSecondary, fontSize: bold ? 15 : 13, fontWeight: bold ? '800' : '500' }}>
        {label}
      </Text>
      <Text style={{ color: tone ?? c.textPrimary, fontSize: bold ? 15 : 13, fontWeight: bold ? '800' : '600' }}>
        {formatPaise(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  topBarTitle: { fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  card: { borderRadius: radii.card, padding: 14, gap: 6 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  docType: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  docNumber: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  docDate: { fontSize: 12, marginTop: 4 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardBody: { fontSize: 13 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  lineName: { fontSize: 13, fontWeight: '600' },
  lineMeta: { fontSize: 11, marginTop: 2 },
  lineAmount: { fontSize: 13, fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bottomBar: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionButton: { borderRadius: radii.field },
});
