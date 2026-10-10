import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
// M19 redesign: kit buttons + toast, count-up KPIs (Sora), skeleton, rise.
import { Button, Segmented, useToast } from '../../../src/components/ui';
import { useCountUp } from '../../../src/theme/motion';
import { fontFamily } from '../../../src/theme/tokens';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { reviewsApi, ReviewListPage, REVIEW_FILTERS, ReviewFilter } from '../../../src/features/reviews/api';
import { formatI18nDate } from '../../../src/i18n';
import { ReplyBox } from '../../../src/features/reviews/components/ReplyBox';
import { Card, EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';

const PAGE_SIZE = 20;

/**
 * Reviews — what residents said, and the one place the partner can answer
 * from their phone. C7, mirroring web `partner/reviews/page.tsx`.
 *
 * Reads `GET /reviews/mine` — this business's reviews including the ones a
 * moderator HELD, which carry a badge saying residents cannot see them.
 * Author names arrive masked ("Priya N."). The reply box is drawn only for
 * somebody who manages bookings or orders — the rule the server applies.
 */
export default function ReviewsScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const queryClient = useQueryClient();

  // The server's rule for `POST /reviews/:id/reply`: bookings or orders at FULL.
  const mayReply = can('BOOKINGS_MANAGE', 'FULL') || can('ORDERS_MANAGE', 'FULL');

  const [page, setPage] = useState(1);
  // M19 parity with web: the same All / Public / Held / Removed strip.
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const toast = useToast();
  const setToast = useCallback(
    (message: string, tone: 'success' | 'danger' = 'danger') => toast.show({ message, tone }),
    [toast],
  );

  const query = useQuery({
    queryKey: qk.reviews(page, filter),
    queryFn: () => reviewsApi.list(page, PAGE_SIZE, filter),
    // Switching the strip keeps the old list on screen until the new one lands (no full-screen flash).
    placeholderData: (prev) => prev,
  });

  const reviews = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // On screen only, and labelled as such — the partner's true average is
  // recomputed server-side across every published review; printing a page
  // average as "your rating" would show a different number on page 2 of the
  // same list.
  const pageAverage = useMemo(() => {
    if (!reviews.length) return null;
    // `sum`, not `t`: this file holds a translator now, and a reducer
    // accumulator called `t` shadows it inside the callback.
    return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  }, [reviews]);
  const unanswered = useMemo(() => reviews.filter((r) => !r.partnerReply).length, [reviews]);

  const reply = useCallback(
    async (reviewId: string, text: string) => {
      setReplyingId(reviewId);
      try {
        const updated = await reviewsApi.reply(reviewId, text);
        // Patched in place rather than refetched: the list is sorted
        // newest-first and a refetch would jump a partner working down a long
        // page back to the top of it.
        queryClient.setQueryData<ReviewListPage | undefined>(
          qk.reviews(page, filter),
          (prev) => (prev ? { ...prev, data: prev.data.map((r) => (r._id === reviewId ? updated : r)) } : prev),
        );
        setToast(t('reviews.replyPosted'), 'success');
      } catch (e: unknown) {
        // A refusal about WHO may reply is said in full, not in a 4-second toast.
        const code = apiErrorCode(e);
        if (code === 'REVIEW_REPLY_NOT_ALLOWED' || code === 'ACCESS_NOT_ASSIGNED') {
          Alert.alert(t('reviews.replyFailed'), apiErrorMessage(e));
        } else {
          setToast(apiErrorMessage(e, t('reviews.replyFailed')));
        }
      } finally {
        setReplyingId(null);
      }
    },
    [queryClient, page, filter, t, setToast],
  );

  if (query.isPending) return <Screen c={c} title={t('reviews.title')}><Loading c={c} label={t('reviews.loading')} skeleton={4} /></Screen>;
  if (query.isError) {
    return (
      <Screen c={c} title={t('reviews.title')}>
        <ErrorBlock c={c} message={apiErrorMessage(query.error, t('reviews.loadFailed'))} onRetry={() => query.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen c={c} title={t('reviews.title')} subtitle={t('reviews.subtitle')} rise>
      <Segmented<ReviewFilter>
        testID="reviews-filter"
        options={REVIEW_FILTERS.map((f) => ({ key: f, label: t(`reviews.filter.${f}`) }))}
        value={filter}
        onChange={(f) => { setFilter(f); setPage(1); }}
      />
      {reviews.length > 0 && (
        <Card c={c} style={styles.statsCard}>
          <StatBlock c={c} label={t('reviews.statPage')} value={pageAverage} decimals={1} icon="star" />
          <StatBlock c={c} label={t('reviews.statTotal')} value={total} />
          <StatBlock c={c} label={t('reviews.statAwaiting')} value={unanswered} />
        </Card>
      )}

      {reviews.length === 0 ? (
        <EmptyBlock
          c={c}
          icon="star-outline"
          title={filter === 'all' ? t('reviews.emptyTitle') : t('reviews.emptyFiltered')}
          body={filter === 'all' ? t('reviews.emptyBody') : undefined}
        />
      ) : (
        reviews.map((r) => (
          <Card key={r._id} c={c} style={styles.reviewCard}>
            <View style={styles.headerRow}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.textPrimary }} numberOfLines={1}>
                {/* `authorName` arrives from the server already masked to
                    "Priya N." — a real person's name, never translated. */}
                {r.authorName || t('reviews.anonymousAuthor')}
              </Text>
              <View style={styles.ratingRow}>
                <MaterialCommunityIcons name="star" size={14} color={c.warning} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.textPrimary, flexShrink: 1 }}>{r.rating}</Text>
              </View>
            </View>
            {r.moderationStatus !== 'PUBLISHED' && (
              <View style={[styles.heldBadge, { backgroundColor: c.surfaceVariant }]}>
                <MaterialCommunityIcons name={r.moderationStatus === 'REMOVED' ? 'delete-outline' : 'eye-off-outline'} size={14} color={c.warning} />
                <Text style={{ fontSize: 12, color: c.textPrimary, flexShrink: 1 }}>
                  {r.moderationStatus === 'REMOVED' ? t('reviews.removed') : t('reviews.held')}
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 11, color: c.textSecondary, marginTop: 2 }}>
              {formatI18nDate(r.createdAt, t)}
              {r.bookingId ? t('reviews.afterBooking') : r.orderId ? t('reviews.afterOrder') : ''}
            </Text>
            {!!r.text && (
              <Text style={{ fontSize: 13, color: c.textSecondary, marginTop: 6, lineHeight: 18 }}>{r.text}</Text>
            )}

            {r.photos && r.photos.length > 0 ? (
              <View style={styles.photos}>
                {r.photos.map((src, i) => (
                  <Image
                    key={src}
                    source={{ uri: src }}
                    accessibilityLabel={t('reviews.photoAlt', { n: i + 1 })}
                    style={[styles.photo, { borderColor: c.border }]}
                  />
                ))}
              </View>
            ) : null}

            {/* A removed review cannot be answered on a page it no longer shows on (web rule). */}
            <ReplyBox review={r} mayReply={mayReply && r.moderationStatus !== 'REMOVED'} busy={replyingId === r._id} onSubmit={reply} c={c} />
          </Card>
        ))
      )}

      {totalPages > 1 && (
        <View style={styles.pager}>
          <Button size="sm" variant="outline" icon="chevron-left" label={t('reviews.previous')} disabled={page === 1} onPress={() => setPage((p) => Math.max(1, p - 1))} />
          <Text style={{ color: c.textSecondary, fontSize: 12, flexShrink: 1, textAlign: 'center' }}>{t('reviews.pageOf', { page, total: totalPages })}</Text>
          <Button size="sm" variant="outline" label={t('reviews.next')} disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)} />
        </View>
      )}

    </Screen>
  );
}

function StatBlock({
  c, label, value, icon, decimals = 0,
}: { c: ReturnType<typeof themeColors>; label: string; value: number | null; icon?: string; decimals?: number }) {
  // M19 — KPIs count up (DS §5); reduce-motion shows the final number at once.
  const scale = 10 ** decimals;
  const shown = useCountUp(Math.round((value ?? 0) * scale)) / scale;
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: c.textSecondary }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
        {icon && <MaterialCommunityIcons name={icon as never} size={14} color={c.warning} />}
        <Text style={{ fontSize: 18, fontFamily: fontFamily.sora600, color: c.textPrimary }}>
          {value === null ? '—' : shown.toFixed(decimals)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statsCard: { flexDirection: 'row', gap: 12 },
  reviewCard: { gap: 0 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  heldBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 6 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  photo: { width: 64, height: 64, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 4 },
});
