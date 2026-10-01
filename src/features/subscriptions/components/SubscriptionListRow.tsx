import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { Pill } from '../../p2/ui';
import { stateTone } from '../logic';
import type { SubscriptionRow } from '../types';

/** One subscription in the list: who, what, today's state and the month so far. */
export function SubscriptionListRow({ c, row, onPress }: { c: ColorScheme; row: SubscriptionRow; onPress: () => void }) {
  const { t } = useTranslation();
  const ended = row.status === 'ENDED';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      testID={`sub-row-${row.id}`}
      style={[styles.row, { backgroundColor: c.surface, borderColor: c.divider, opacity: ended ? 0.7 : 1 }]}
    >
      <View style={styles.top}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
            {row.flatLabel ? `${row.flatLabel} · ${row.customerName}` : row.customerName}
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
            {[row.code, row.title, row.routeName].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {ended ? (
          <Pill c={c} label={t('p2.subscriptions.status.ENDED')} />
        ) : row.todayState === 'OUTSIDE' || row.todayState === 'NOT_SCHEDULED' ? null : (
          <Pill c={c} tone={stateTone(row.todayState)} label={t(`p2.subscriptions.state.${row.todayState}`)} />
        )}
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
        {row.kind === 'TUITION'
          ? t(`p2.subscriptions.kind.${row.kind}`)
          : t('p2.subscriptions.list.monthToDate', { count: row.monthToDate.deliveries, amount: formatPaise(row.monthToDate.amountPaise) })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6, minHeight: 64 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '700' },
});
