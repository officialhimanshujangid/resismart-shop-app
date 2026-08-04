import React, { useRef } from 'react';
import { View, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';

import { PartnerOrder } from '../types';
import { KnownOrderVerb, filterKnownVerbs, verbNeedsReason } from '../api';
import { ORDER_VERB_LABELS } from '../backend-mirror';
import { OrderStatusChip } from './OrderStatusChip';
import { themeColors, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';

/** "5m ago" / "2h ago" / "3 Aug" — short, because this sits on a crowded row. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
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
  const c = themeColors(useColorScheme() === 'dark');
  const swipeRef = useRef<Swipeable>(null);
  const verbs = filterKnownVerbs(order.allowedVerbs);

  const runAction = (verb: KnownOrderVerb) => {
    swipeRef.current?.close();
    onAction(verb);
  };

  const renderRightActions = () =>
    verbs.length ? (
      <View style={styles.actionsRow}>
        {verbs.map((verb) => {
          const danger = verbNeedsReason(verb);
          return (
            <Pressable
              key={verb}
              onPress={() => runAction(verb)}
              disabled={pending}
              style={[
                styles.actionBtn,
                { backgroundColor: danger ? c.error : c.primary, opacity: pending ? 0.6 : 1 },
              ]}
            >
              <Text style={styles.actionLabel}>{ORDER_VERB_LABELS[verb]}</Text>
            </Pressable>
          );
        })}
      </View>
    ) : null;

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} overshootRight={false} enabled={verbs.length > 0}>
      <Pressable
        onPress={onPress}
        style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}
      >
        <View style={styles.topRow}>
          <Text style={[styles.code, { color: c.textPrimary }]}>{order.code}</Text>
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
            {order.customer.societyName ? ` · ${order.customer.societyName}` : ''}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons
              name={order.deliveryMode === 'DELIVERY' ? 'moped-outline' : 'store-outline'}
              size={14}
              color={c.textSecondary}
            />
            <Text style={[styles.metaText, { color: c.textSecondary }]}>
              {order.itemCount} item{order.itemCount === 1 ? '' : 's'} · {relativeTime(order.createdAt)}
            </Text>
          </View>
          <View style={styles.amountRow}>
            {pending && <ActivityIndicator size={14} color={c.primary} style={styles.spinner} />}
            <Text style={[styles.amount, { color: c.textPrimary }]}>{formatPaise(order.amounts.totalPaise)}</Text>
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
    marginHorizontal: 14,
    marginVertical: 6,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: { fontSize: 15, fontWeight: '800' },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  customerText: { fontSize: 13, flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  spinner: { marginRight: 2 },
  amount: { fontSize: 15, fontWeight: '800' },
  actionsRow: { flexDirection: 'row', alignItems: 'stretch', marginVertical: 6, marginRight: 14, gap: 6 },
  actionBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: radii.card,
    minWidth: 84,
  },
  actionLabel: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
});
