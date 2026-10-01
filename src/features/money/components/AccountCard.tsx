import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import type { MoneyAccount } from '../api';

/** One cash drawer or bank account with its balance; tapping opens its book. */
export function AccountCard({ c, account, onPress }: { c: ColorScheme; account: MoneyAccount; onPress?: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider, opacity: account.isActive ? 1 : 0.6 }]}
      testID={`account-${account._id}`}
    >
      <View style={[styles.icon, { backgroundColor: c.surfaceVariant }]}>
        <MaterialCommunityIcons name={account.kind === 'CASH' ? 'cash' : 'bank-outline'} size={22} color={c.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{account.name}</Text>
        <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
          {t(account.kind === 'CASH' ? 'money.kind.CASH' : 'money.kind.BANK')}
          {account.bankLast4 ? ` ··${account.bankLast4}` : ''}
          {account.isDefault ? t('money.defaultSuffix') : ''}
          {!account.isActive ? t('money.offSuffix') : ''}
        </Text>
      </View>
      <Text style={[styles.balance, { color: account.balancePaise < 0 ? c.error : c.textPrimary }]}>{formatPaise(account.balancePaise)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, minHeight: 64 },
  icon: { width: 40, height: 40, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  balance: { fontSize: 16, fontWeight: '700', flexShrink: 0 },
});
