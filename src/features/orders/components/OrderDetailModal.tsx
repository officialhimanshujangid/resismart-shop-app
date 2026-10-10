import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, Modal, useColorScheme, Pressable } from 'react-native';
import { Text, ActivityIndicator, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { PartnerOrder } from '../types';
import { KnownOrderVerb, filterKnownVerbs, verbNeedsReason } from '../api';
import { ORDER_STATUS_LABEL_KEYS, ORDER_VERB_LABEL_KEYS } from '../backend-mirror';
import { OrderStatusChip } from './OrderStatusChip';
import { useOrderReturnEligibility, hasReturnableItems } from '../returnEligibility';
import { themeColors, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
// The verbatim mirror of `partner-tax.util.ts#computeDocumentTax` this app
// already carries for the billing composer — see `pricedLines` below for why an
// order screen needs it and what stops it from being believed on faith.
import { previewDocumentTax } from '../../billing/taxPreview';
// The app's shared error state, from the same UI kit every settings and list
// screen already draws — not a second, order-shaped way of saying "that failed".
import { ErrorBlock } from '../../more/ui';
import { formatI18nDate } from '../../../i18n';
import { OrderTimeline } from './OrderTimeline'; // M23
import { SkeletonList } from '../../../components/ui';

interface OrderDetailModalProps {
  order: PartnerOrder | null;
  loading: boolean;
  /**
   * Why this order could not be shown, in the partner's words — null while
   * there is nothing wrong.
   *
   * Threaded from `(tabs)/orders.tsx` rather than fetched here, because that
   * screen owns the query. It has to exist at all because `loading` and `order`
   * cannot describe a failure between them: both go false-y, which used to read
   * as "there is nothing to show" and closed the sheet on the spot. A partner
   * tapping an order then got no sheet, no message and no hint that anything
   * had happened — the worst of the three outcomes, because it looks like the
   * tap missed.
   */
  error: string | null;
  /** Try the order again from inside the sheet, so a failure does not force the partner to close and re-tap. */
  onRetry?: () => void;
  pending: boolean;
  /** Gate 3 (`ORDERS_MANAGE` FULL) — the same check `(tabs)/orders.tsx` applies before drawing any other action button; fail-closed for the return button too. */
  canManage: boolean;
  onClose: () => void;
  onAction: (verb: KnownOrderVerb) => void;
  /** M5 — opens the record-return sheet for this order. Only ever called while the button below is actually shown. */
  onRecordReturn: () => void;
  /** Commerce C1–C4: the order's slot / rider / changes / offers block, drawn under the status row. */
  extra?: React.ReactNode;
  /** Commerce C2: extra actions (accept with changes, give to a rider, packing slip), drawn above the verb buttons. */
  extraActions?: React.ReactNode;
}

export function OrderDetailModal({
  order, loading, error, onRetry, pending, canManage, onClose, onAction, onRecordReturn, extra, extraActions,
}: OrderDetailModalProps) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const visible = loading || Boolean(order) || Boolean(error);
  const verbs = order ? filterKnownVerbs(order.allowedVerbs) : [];

  // M5 gate: an ISSUED order-sourced invoice must exist, and something must
  // still be returnable — see `returnEligibility.ts` for why this cannot be
  // read off `allowedVerbs` (`returnItems` is not a transition verb).
  /**
   * The per-line TAXABLE value, which the order view does not carry.
   *
   * `item.linePaise` is `gross − discount` in the LINE'S OWN basis
   * (`order.service.ts#priceOrderLines`), so on the default inclusive product it
   * already contains the GST — while `amounts.subPaise` is the sum of the
   * taxable BASES and a `Tax` row is printed under it. Three true figures that
   * do not add up, the same defect the invoice detail card was fixed for.
   *
   * `OrderItem` has no `taxablePaise` to print instead, so it is re-derived here
   * through the mirror of the server's own `computeDocumentTax`. Two things make
   * that honest rather than a guess:
   *
   *   • The taxable value does NOT depend on place of supply. `computeLine`
   *     derives it from qty, rate, discount, rate percent and the inclusive
   *     flag — every one of them on the snapshot — and the supplier state only
   *     decides how the tax POOL is later split into CGST+SGST or IGST. Neither
   *     of those inputs is on this screen, and neither is needed: nothing below
   *     states a split. `gstApplicable` is read back off the priced order —
   *     the server forces every rate to zero when it is false, so a non-zero
   *     `taxPaise` is proof it was true, and when it is zero the rates are
   *     irrelevant to the base anyway.
   *
   *   • It is checked before it is believed. The derived totals must reproduce
   *     the subtotal and tax the SERVER stored on this order, or the whole thing
   *     is discarded and the rows fall back to what they printed before. A wrong
   *     figure on a tax line is worse than an unaddable one, and the day the
   *     server's util changes without this mirror following it (see that file's
   *     "IF THE SERVER'S FUNCTION CHANGES" note), this screen goes quiet instead
   *     of quietly lying.
   *
   * `roundOff: false` matches what the order was priced with — an order is not
   * the document, and the round-off belongs to the invoice raised from it.
   */
  const pricedLines = useMemo(() => {
    if (!order) return null;
    const priced = previewDocumentTax(
      order.items.map((item) => ({
        qty: item.qty,
        ratePaise: item.snapshot.ratePaise,
        taxRatePercent: item.snapshot.taxRatePercent,
        taxInclusive: item.snapshot.taxInclusive,
        discountPaise: item.discountPaise,
      })),
      undefined,
      undefined,
      { gstApplicable: order.amounts.taxPaise > 0, roundOff: false },
    );
    const agreesWithServer = priced.totals.subPaise === order.amounts.subPaise
      && priced.totals.taxPaise === order.amounts.taxPaise;
    return agreesWithServer ? priced.lines : null;
  }, [order]);

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
          <Text style={[styles.headerTitle, { color: c.textPrimary }, { flexShrink: 1 }]}>{order?.code ?? t('orders.detail.fallbackTitle')}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={22} color={c.textSecondary} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <SkeletonList rows={3} />
          </View>
        ) : !order ? (
          // Reached only while `error` is set — `visible` is false otherwise, so
          // there is no third state where the sheet is open with neither.
          <View style={styles.loadingBox}>
            <ErrorBlock c={c} message={error ?? t('orders.detail.loadFailed')} onRetry={onRetry} />
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.body}>
              <View style={styles.statusRow}>
                <OrderStatusChip status={order.status} c={c} />
                <Text style={[styles.deliveryMode, { color: c.textSecondary }, { flexShrink: 1 }]}>
                  {t(order.deliveryMode === 'DELIVERY' ? 'orders.detail.delivery' : 'orders.detail.pickup')}
                  {/* `slotPreference` is the slot the CUSTOMER chose, as the
                      server stored it — data on the order, not copy. */}
                  {order.slotPreference ? t('orders.detail.slotSuffix', { slot: order.slotPreference }) : ''}
                </Text>
              </View>

              {extra}

              <Section title={t('orders.detail.customer')} c={c}>
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
                    {t('orders.detail.quotedNote', { note: order.note })}
                  </Text>
                )}
              </Section>

              <Section title={t('orders.detail.items', { count: order.itemCount })} c={c}>
                {/*
                  Captioned only when the column and the line total are actually
                  two different numbers — i.e. when this order carries GST. On an
                  untaxed order the amount IS what the item cost, and a caption
                  saying so is noise on the common case.
                */}
                {!!pricedLines && order.amounts.taxPaise > 0 && (
                  <Text style={[styles.columnCaption, { color: c.textSecondary }]}>{t('orders.detail.taxableValue')}</Text>
                )}
                {order.items.map((item, idx) => {
                  const priced = pricedLines?.[idx];
                  const lineTaxPaise = priced
                    ? priced.cgstPaise + priced.sgstPaise + priced.igstPaise + priced.cessPaise
                    : 0;
                  return (
                    <View key={`${item.productId}-${idx}`} style={styles.itemRow}>
                      <View style={styles.itemNameCol}>
                        <Text style={[styles.itemName, { color: c.textPrimary }]}>{item.snapshot.name}</Text>
                        <Text style={[styles.itemMeta, { color: c.textSecondary }]}>
                          {t('orders.detail.itemMeta', { qty: item.qty, unit: item.snapshot.unit, rate: formatPaise(item.snapshot.ratePaise) })}
                        </Text>
                        {/*
                          base → tax → what the customer pays for this item, in the
                          order the invoice card and the line editor both use. The
                          caption above says which of the two the column is; this
                          carries the other one, so nobody has to do the addition
                          to answer "so what is this one?".
                        */}
                        {!!priced && lineTaxPaise > 0 && (
                          <Text style={[styles.itemMeta, { color: c.textSecondary }]}>
                            {t('orders.detail.itemTaxLine', { tax: formatPaise(lineTaxPaise), total: formatPaise(priced.totalPaise) })}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.itemLine, { color: c.textPrimary }]}>
                        {formatPaise(priced ? priced.taxablePaise : item.linePaise)}
                      </Text>
                    </View>
                  );
                })}
                <Divider style={{ marginVertical: 8, backgroundColor: c.divider }} />
                {/*
                  "Taxable value" once there is tax to be taxable FOR, because
                  that is what `amounts.subPaise` is — the sum of the bases — and
                  it is the word the invoice raised from this order prints over
                  the same figure. A partner should not have to learn that two
                  screens mean one thing. Left as "Subtotal" on an untaxed order,
                  where there is no base to distinguish from anything.
                */}
                <AmountRow
                  label={t(order.amounts.taxPaise > 0 ? 'orders.detail.taxableValue' : 'orders.detail.subtotal')}
                  value={order.amounts.subPaise}
                  c={c}
                />
                {order.amounts.discountPaise > 0 && <AmountRow label={t('orders.detail.discount')} value={-order.amounts.discountPaise} c={c} />}
                {order.amounts.taxPaise > 0 && <AmountRow label={t('orders.detail.tax')} value={order.amounts.taxPaise} c={c} />}
                {order.amounts.deliveryPaise > 0 && <AmountRow label={t('orders.detail.deliveryFee')} value={order.amounts.deliveryPaise} c={c} />}
                <AmountRow label={t('orders.detail.total')} value={order.amounts.totalPaise} c={c} bold />
                <Text style={[styles.paymentLine, { color: c.textSecondary }]}>
                  {/* `payment.status` is the SERVER's own payment state and has no
                      label table on this side — printed back as it came, the same
                      trade `UsageMeter.tsx` documents for `capacity.noun`. */}
                  {t('orders.detail.paymentLine', {
                    mode: t(order.payment.mode === 'COD' ? 'orders.detail.payCod' : 'orders.detail.payOnline'),
                    status: order.payment.status,
                  })}
                </Text>
              </Section>

              <Section title={t('orders.detail.timeline')} c={c}>
                {/* M23 (DS v1) — the animated status timeline (rail grows, steps rise in). */}
                <OrderTimeline
                  ended={order.status === 'REJECTED' || order.status === 'CANCELLED'}
                  rows={order.timeline.map((entry, idx) => ({
                    key: `${entry.status}-${idx}`,
                    title: t('orders.detail.timelineEntry', {
                      status: t(ORDER_STATUS_LABEL_KEYS[entry.status]),
                      by: entry.byName ? t('orders.detail.timelineBy', { name: entry.byName }) : '',
                    }),
                    when: formatI18nDate(entry.at, t),
                    note: entry.note || undefined,
                  }))}
                />
                {order.ended?.reason && (
                  <Text style={[styles.endedReason, { color: c.error }]}>{t('orders.detail.endedReason', { reason: order.ended.reason })}</Text>
                )}
              </Section>
            </ScrollView>

            {extraActions ? (
              <View style={[styles.extraActions, { borderTopColor: c.divider, backgroundColor: c.surface }]}>{extraActions}</View>
            ) : null}

            {verbs.length > 0 && (
              <View style={[styles.footer, { borderTopColor: c.divider, backgroundColor: c.surface }]}>
                {verbs.map((verb) => (
                  <Pressable
                    key={verb}
                    onPress={() => onAction(verb)}
                    disabled={pending}
                    style={[
                      styles.footerBtn,
                      // M23 — the FILL greens + inverse text: ≥ 4.5:1 in light and dark (was white on #3FB27B in dark, 2.7:1).
                      { backgroundColor: verbNeedsReason(verb) ? c.error : c.primaryFill, opacity: pending ? 0.6 : 1 },
                    ]}
                  >
                    {pending ? (
                      <ActivityIndicator size={14} color={c.textInverse} />
                    ) : (
                      <Text style={[styles.footerBtnLabel, { color: c.textInverse }]}>{t(ORDER_VERB_LABEL_KEYS[verb])}</Text>
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
                  <Text style={[styles.returnBtnLabel, { color: c.error }]}>{t('orders.detail.recordReturn')}</Text>
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
      <Text style={[styles.amountLabel, { color: bold ? c.textPrimary : c.textSecondary, fontWeight: bold ? '600' : '500' }, { flexShrink: 1 }]}>
        {label}
      </Text>
      <Text style={[styles.amountValue, { color: c.textPrimary, fontWeight: bold ? '600' : '500' }]}>
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
  headerTitle: { fontSize: 17, fontWeight: '600' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14, gap: 12, paddingBottom: 24 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  deliveryMode: { fontSize: 12, fontWeight: '600' },
  section: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  sectionTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, marginBottom: 4 },
  customerName: { fontSize: 15, fontWeight: '600' },
  customerLine: { fontSize: 13, lineHeight: 18 },
  maskNote: { fontSize: 12, marginTop: 4, lineHeight: 17, fontStyle: 'italic' },
  columnCaption: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'right' },
  // `flex-start`: a taxed line carries three lines of text on the left, and an
  // amount floating halfway down them reads as belonging to the caption rather
  // than to the item it prices.
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 6 },
  itemNameCol: { flex: 1, paddingRight: 8 },
  itemName: { fontSize: 13.5, fontWeight: '600' },
  itemMeta: { fontSize: 12, marginTop: 1 },
  itemLine: { fontSize: 13.5, fontWeight: '600' },
  amountLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  amountLabel: { fontSize: 13 },
  amountValue: { fontSize: 13 },
  paymentLine: { fontSize: 12, marginTop: 6 },
  timelineRow: { flexDirection: 'row', gap: 8, paddingVertical: 5 },
  timelineDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  timelineTextCol: { flex: 1 },
  timelineStatus: { fontSize: 12.5, fontWeight: '600' },
  timelineAt: { fontSize: 11 },
  timelineNote: { fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  endedReason: { fontSize: 12.5, marginTop: 4, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerBtn: { flex: 1, paddingVertical: 12, borderRadius: radii.card, alignItems: 'center', justifyContent: 'center' },
  footerBtnLabel: { fontWeight: '600', fontSize: 13 },
  returnFooter: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  extraActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2, borderTopWidth: StyleSheet.hairlineWidth },
  returnBtn: {
    paddingVertical: 11, borderRadius: radii.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  returnBtnLabel: { fontWeight: '600', fontSize: 13 },
});
