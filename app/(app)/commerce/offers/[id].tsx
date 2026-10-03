import React, { useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Share, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors, type ColorScheme } from '../../../../src/constants/colors';
import { Card, ErrorBlock, Loading, Screen, SectionLabel } from '../../../../src/features/more/ui';
import { ActionRow, PillButton, StatGrid, StatTile } from '../../../../src/features/p1/ui';
import { CommerceHint, NoAccess, Tag } from '../../../../src/features/commerce/components/ui';
import { useCommerceAccess } from '../../../../src/features/commerce/access';
import { useOffer, useOfferRedemptions, useOfferStatus } from '../../../../src/features/commerce/hooks';
import {
  couponShareText, dayOfEnd, offerActions, offerBenefitText, offerState,
} from '../../../../src/features/commerce/logic';
import { OFFER_STATE_TONE, channelsText } from '../../../../src/features/commerce/offersLogic';
import type { OfferDetail, OfferRedemption, OfferStatus } from '../../../../src/features/commerce/types';
import { useAuth } from '../../../../src/context/AuthContext';
import { apiErrorMessage } from '../../../../src/api/axios';
import { formatI18nDate } from '../../../../src/i18n';
import { formatPaise } from '../../../../src/lib/money';

/** The detail answer carries the latest ten uses (`offerDetail`). */
const RECENT = 10;

/**
 * One offer (CONTRACT-commerce §8): what it gives, how much it has given, every
 * rule in plain words, the actions its status allows (Edit · Pause · Resume ·
 * End offer — ARCHIVED is final, C-5), and its recent uses.
 */
export default function OfferDetailScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const access = useCommerceAccess();
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const query = useOffer(id, access.offers.canView);
  const status = useOfferStatus();

  // "Load more": page 0 = the ten the detail carries; pages 1… come from /redemptions.
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState<Record<number, OfferRedemption[]>>({});
  const [total, setTotal] = useState<number | null>(null);
  const more = useOfferRedemptions(id, Math.max(1, page), access.offers.canView && page > 0);
  useEffect(() => {
    const d = more.data;
    if (!d || page < 1) return;
    setPages((p) => ({ ...p, [d.page || page]: d.data }));
    setTotal(d.total);
  }, [more.data, page]);

  if (!access.offers.canView) {
    return <Screen c={c} title={t('commerce.offers.detail.title')}><NoAccess c={c} /></Screen>;
  }

  const offer = query.data;
  let body: React.ReactNode;
  if (query.isPending) body = <Loading c={c} />;
  else if (query.isError || !offer) {
    body = <ErrorBlock c={c} message={apiErrorMessage(query.error, t('commerce.common.loadFailed'))} onRetry={() => void query.refetch()} />;
  } else {
    const loadedPages = Object.keys(pages).map(Number).sort((a, b) => a - b);
    const paged = loadedPages.flatMap((n) => pages[n]);
    const uses = paged.length ? paged : offer.recentRedemptions ?? [];
    const hasMore = paged.length
      ? total !== null && total > paged.length
      : (offer.recentRedemptions?.length ?? 0) >= RECENT;

    const changeStatus = (next: OfferStatus) =>
      status.mutate({ id: offer.id, status: next }, {
        onError: (e) => Alert.alert(t('commerce.offers.detail.actionFailed'), apiErrorMessage(e, t('commerce.common.saveFailed'))),
      });
    const confirmEnd = () =>
      Alert.alert(t('commerce.offers.detail.endTitle'), t('commerce.offers.detail.endBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('commerce.offers.detail.end'), style: 'destructive', onPress: () => changeStatus('ARCHIVED') },
      ]);
    const share = () => {
      const message = couponShareText(offer, profile?.tenantName ?? '', t, formatPaise);
      void Share.share({ message }).catch(() => undefined);
    };
    // MP-1 (c6) "Copy code": this app has no clipboard module installed (and none may be added), so the
    // code alone goes to the system share menu, whose "Copy" puts it on the clipboard.
    const copyCode = () => {
      if (!offer.code) return;
      void Share.share({ message: offer.code }).catch(() => undefined);
    };

    body = (
      <OfferBody
        c={c}
        offer={offer}
        canManage={access.offers.canManage}
        busy={status.isPending}
        onEdit={() => router.push(`/commerce/offers/edit?id=${encodeURIComponent(offer.id)}` as Href)}
        onPause={() => changeStatus('PAUSED')}
        onResume={() => changeStatus('ACTIVE')}
        onEnd={confirmEnd}
        onShare={share}
        onCopyCode={copyCode}
        uses={uses}
        hasMore={hasMore}
        loadingMore={page > 0 && more.isFetching}
        onMore={() => setPage((p) => p + 1)}
      />
    );
  }

  return (
    <Screen c={c} title={t('commerce.offers.detail.title')} scroll={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <CommerceHint c={c} helpKey="offerDetail" />
        {body}
      </ScrollView>
    </Screen>
  );
}

