import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import {
  ActivityIndicator, Button, Dialog, Divider, IconButton, Portal, Snackbar, Surface, Text, TextInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { documentsApi } from '../../../src/features/billing/documents.api';
import { shareDocumentPdf } from '../../../src/features/billing/pdf';
import { getThermalPrinter } from '../../../src/features/printing';
import { DOCUMENT_TYPE_LABEL } from '../../../src/features/billing/types';
import { DocumentStatusChip } from '../../../src/features/billing/components/StatusChip';

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

  const [busy, setBusy] = useState<'share' | 'print' | 'issue' | 'cancel' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

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
            <Button onPress={() => setCancelOpen(false)}>Not now</Button>
            <Button loading={busy === 'cancel'} onPress={handleCancel} textColor={c.error}>
              Cancel document
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
