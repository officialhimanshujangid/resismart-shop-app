import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../../src/constants/colors';
import { apiErrorMessage } from '../../../../src/api/axios';
import { formatPaise } from '../../../../src/lib/money';
import { formatI18nDate } from '../../../../src/i18n';
import { useDebouncedValue } from '../../../../src/features/billing/useDebouncedValue';
import { Card, ChipRow, EmptyBlock, ErrorBlock, Loading, Screen, SectionLabel } from '../../../../src/features/more/ui';
import { PillButton } from '../../../../src/features/p1/ui';
import { PartyPicker } from '../../../../src/features/p2/ui';
import { useCommerceAccess } from '../../../../src/features/commerce/access';
import { useWallets } from '../../../../src/features/commerce/hooks';
import { CommerceHint, FeatureOff, NoAccess } from '../../../../src/features/commerce/components/ui';
import type { WalletListRow } from '../../../../src/features/commerce/types';

type Filter = 'ALL' | 'CREDIT' | 'POINTS';

/**
 * "Store credit & points" (C4, §14.6): the customers holding credit or points,
 * and a finder for anybody else (a customer with nothing yet can still be given
 * credit). WALLET_VIEW reads; every change happens on the customer's page.
 */
export default function WalletListScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const access = useCommerceAccess();
  const anyOn = access.has('WALLET') || access.has('LOYALTY') || access.has('REFERRAL');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 300);
  const [page, setPage] = useState(1);
  const list = useWallets({
    ...(debounced.trim() ? { q: debounced.trim() } : {}),
    ...(filter === 'CREDIT' ? { hasCredit: 'true' as const } : {}),
    ...(filter === 'POINTS' ? { hasPoints: 'true' as const } : {}),
    page,
  }, access.wallet.canView);

  // Pages accumulate (de-duplicated); any filter / search change starts over at page 1.
  const [rows, setRows] = useState<WalletListRow[]>([]);
  useEffect(() => {
    if (!list.data) return;
    setRows((prev) => {
      if (list.data.page === 1) return list.data.data;
      const seen = new Set(prev.map((r) => r.partyId));
      return [...prev, ...list.data.data.filter((r) => !seen.has(r.partyId))];
    });
  }, [list.data]);

  if (!access.wallet.canView) {
    return <Screen rise title={t('commerce.wallet.title')} c={c}><NoAccess c={c} /></Screen>;
  }

  const hasMore = list.data ? rows.length < list.data.total : false;
  return (
    <Screen rise title={t('commerce.wallet.title')} c={c}>
      <View style={styles.wrap}>
        <CommerceHint c={c} helpKey="wallet" />
        {!anyOn ? <FeatureOff c={c} canSwitch={access.settings.section.wallet} /> : null}

        <SectionLabel c={c}>{t('commerce.wallet.findCustomer')}</SectionLabel>
        <PartyPicker
          c={c}
          value={null}
          onChange={(p) => { if (p) router.push(`/commerce/wallet/${p.id}` as Href); }}
          label={t('commerce.wallet.findCustomerLabel')}
          testID="wallet-find"
        />

        <SectionLabel c={c}>{t('commerce.wallet.holding')}</SectionLabel>
        <ChipRow
          c={c}
          value={filter}
          options={[
            { key: 'ALL', label: t('commerce.wallet.filterAll') },
            { key: 'CREDIT', label: t('commerce.wallet.filterCredit') },
            { key: 'POINTS', label: t('commerce.wallet.filterPoints') },
          ]}
          onChange={(f) => { setFilter(f); setPage(1); }}
        />
        <TextInput
          mode="outlined"
          dense
          value={q}
          onChangeText={(s) => { setQ(s); setPage(1); }}
          placeholder={t('commerce.wallet.searchName')}
          accessibilityLabel={t('commerce.wallet.searchName')}
          outlineStyle={{ borderRadius: radii.field }}
          style={{ backgroundColor: 'transparent' }}
          left={<TextInput.Icon icon="magnify" />}
          testID="wallet-search"
        />

        {list.isPending ? <Loading c={c} skeleton={4} /> : null}
        {list.isError ? <ErrorBlock c={c} message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} /> : null}
        {list.isSuccess && list.data.page === 1 && list.data.data.length === 0 ? (
          <EmptyBlock c={c} icon="wallet-outline" title={t('commerce.wallet.emptyTitle')} body={t('commerce.wallet.emptyBody')} />
        ) : null}
        {rows.length > 0 ? (
          <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
            {rows.map((r) => (
              <Pressable
                key={r.partyId}
                onPress={() => router.push(`/commerce/wallet/${r.partyId}` as Href)}
                accessibilityRole="button"
                accessibilityLabel={r.name}
                style={[styles.row, { borderColor: c.divider }]}
                testID={`wallet-row-${r.partyId}`}
              >
                <MaterialCommunityIcons name="account-circle-outline" size={26} color={c.primary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>{r.name}</Text>
                  {r.expiringSoon ? (
                    <Text style={{ color: c.warning, fontSize: 12 }} numberOfLines={1}>
                      {t('commerce.wallet.expiringSoon', { count: r.expiringSoon.points, date: formatI18nDate(r.expiringSoon.on, t) })}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.amounts}>
                  {r.creditPaise > 0 ? <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{formatPaise(r.creditPaise)}</Text> : null}
                  {r.points > 0 ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('commerce.common.points', { count: r.points })}</Text> : null}
                </View>
              </Pressable>
            ))}
          </Card>
        ) : null}
        {hasMore ? (
          <PillButton c={c} tone="outline" label={t('commerce.common.more')} onPress={() => setPage((p) => p + 1)} disabled={list.isFetching} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 60, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  amounts: { alignItems: 'flex-end', maxWidth: '40%' },
});
