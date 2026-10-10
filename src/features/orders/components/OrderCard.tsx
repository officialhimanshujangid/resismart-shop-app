import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { PressableScale } from '../../../theme/motion'; // M23
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { PartnerOrder } from '../types';
import { KnownOrderVerb, filterKnownVerbs, verbNeedsReason } from '../api';
import { ORDER_STATUS_LABEL_KEYS, ORDER_VERB_LABEL_KEYS } from '../backend-mirror';
import { SwipeAction, type SwipeActionItem } from '../../../components/ui/SwipeAction';
import { Stamp } from '../../../components/ui/Feedback';
import { useMotionOK } from '../../../theme/motion';
import { OrderStatusChip } from './OrderStatusChip';
import { themeColors, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { slotText } from '../../commerce/format';

/**
 * "5m ago" / "2h ago" / "3 Aug" — short, because this sits on a crowded row.
 *
 * `t` is handed in (this is a plain function, not a component) and the fallback
 * month comes from `common.months`, NOT `toLocaleDateString`: the month is a
 * WORD, and `src/i18n/index.ts#formatI18nDate` sets out at length why `Intl` is
 * not trusted with one on Hermes.
 */
type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function relativeTime(iso: string, t: Translate): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (diffMin < 1) return t('orders.card.justNow');
  if (diffMin < 60) return t('orders.card.minutesAgo', { count: diffMin });
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return t('orders.card.hoursAgo', { count: diffH });
  const d = new Date(iso);
  return t('orders.card.onDate', { day: d.getDate(), month: t(`common.months.${d.getMonth() + 1}`) });
}

interface OrderCardProps {
  order: PartnerOrder;
  pending: boolean;
  onPress: () => void;
  onAction: (verb: KnownOrderVerb) => void;
}

/**
 * Swipe left to reveal every legal action for THIS order, straight off
 * `allowedVerbs` — never a locally re-derived state machine (see
 * `api.ts#filterKnownVerbs` for the one verb that is deliberately dropped).
 * Tapping the row itself opens the detail sheet with the same buttons, for
 * anyone who does not discover the swipe.
 */
export function OrderCard({ order, pending, onPress, onAction }: OrderCardProps) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const verbs = filterKnownVerbs(order.allowedVerbs);

  /**
   * UX-P (A ShopOrders): the swipe is the kit SwipeAction (UI-thread drag,
   * haptic at the open point) and every action is still a real button. The
   * list is `allowedVerbs` exactly as before — nothing re-derived here.
   */
  const actions: SwipeActionItem[] = verbs.map((verb) => ({
    key: verb,
    label: t(ORDER_VERB_LABEL_KEYS[verb]),
    icon: VERB_ICON[verb],
    tone: verbNeedsReason(verb) ? 'danger' : 'primary',
    disabled: pending,
    onPress: () => onAction(verb),
    testID: `order-swipe-${verb}-${order.id}`,
  }));

  /**
   * UX-P (C2 stamp): when THIS order's status changes while the card is on
   * screen (an accept, a pack…), the new status thumps down on the card for a
   * moment. Purely the server's answer drawn bigger — nothing is decided here.
   */
  const motionOK = useMotionOK();
  const lastStatus = useRef(order.status);
  const [stamp, setStamp] = useState<string | null>(null);
  useEffect(() => {
    if (lastStatus.current === order.status) return;
    lastStatus.current = order.status;
    if (!motionOK) return;
    setStamp(order.status);
    const timer = setTimeout(() => setStamp(null), 1100);
    return () => clearTimeout(timer);
  }, [order.status, motionOK]);

  return (
    <SwipeAction actions={actions} enabled={verbs.length > 0}>
      {/* M23 (DS v1) — press feedback (scale, UI thread) on the whole card. */}
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}
      >
        <View style={styles.topRow}>
          <Text style={[styles.code, { color: c.textPrimary }, { flexShrink: 1 }]}>{order.code}</Text>
          <OrderStatusChip status={order.status} c={c} />
        </View>

        <View style={styles.customerRow}>
          <MaterialCommunityIcons
            name={order.customer.contactMasked ? 'account-lock-outline' : 'account-outline'}
            size={15}
            color={c.textSecondary}
          />
          <Text style={[styles.customerText, { color: c.textSecondary }]} numberOfLines={1}>
            {order.customer.name}
            {order.customer.societyName ? t('orders.card.societySuffix', { society: order.customer.societyName }) : ''}
          </Text>
        </View>

        {/* Commerce C2: the delivery slot and the rider, only when the order has them. */}
        {order.deliverySlot || order.delivery?.staffName ? (
          <View style={styles.c2Row}>
            {order.deliverySlot ? (
              <Text style={[styles.c2Chip, { color: c.info, borderColor: `${c.info}55` }]} numberOfLines={1}>
                {slotText(order.deliverySlot, t)}
              </Text>
            ) : null}
            {order.delivery?.staffName ? (
              <Text style={[styles.c2Chip, { color: c.success, borderColor: `${c.success}55` }]} numberOfLines={1}>
                {t('commerce.fulfilment.riderChip', { name: order.delivery.staffName })}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.bottomRow}>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons
              name={order.deliveryMode === 'DELIVERY' ? 'moped-outline' : 'store-outline'}
              size={14}
              color={c.textSecondary}
            />
            <Text style={[styles.metaText, { color: c.textSecondary }, { flexShrink: 1 }]}>
              {/* `_one`/`_other`, not an English `-s`: Hindi cannot pluralise by
                  suffixing, and CLDR puts BOTH 0 and 1 in its `one` category. */}
              {t('orders.card.meta', {
                items: t('orders.card.itemCount', { count: order.itemCount }),
                when: relativeTime(order.createdAt, t),
              })}
            </Text>
          </View>
          <View style={styles.amountRow}>
            {pending && <ActivityIndicator size={14} color={c.primary} style={styles.spinner} />}
            <Text style={[styles.amount, { color: c.textPrimary }]}>{formatPaise(order.amounts.totalPaise)}</Text>
          </View>
        </View>
        {stamp ? (
          <View pointerEvents="none" style={styles.stampLayer}>
            <Stamp label={t(ORDER_STATUS_LABEL_KEYS[order.status])} tone={verbsTone(order.status)} />
          </View>
        ) : null}
      </PressableScale>
    </SwipeAction>
  );
}

/** One icon per verb on its swipe button (the label carries the meaning). */
const VERB_ICON: Partial<Record<KnownOrderVerb, string>> = {
  accept: 'check-bold',
  reject: 'close',
  pack: 'package-variant-closed',
  dispatch: 'moped-outline',
  deliver: 'home-import-outline',
  cancel: 'cancel',
  markReturned: 'keyboard-return',
  invoice: 'file-document-outline',
};

function verbsTone(status: PartnerOrder['status']): 'success' | 'danger' | 'info' {
  if (status === 'REJECTED' || status === 'CANCELLED' || status === 'RETURNED') return 'danger';
  if (status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED') return 'info';
  return 'success';
}

const styles = StyleSheet.create({
  stampLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  c2Row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  c2Chip: { fontSize: 11.5, fontWeight: '700', borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2, maxWidth: '100%' },
  card: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
    marginHorizontal: 14,
    marginVertical: 6,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: { fontSize: 15, fontWeight: '600' },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  customerText: { fontSize: 13, flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  metaText: { fontSize: 12 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  spinner: { marginRight: 2 },
  amount: { fontSize: 15, fontWeight: '600' },
});
