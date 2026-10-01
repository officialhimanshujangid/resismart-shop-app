import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View, useColorScheme } from 'react-native';
import { Button, Snackbar, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { reviewsApi, ReviewListPage } from '../../../src/features/reviews/api';
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
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const query = useQuery({
    queryKey: qk.reviews(page),
    queryFn: () => reviewsApi.list(page, PAGE_SIZE),
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
          qk.reviews(page),
          (prev) => (prev ? { ...prev, data: prev.data.map((r) => (r._id === reviewId ? updated : r)) } : prev),
        );
        setToast(t('reviews.replyPosted'));
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
    [queryClient, page, t],
  );

  if (query.isPending) return <Screen c={c} title={t('reviews.title')}><Loading c={c} label={t('reviews.loading')} /></Screen>;
  if (query.isError) {
    return (
      <Screen c={c} title={t('reviews.title')}>
        <ErrorBlock c={c} message={apiErrorMessage(query.error, t('reviews.loadFailed'))} onRetry={() => query.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen c={c} title={t('reviews.title')} subtitle={t('reviews.subtitle')}>
      {reviews.length > 0 && (
        <Card c={c} style={styles.statsCard}>
          <StatBlock c={c} label={t('reviews.statPage')} value={pageAverage?.toFixed(1) ?? '—'} icon="star" />
          <StatBlock c={c} label={t('reviews.statTotal')} value={String(total)} />
          <StatBlock c={c} label={t('reviews.statAwaiting')} value={String(unanswered)} />
        </Card>
      )}

      {reviews.length === 0 ? (
        <EmptyBlock
          c={c}
          icon="star-outline"
          title={t('reviews.emptyTitle')}
          body={t('reviews.emptyBody')}
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
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.textPrimary }}>{r.rating}</Text>
              </View>
            </View>
            {r.moderationStatus === 'HELD' && (
              <View style={[styles.heldBadge, { backgroundColor: c.surfaceVariant }]}>
                <MaterialCommunityIcons name="eye-off-outline" size={14} color={c.warning} />
                <Text style={{ fontSize: 12, color: c.textPrimary, flexShrink: 1 }}>{t('reviews.held')}</Text>
              </View>
            )}
            <Text style={{ fontSize: 11, color: c.textDisabled, marginTop: 2 }}>
              {formatI18nDate(r.createdAt, t)}
              {r.bookingId ? t('reviews.afterBooking') : r.orderId ? t('reviews.afterOrder') : ''}
            </Text>
            {!!r.text && (
              <Text style={{ fontSize: 13, color: c.textSecondary, marginTop: 6, lineHeight: 18 }}>{r.text}</Text>
            )}

            <ReplyBox review={r} mayReply={mayReply} busy={replyingId === r._id} onSubmit={reply} c={c} />
          </Card>
        ))
      )}

      {totalPages > 1 && (
        <View style={styles.pager}>
          <Button compact disabled={page === 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>
            {t('reviews.previous')}
          </Button>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('reviews.pageOf', { page, total: totalPages })}</Text>
          <Button compact disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)}>
            {t('reviews.next')}
          </Button>
        </View>
      )}

      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>
        {toast}
      </Snackbar>
    </Screen>
  );
}

function StatBlock({ c, label, value, icon }: { c: ReturnType<typeof themeColors>; label: string; value: string; icon?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: c.textDisabled }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
        {icon && <MaterialCommunityIcons name={icon as never} size={14} color={c.warning} />}
        <Text style={{ fontSize: 16, fontWeight: '600', color: c.textPrimary }}>{value}</Text>
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
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 4 },
});