function OfferBody({
  c, offer, canManage, busy, onEdit, onPause, onResume, onEnd, onShare, onCopyCode, uses, hasMore, loadingMore, onMore,
}: {
  c: ColorScheme; offer: OfferDetail; canManage: boolean; busy: boolean;
  onEdit: () => void; onPause: () => void; onResume: () => void; onEnd: () => void; onShare: () => void; onCopyCode: () => void;
  uses: OfferRedemption[]; hasMore: boolean; loadingMore: boolean; onMore: () => void;
}) {
  const { t } = useTranslation();
  const state = offerState(offer);
  const actions = offerActions(offer.status);
  const cond = offer.conditions ?? {};
  const localDayText = (day: string) => formatI18nDate(new Date(`${day}T00:00:00`), t);

  const dates = cond.startsAt && cond.endsAt
    ? t('commerce.offers.detail.dateRange', { from: formatI18nDate(cond.startsAt, t), to: localDayText(dayOfEnd(cond.endsAt)) })
    : cond.startsAt
      ? t('commerce.offers.detail.fromDate', { date: formatI18nDate(cond.startsAt, t) })
      : cond.endsAt
        ? t('commerce.offers.detail.untilDate', { date: localDayText(dayOfEnd(cond.endsAt)) })
        : t('commerce.offers.detail.always');
  const days = cond.daysOfWeek?.length && cond.daysOfWeek.length < 7
    ? cond.daysOfWeek.map((d) => t(`common.days.${d}`)).join(', ')
    : t('commerce.offers.detail.everyDay');
  const hours = cond.timeWindows?.length
    ? cond.timeWindows.map((w) => `${w.from}–${w.to}`).join(', ')
    : t('commerce.offers.detail.allDay');
  const limits = [
    offer.limits?.perCustomer ? t('commerce.offers.perCustomerLine', { count: offer.limits.perCustomer }) : '',
    offer.limits?.total ? t('commerce.offers.totalLine', { count: offer.limits.total }) : '',
  ].filter(Boolean).join(' · ') || t('commerce.offers.noLimit');
  const stacking = t(offer.stacking?.stackable ? 'commerce.offers.stackYes' : 'commerce.offers.stackNo', {
    priority: offer.stacking?.priority ?? 0,
  });
  const scope = offer.scope.type === 'PRODUCTS'
    ? t('commerce.offers.itemsCount', { count: offer.scope.productIds?.length ?? 0 })
    : offer.scope.type === 'CATEGORIES'
      ? t('commerce.offers.categoriesCount', { count: offer.scope.categoryIds?.length ?? 0 })
      : t('commerce.offers.scope.ORDER');
  const excluded = offer.scope.excludeProductIds?.length ?? 0;

  return (
    <>
      <Card c={c}>
        <Text style={[styles.name, { color: c.textPrimary }]} testID="offer-name">{offer.name}</Text>
        <Text style={[styles.benefit, { color: c.primary }]}>{offerBenefitText(offer.benefit, t, formatPaise)}</Text>
        <View style={styles.tags}>
          <Tag c={c} tone={OFFER_STATE_TONE[state]} label={t(`commerce.offers.state.${state}`)} testID="offer-state" />
          <Tag c={c} tone="info" label={t(`commerce.offers.kind.${offer.kind}`)} />
          {offer.kind === 'COUPON' && offer.code ? <Tag c={c} tone="neutral" label={offer.code} testID="offer-code" /> : null}
        </View>
        {offer.description ? <Text style={[styles.note, { color: c.textSecondary }]}>{offer.description}</Text> : null}
        {offer.kind === 'COUPON' && offer.code && offer.status !== 'ARCHIVED' ? (
          <ActionRow>
            <PillButton c={c} icon="share-variant" label={t('commerce.offers.detail.share')} onPress={onShare} testID="offer-share" />
            <PillButton c={c} tone="outline" icon="content-copy" label={t('commerce.offers.detail.copyCode')} onPress={onCopyCode} testID="offer-copy-code" />
          </ActionRow>
        ) : null}
      </Card>

      {canManage && actions.end ? (
        <ActionRow>
          {actions.edit ? <PillButton c={c} tone="outline" icon="pencil-outline" label={t('commerce.offers.detail.edit')} onPress={onEdit} disabled={busy} testID="offer-edit" /> : null}
          {actions.pause ? <PillButton c={c} tone="outline" icon="pause" label={t('commerce.offers.detail.pause')} onPress={onPause} disabled={busy} testID="offer-pause" /> : null}
          {actions.resume ? <PillButton c={c} tone="outline" icon="play" label={t('commerce.offers.detail.resume')} onPress={onResume} disabled={busy} testID="offer-resume" /> : null}
          <PillButton c={c} tone="danger" icon="stop-circle-outline" label={t('commerce.offers.detail.end')} onPress={onEnd} disabled={busy} testID="offer-end" />
        </ActionRow>
      ) : null}

      <StatGrid>
        <StatTile c={c} label={t('commerce.offers.detail.uses')} value={String(offer.stats?.usedCount ?? 0)} testID="offer-uses" />
        <StatTile c={c} label={t('commerce.offers.detail.discountGiven')} value={formatPaise(offer.stats?.discountGivenPaise ?? 0)} />
      </StatGrid>

      <Card c={c}>
        <Fact c={c} label={t('commerce.offers.detail.minBill')} value={cond.minOrderPaise ? formatPaise(cond.minOrderPaise) : t('commerce.offers.detail.anyBill')} />
        <Fact c={c} label={t('commerce.offers.detail.dates')} value={dates} />
        <Fact c={c} label={t('commerce.offers.detail.days')} value={days} />
        <Fact c={c} label={t('commerce.offers.detail.hours')} value={hours} />
        <Fact c={c} label={t('commerce.offers.detail.firstOrder')} value={cond.firstOrderOnly ? t('commerce.offers.detail.yes') : t('commerce.offers.detail.no')} />
        {cond.partyTags?.length ? <Fact c={c} label={t('commerce.offers.detail.tags')} value={cond.partyTags.join(', ')} /> : null}
        <Fact c={c} label={t('commerce.offers.detail.where')} value={channelsText(offer.channels, t) || '—'} />
        <Fact c={c} label={t('commerce.offers.detail.items')} value={scope} />
        {excluded ? <Fact c={c} label={t('commerce.offers.detail.leftOut')} value={t('commerce.offers.itemsCount', { count: excluded })} /> : null}
        <Fact c={c} label={t('commerce.offers.detail.limits')} value={limits} />
        <Fact c={c} label={t('commerce.offers.detail.stacking')} value={stacking} />
      </Card>

      <SectionLabel c={c}>{t('commerce.offers.detail.recentUses')}</SectionLabel>
      {uses.length ? (
        <Card c={c} style={styles.listCard}>
          {uses.map((u, i) => (
            <View key={u.id}>
              <UseRow c={c} use={u} />
              {i < uses.length - 1 ? <View style={[styles.divider, { backgroundColor: c.divider }]} /> : null}
            </View>
          ))}
        </Card>
      ) : (
        <Card c={c}><Text style={{ color: c.textSecondary }}>{t('commerce.offers.detail.noUses')}</Text></Card>
      )}
      {hasMore || loadingMore ? (
        <ActionRow>
          {loadingMore ? <ActivityIndicator color={c.primary} /> : (
            <PillButton c={c} tone="outline" icon="chevron-down" label={t('commerce.common.more')} onPress={onMore} testID="offer-uses-more" />
          )}
        </ActionRow>
      ) : null}
    </>
  );
}

