import React, { useState } from 'react';
import { FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { formatPaise } from '../../../src/lib/money';
import { formatI18nDate } from '../../../src/i18n';
import { DateField } from '../../../src/components/DateField';
import { CashBookRow, moneyApi } from '../../../src/features/money/api';
import { ChipRow, EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { StatGrid, StatTile, useIsWide } from '../../../src/features/p1/ui';
import { isoEndOfDay, isoOfDay, monthStartYmd, todayYmd } from '../../../src/features/p1/dates';

/**
 * Cash book / bank book with its running balance (screen S21): pick the
 * account (cash drawer by default) and the dates; opening, every money-in and
 * money-out line, closing.
 */
export default function CashBookScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const wide = useIsWide();
  const params = useLocalSearchParams<{ accountId?: string }>();
  const [accountId, setAccountId] = useState<string>(params.accountId ?? '');
  const [from, setFrom] = useState(monthStartYmd());
  const [to, setTo] = useState(todayYmd());

  const accounts = useQuery({ queryKey: qk.money.accounts(), queryFn: moneyApi.accounts });
  const book = useQuery({
    queryKey: qk.money.cashBook({ accountId, from, to }),
    queryFn: () => moneyApi.cashBook({ accountId: accountId || undefined, from: isoOfDay(from), to: isoEndOfDay(to), limit: 200 }),
  });
  const shown = accountId || book.data?.account?._id || '';

  const renderRow = ({ item }: { item: CashBookRow }) => (
    <View style={[styles.row, { backgroundColor: c.surface }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>
          {t(`money.book.kind.${item.kind}`)}{item.ref ? ` · ${item.ref}` : ''}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
          {formatI18nDate(item.at, t)}{item.partyName ? ` · ${item.partyName}` : ''}
        </Text>
      </View>
      <View style={styles.amounts}>
        <Text style={{ color: item.inPaise ? c.success : item.outPaise ? c.error : c.textSecondary, fontWeight: '700' }}>
          {item.inPaise ? `+${formatPaise(item.inPaise)}` : item.outPaise ? `−${formatPaise(item.outPaise)}` : formatPaise(0)}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 11 }}>{t('money.book.balance', { amount: formatPaise(item.balancePaise) })}</Text>
      </View>
    </View>
  );

  return (
    <Screen c={c} title={t('money.cashBook')} subtitle={book.data?.account?.name} scroll={false}>
      <View style={styles.controls}>
        <ChipRow c={c} value={shown} options={(accounts.data ?? []).map((a) => ({ key: a._id, label: a.name }))} onChange={setAccountId} />
        <View style={[styles.dates, wide && { flexDirection: 'row' }]}>
          <View style={styles.dateCell}><DateField label={t('money.book.from')} value={from} onChangeText={setFrom} mode="date" maximumDate={new Date()} /></View>
          <View style={styles.dateCell}><DateField label={t('money.book.to')} value={to} onChangeText={setTo} mode="date" maximumDate={new Date()} /></View>
        </View>
        {book.data && (
          <StatGrid>
            <StatTile c={c} label={t('money.book.opening')} value={formatPaise(book.data.openingPaise)} />
            <StatTile c={c} label={t('money.book.closing')} value={formatPaise(book.data.closingPaise)} testID="cashbook-closing" />
          </StatGrid>
        )}
      </View>
      {book.isPending ? <Loading c={c} /> : book.isError ? (
        <ErrorBlock c={c} message={apiErrorMessage(book.error, t('money.loadFailed'))} onRetry={() => book.refetch()} />
      ) : (
        <FlatList
          data={book.data?.rows ?? []}
          keyExtractor={(r, i) => `${r.at}-${i}`}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          ListEmptyComponent={<EmptyBlock c={c} icon="book-open-variant" title={t('money.book.empty')} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  dates: { gap: 0 },
  dateCell: { flex: 1 },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radii.card, padding: 12, minHeight: 56 },
  amounts: { alignItems: 'flex-end', flexShrink: 0 },
});
