import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Modal, useColorScheme, Pressable } from 'react-native';
import { Text, ActivityIndicator, Divider, TextInput, Button, IconButton, HelperText } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PartnerOrder } from '../types';
import { OrderReturnLine, OrderReturnResult } from '../api';
import { useOrderReturnItems } from '../hooks';
import { useOrderReturnEligibility, remainingQty } from '../returnEligibility';
import { newIdempotencyKey } from '../../../lib/idempotency';
import { apiErrorMessage } from '../../../api/axios';
import { themeColors, radii } from '../../../constants/colors';

interface RecordReturnModalProps {
  /** The order to return items for. Rendered only while non-null. */
  order: PartnerOrder | null;
  onClose: () => void;
  /** Fired after the server confirms the credit note — the caller refreshes/patches the order and shows the confirmation. */
  onSuccess: (result: OrderReturnResult) => void;
}

/**
 * M5 — "record a return" off a delivered/invoiced order. A per-line quantity
 * stepper+input (0..remaining, remaining already accounts for anything
 * returned in an EARLIER partial return via `useOrderReturnEligibility`) plus
 * a required reason, `POST`ed to `/partners/me/orders/:id/return-items`.
 *
 * Multiple partial returns on one order: nothing here special-cases a
 * "second" return. Every open re-runs the eligibility query, which sums ALL
 * non-cancelled credit notes sourced from this order — so a line already
 * partly returned simply opens with a smaller `max` next time, and a line
 * fully returned opens locked at 0. The parent closes this sheet on success
 * (see `(tabs)/orders.tsx`); reopening it for the same order is how a second,
 * third, … return is made.
 */