function UseRow({ c, use }: { c: ColorScheme; use: OfferRedemption }) {
  const { t } = useTranslation();
  const reversed = use.status === 'REVERSED';
  const who = [use.sourceRef, use.partyName].filter(Boolean).join(' · ') || t(`commerce.offers.detail.source.${use.sourceType}`);
  return (
    <View style={styles.useRow} testID={`offer-use-${use.id}`}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[styles.useTitle, { color: c.textPrimary }]} numberOfLines={1}>{who}</Text>
        <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>{formatI18nDate(use.createdAt, t)}</Text>
      </View>
      <View style={styles.useRight}>
        <Text style={[styles.useAmount, { color: reversed ? c.textSecondary : c.textPrimary }]} numberOfLines={1}>
          {formatPaise(use.discountPaise)}
        </Text>
        <Tag c={c} tone={reversed ? 'warn' : 'good'} label={t(`commerce.offers.detail.useStatus.${use.status}`)} />
      </View>
    </View>
  );
}

function Fact({ c, label, value }: { c: ColorScheme; label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: c.textSecondary }]}>{label}</Text>
      <Text style={[styles.factValue, { color: c.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  name: { fontSize: 17, fontWeight: '700' },
  benefit: { fontSize: 16, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  note: { fontSize: 13, lineHeight: 19 },
  fact: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12, rowGap: 2 },
  factLabel: { fontSize: 13 },
  factValue: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  listCard: { padding: 0, gap: 0, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  useRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, minHeight: 56 },
  useTitle: { fontSize: 14, fontWeight: '600' },
  useRight: { alignItems: 'flex-end', gap: 4, maxWidth: '45%' },
  useAmount: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 12 },
});
