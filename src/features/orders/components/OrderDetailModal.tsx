import React from 'react';
import { View, StyleSheet, ScrollView, Modal, useColorScheme, Pressable } from 'react-native';
import { Text, ActivityIndicator, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PartnerOrder } from '../types';
import { KnownOrderVerb, filterKnownVerbs, verbNeedsReason } from '../api';
import { ORDER_VERB_LABELS } from '../backend-mirror';
import { OrderStatusChip } from './OrderStatusChip';
import { useOrderReturnEligibility, hasReturnableItems } from '../returnEligibility';
import { themeColors, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';

interface OrderDetailModalProps {
  order: PartnerOrder | null;
  loading: boolean;
  pending: boolean;
  /** Gate 3 (`ORDERS_MANAGE` FULL) — the same check `(tabs)/orders.tsx` applies before drawing any other action button; fail-closed for the return button too. */
  canManage: boolean;
  onClose: () => void;
  onAction: (verb: KnownOrderVerb) => void;
  /** M5 — opens the record-return sheet for this order. Only ever called while the button below is actually shown. */
  onRecordReturn: () => void;
}

export function OrderDetailModal({ order, loading, pending, canManage, onClose, onAction, onRecordReturn }: OrderDetailModalProps) {
  const c = themeColors(useColorScheme() === 'dark');
  const visible = loading || Boolean(order);
  const verbs = order ? filterKnownVerbs(order.allowedVerbs) : [];

  // M5 gate: an ISSUED order-sourced invoice must exist, and something must
  // still be returnable — see `returnEligibility.ts` for why this cannot be
  // read off `allowedVerbs` (`returnItems` is not a transition verb).
  const eligibility = useOrderReturnEligibility(order);
  const canRecordReturn =
    canManage &&
    Boolean(order) &&
    eligibility.isSuccess &&
    eligibility.data.invoiceFound &&
    hasReturnableItems(order as PartnerOrder, eligibility.data.returnedByItem);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: c.divider }]}>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>{order?.code ?? 'Order'}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={22} color={c.textSecondary} />
          </Pressable>
        </View>

        {loading || !order ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.body}>
              <View style={styles.statusRow}>
                <OrderStatusChip status={order.status} c={c} />
                <Text style={[styles.deliveryMode, { color: c.textSecondary }]}>
                  {order.deliveryMode === 'DELIVERY' ? 'Delivery' : 'Pickup'}
                  {order.slotPreference ? ` · ${order.slotPreference}` : ''}
                </Text>
              </View>

              <Section title="Customer" c={c}>
                <Text style={[styles.customerName, { color: c.textPrimary }]}>{order.customer.name}</Text>
                {order.customer.societyName && (
                  <Text style={[styles.customerLine, { color: c.textSecondary }]}>{order.customer.societyName}</Text>
                )}
                {order.customer.contactMasked ? (
                  <Text style={[styles.maskNote, { color: c.warning }]}>{order.customer.maskNote}</Text>
                ) : (
                  <>
                    {order.customer.phone && (
                      <Text style={[styles.customerLine, { color: c.textSecondary }]}>{order.customer.phone}</Text>
                    )}
                    {order.customer.flatLabel && (
                      <Text style={[styles.customerLine, { color: c.textSecondary }]}>{order.customer.flatLabel}</Text>
                    )}
                    {order.customer.deliveryAddress && (
                      <Text style={[styles.customerLine, { color: c.textSecondary }]}>
                        {[order.customer.deliveryAddress.line1, order.customer.deliveryAddress.line2,
                          order.customer.deliveryAddress.landmark]
                          .filter(Boolean).join(', ')}
                      </Text>
                    )}
                  </>
                )}
                {order.note && !order.customer.contactMasked && (
                  <Text style={[styles.customerLine, { color: c.textSecondary, fontStyle: 'italic' }]}>
                    “{order.note}”
                  </Text>
                )}
              </Section>

              <Section title={`Items (${order.itemCount})`} c={c}>
                {order.items.map((item, idx) => (
                  <View key={`${item.productId}-${idx}`} style={styles.itemRow}>
                    <View style={styles.itemNameCol}>
                      <Text style={[styles.itemName, { color: c.textPrimary }]}>{item.snapshot.name}</Text>
                      <Text style={[styles.itemMeta, { color: c.textSecondary }]}>
                        {item.qty} {item.snapshot.unit} × {formatPaise(item.snapshot.ratePaise)}
                      </Text>
                    </View>
                    <Text style={[styles.itemLine, { color: c.textPrimary }]}>{formatPaise(item.linePaise)}</Text>
                  </View>
                ))}
                <Divider style={{ marginVertical: 8, backgroundColor: c.divider }} />
                <AmountRow label="Subtotal" value={order.amounts.subPaise} c={c} />
                {order.amounts.discountPaise > 0 && <AmountRow label="Discount" value={-order.amounts.discountPaise} c={c} />}
                {order.amounts.taxPaise > 0 && <AmountRow label="Tax" value={order.amounts.taxPaise} c={c} />}
                {order.amounts.deliveryPaise > 0 && <AmountRow label="Delivery" value={order.amounts.deliveryPaise} c={c} />}
                <AmountRow label="Total" value={order.amounts.totalPaise} c={c} bold />
                <Text style={[styles.paymentLine, { color: c.textSecondary }]}>
                  {order.payment.mode === 'COD' ? 'Cash on delivery' : 'Paid online'} · {order.payment.status}
                </Text>
              </Section>

              <Section title="Timeline" c={c}>
                {order.timeline.map((t, idx) => (
                  <View key={idx} style={styles.timelineRow}>
                    <View style={[styles.timelineDot, { backgroundColor: c.primary }]} />
                    <View style={styles.timelineTextCol}>
                      <Text style={[styles.timelineStatus, { color: c.textPrimary }]}>
                        {t.status} {t.byName ? `· ${t.byName}` : ''}
                      </Text>
                      <Text style={[styles.timelineAt, { color: c.textSecondary }]}>
                        {new Date(t.at).toLocaleString('en-IN')}
                      </Text>
                      {t.note && <Text style={[styles.timelineNote, { color: c.textSecondary }]}>{t.note}</Text>}
                    </View>
                  </View>
                ))}
                {order.ended?.reason && (
                  <Text style={[styles.endedReason, { color: c.error }]}>Reason: {order.ended.reason}</Text>
                )}
              </Section>
            </ScrollView>

            {verbs.length > 0 && (
              <View style={[styles.footer, { borderTopColor: c.divider, backgroundColor: c.surface }]}>
                {verbs.map((verb) => (
                  <Pressable
                    key={verb}
                    onPress={() => onAction(verb)}
                    disabled={pending}
                    style={[
                      styles.footerBtn,
                      { backgroundColor: verbNeedsReason(verb) ? c.error : c.primary, opacity: pending ? 0.6 : 1 },
                    ]}
                  >
                    {pending ? (
                      <ActivityIndicator size={14} color="#fff" />
                    ) : (
                      <Text style={styles.footerBtnLabel}>{ORDER_VERB_LABELS[verb]}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {canRecordReturn && (
              <View style={[styles.returnFooter, { borderTopColor: c.divider, backgroundColor: c.surface }]}>
                <Pressable
                  onPress={onRecordReturn}
                  style={[styles.returnBtn, { borderColor: c.error }]}
                >
                  <Text style={[styles.returnBtnLabel, { color: c.error }]}>Record a return</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Section({ title, c, children }: { title: string; c: ReturnType<typeof themeColors>; children: React.ReactNode }) {
  return (
    <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.divider }]}>
      <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function AmountRow({ label, value, c, bold }: { label: string; value: number; c: ReturnType<typeof themeColors>; bold?: boolean }) {
  return (
    <View style={styles.amountLine}>
      <Text style={[styles.amountLabel, { color: bold ? c.textPrimary : c.textSecondary, fontWeight: bold ? '800' : '500' }]}>
        {label}
      </Text>
      <Text style={[styles.amountValue, { color: c.textPrimary, fontWeight: bold ? '800' : '600' }]}>
        {formatPaise(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14, gap: 12, paddingBottom: 24 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  deliveryMode: { fontSize: 12, fontWeight: '600' },
  section: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 4 },
  customerName: { fontSize: 15, fontWeight: '700' },
  customerLine: { fontSize: 13, lineHeight: 18 },
  maskNote: { fontSize: 12, marginTop: 4, lineHeight: 17, fontStyle: 'italic' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  itemNameCol: { flex: 1, paddingRight: 8 },
  itemName: { fontSize: 13.5, fontWeight: '600' },
  itemMeta: { fontSize: 12, marginTop: 1 },
  itemLine: { fontSize: 13.5, fontWeight: '700' },
  amountLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  amountLabel: { fontSize: 13 },
  amountValue: { fontSize: 13 },
  paymentLine: { fontSize: 12, marginTop: 6 },
  timelineRow: { flexDirection: 'row', gap: 8, paddingVertical: 5 },
  timelineDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  timelineTextCol: { flex: 1 },
  timelineStatus: { fontSize: 12.5, fontWeight: '700' },
  timelineAt: { fontSize: 11 },
  timelineNote: { fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  endedReason: { fontSize: 12.5, marginTop: 4, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerBtn: { flex: 1, paddingVertical: 12, borderRadius: radii.card, alignItems: 'center', justifyContent: 'center' },
  footerBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
  returnFooter: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  returnBtn: {
    paddingVertical: 11, borderRadius: radii.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  returnBtnLabel: { fontWeight: '700', fontSize: 13 },
});