export function RecordReturnModal({ order, onClose, onSuccess }: RecordReturnModalProps) {
  const c = themeColors(useColorScheme() === 'dark');
  const eligibility = useOrderReturnEligibility(order);
  const mutation = useOrderReturnItems();

  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [touchedReason, setTouchedReason] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Minted once per return DECISION (on open) and reused for every retry of
  // this same submit — never regenerated inside the mutation, which is what
  // would let a retried tap on a flaky connection raise a second credit note.
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setQtyByItem({});
    setReason('');
    setTouchedReason(false);
    setServerError(null);
    idempotencyKeyRef.current = order ? newIdempotencyKey('return') : null;
  }, [order?.id]);

  const returnedByItem = eligibility.data?.returnedByItem ?? new Map<string, number>();

  const rows = useMemo(() => {
    if (!order) return [];
    return order.items.map((item) => ({
      item,
      already: returnedByItem.get(item.productId) ?? 0,
      max: remainingQty(item, returnedByItem),
    }));
  }, [order, returnedByItem]);

  const setQty = (productId: string, next: number, max: number) => {
    const clamped = Math.max(0, Math.min(max, Math.round(Number.isFinite(next) ? next : 0)));
    setQtyByItem((prev) => ({ ...prev, [productId]: clamped }));
  };

  const lines: OrderReturnLine[] = rows
    .map((r) => ({ itemId: r.item.productId, qty: qtyByItem[r.item.productId] ?? 0 }))
    .filter((l) => l.qty > 0);

  const trimmedReason = reason.trim();
  const reasonTooShort = trimmedReason.length > 0 && trimmedReason.length < 3;
  const canSubmit = lines.length > 0 && trimmedReason.length >= 3 && !mutation.isPending;

  const submit = () => {
    if (!order || !canSubmit) return;
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey('return');
    setServerError(null);
    mutation.mutate(
      { id: order.id, lines, reason: trimmedReason, idempotencyKey: idempotencyKeyRef.current },
      {
        onSuccess: (result) => onSuccess(result),
        onError: (e: unknown) => setServerError(apiErrorMessage(e)),
      },
    );
  };

  const visible = Boolean(order);
  const loadingEligibility = eligibility.isLoading;
  const noInvoice = eligibility.isSuccess && !eligibility.data.invoiceFound;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: c.divider }]}>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>
            Record a return{order ? ` — ${order.code}` : ''}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} disabled={mutation.isPending}>
            <MaterialCommunityIcons name="close" size={22} color={c.textSecondary} />
          </Pressable>
        </View>

        {loadingEligibility ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : noInvoice ? (
          <View style={styles.loadingBox}>
            <Text style={[styles.noInvoiceText, { color: c.textSecondary }]}>
              No issued invoice was found for this order. Raise and issue the invoice before recording a return —
              a credit note has to adjust a numbered invoice.
            </Text>
            <Button mode="outlined" onPress={onClose} style={{ marginTop: 16 }}>Close</Button>
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={[styles.intro, { color: c.textSecondary }]}>
                Pick how many of each item came back. This raises a credit note for exactly what you enter here —
                nothing else on the order changes.
              </Text>

              {rows.map(({ item, already, max }) => {
                const qty = qtyByItem[item.productId] ?? 0;
                const exhausted = max === 0;
                return (
                  <View
                    key={item.productId}
                    style={[styles.itemRow, { borderColor: c.divider, opacity: exhausted ? 0.55 : 1 }]}
                  >
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, { color: c.textPrimary }]} numberOfLines={2}>
                        {item.snapshot.name}
                      </Text>
                      <Text style={[styles.itemMeta, { color: c.textSecondary }]}>
                        Ordered {item.qty} {item.snapshot.unit}
                        {already > 0 ? ` · ${already} already returned` : ''}
                        {exhausted ? ' · fully returned' : ` · ${max} can still return`}
                      </Text>
                    </View>
                    <View style={styles.stepperCol}>
                      <View style={styles.stepperRow}>
                        <IconButton
                          icon="minus"
                          size={16}
                          disabled={exhausted || qty <= 0}
                          onPress={() => setQty(item.productId, qty - 1, max)}
                        />
                        <TextInput
                          mode="outlined"
                          dense
                          value={String(qty)}
                          onChangeText={(v) => setQty(item.productId, Number(v.replace(/[^0-9]/g, '')) || 0, max)}
                          keyboardType="number-pad"
                          editable={!exhausted}
                          style={styles.qtyInput}
                          outlineStyle={styles.qtyOutline}
                          contentStyle={styles.qtyContent}
                        />
                        <IconButton
                          icon="plus"
                          size={16}
                          disabled={exhausted || qty >= max}
                          onPress={() => setQty(item.productId, qty + 1, max)}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}

              <Divider style={{ marginVertical: 10, backgroundColor: c.divider }} />

              <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>WHY ARE THESE COMING BACK</Text>
              <TextInput
                mode="outlined"
                value={reason}
                onChangeText={setReason}
                onBlur={() => setTouchedReason(true)}
                placeholder="e.g. Damaged in transit, customer refused two items"
                multiline
                numberOfLines={3}
                outlineStyle={styles.reasonOutline}
              />
              <HelperText type="error" visible={touchedReason && reasonTooShort}>
                A couple of words at least — this stays on the credit note record.
              </HelperText>

              {serverError && (
                <View style={[styles.errorBox, { backgroundColor: c.error + '18', borderColor: c.error }]}>
                  <Text style={{ color: c.error, fontSize: 12.5, lineHeight: 18 }}>{serverError}</Text>
                </View>
              )}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: c.divider, backgroundColor: c.surface }]}>
              <Button mode="outlined" onPress={onClose} disabled={mutation.isPending} style={styles.footerBtn}>
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={submit}
                disabled={!canSubmit}
                loading={mutation.isPending}
                style={styles.footerBtn}
              >
                {lines.length > 0
                  ? `Confirm return (${lines.reduce((sum, l) => sum + l.qty, 0)})`
                  : 'Confirm return'}
              </Button>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', flexShrink: 1, paddingRight: 12 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  noInvoiceText: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  body: { padding: 14, paddingBottom: 24 },
  intro: { fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.card, padding: 10, marginBottom: 8, gap: 8,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 13.5, fontWeight: '700' },
  itemMeta: { fontSize: 11.5, marginTop: 2 },
  stepperCol: { alignItems: 'flex-end' },
  stepperRow: { flexDirection: 'row', alignItems: 'center' },
  qtyInput: { width: 52, height: 40, backgroundColor: 'transparent' },
  qtyOutline: { borderRadius: 10 },
  qtyContent: { textAlign: 'center', paddingHorizontal: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8 },
  reasonOutline: { borderRadius: 12 },
  errorBox: { borderRadius: radii.md, borderWidth: 1, padding: 12, marginTop: 4 },
  footer: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerBtn: { flex: 1, borderRadius: radii.card },
});
