import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { radii, themeColors, type ColorScheme } from '../../../../src/constants/colors';
import { Card, ChipRow, EmptyBlock, ErrorBlock, Loading, Screen } from '../../../../src/features/more/ui';
import { PillButton } from '../../../../src/features/p1/ui';
import { CommerceHint, FeatureOff, NoAccess, Tag } from '../../../../src/features/commerce/components/ui';
import { useCommerceAccess } from '../../../../src/features/commerce/access';
import { useOffers } from '../../../../src/features/commerce/hooks';
import { offerBenefitText, offerState } from '../../../../src/features/commerce/logic';
import type { OfferStatus, OfferView } from '../../../../src/features/commerce/types';
import { OFFER_STATE_TONE, channelsText } from '../../../../src/features/commerce/offersLogic';
import { useDebouncedValue } from '../../../../src/features/billing/useDebouncedValue';
import { apiErrorMessage } from '../../../../src/api/axios';
import { formatPaise } from '../../../../src/lib/money';

type Filter = OfferStatus | 'ALL';

/**
 * Offers (CONTRACT-commerce §8): the shop's automatic offers and coupon codes,
 * filtered by Running / Paused / Ended. "Create offer" sits at the top so the
 * common job is one tap from here.
 */
export default function OffersScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const access = useCommerceAccess();
  const [filter, setFilter] = useState<Filter>('ACTIVE');
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q.trim(), 300);
  const query = useOffers(
    { ...(filter !== 'ALL' ? { status: filter } : {}), ...(debounced ? { q: debounced } : {}) },
    access.offers.canView,
  );

  if (!access.offers.canView) {
    return (
      <Screen c={c} title={t('commerce.offers.title')}>
        <NoAccess c={c} />
      </Screen>
    );
  }

  const featureOn = access.has('OFFERS');
  const rows = query.data?.data ?? [];

  let list: React.ReactNode;
  if (query.isPending) list = <Loading c={c} />;
  else if (query.isError) {
    list = <ErrorBlock c={c} message={apiErrorMessage(query.error, t('commerce.common.loadFailed'))} onRetry={() => void query.refetch()} />;
  } else if (!rows.length) {
    list = debounced
      ? <EmptyBlock c={c} icon="magnify" title={t('commerce.offers.noMatch', { q: debounced })} />
      : <EmptyBlock c={c} icon="ticket-percent-outline" title={t(`commerce.offers.empty.${filter}`)} body={t('commerce.offers.emptyBody')} />;
  } else {
    list = (
      <Card c={c} style={styles.listCard}>
        {rows.map((o, i) => (
          <View key={o.id}>
            <OfferRow c={c} offer={o} />
            {i < rows.length - 1 ? <View style={[styles.divider, { backgroundColor: c.divider }]} /> : null}
          </View>
        ))}
      </Card>
    );
  }

  return (
    <Screen c={c} title={t('commerce.offers.title')} scroll={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <CommerceHint c={c} helpKey="offers" />
        {!featureOn ? <FeatureOff c={c} canSwitch={access.settings.section.offers} /> : null}
        {access.offers.canManage && featureOn ? (
          <View style={styles.actions}>
            <PillButton
              c={c}
              icon="plus"
              label={t('commerce.offers.create')}
              onPress={() => router.push('/commerce/offers/edit' as Href)}
              testID="offers-create"
            />
          </View>
        ) : null}
        <ChipRow
          c={c}
          value={filter}
          options={[
            { key: 'ACTIVE', label: t('commerce.offers.filter.ACTIVE') },
            { key: 'PAUSED', label: t('commerce.offers.filter.PAUSED') },
            { key: 'ARCHIVED', label: t('commerce.offers.filter.ARCHIVED') },
            { key: 'ALL', label: t('commerce.offers.filter.ALL') },
          ]}
          onChange={setFilter}
        />
        <TextInput
          mode="outlined"
          dense
          value={q}
          onChangeText={setQ}
          placeholder={t('commerce.offers.search')}
          accessibilityLabel={t('commerce.offers.search')}
          outlineStyle={{ borderRadius: radii.field }}
          style={{ backgroundColor: 'transparent' }}
          left={<TextInput.Icon icon="magnify" />}
          testID="offers-search"
        />
        {list}
      </ScrollView>
    </Screen>
  );
}

function OfferRow({ c, offer }: { c: ColorScheme; offer: OfferView }) {
  const { t } = useTranslation();
  const state = offerState(offer);
  const used = offer.stats?.usedCount ?? 0;
  const given = offer.stats?.discountGivenPaise ?? 0;
  const channels = channelsText(offer.channels, t);
  return (
    <Pressable
      onPress={() => router.push(`/commerce/offers/${offer.id}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={offer.name}
      testID={`offer-row-${offer.id}`}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceVariant : c.surface }]}
    >
      <View style={styles.rowMain}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>{offer.name}</Text>
        <Text style={[styles.benefit, { color: c.primary }]} numberOfLines={2}>{offerBenefitText(offer.benefit, t, formatPaise)}</Text>
        <View style={styles.tags}>
          <Tag
            c={c}
            tone="info"
            label={offer.kind === 'COUPON' ? (offer.code ?? t('commerce.offers.kind.COUPON')) : t('commerce.offers.kind.AUTO')}
            testID={`offer-kind-${offer.id}`}
          />
          <Tag c={c} tone={OFFER_STATE_TONE[state]} label={t(`commerce.offers.state.${state}`)} testID={`offer-state-${offer.id}`} />
        </View>
        <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={2}>
          {t('commerce.offers.usedLine', { count: used, amount: formatPaise(given) })}
        </Text>
        {channels ? <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>{channels}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  listCard: { padding: 0, gap: 0, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56 },
  rowMain: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontSize: 15, fontWeight: '600' },
  benefit: { fontSize: 13.5, fontWeight: '600' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  meta: { fontSize: 12 },
});
