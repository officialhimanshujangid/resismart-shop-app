import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { Button, Snackbar, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { useAuth } from '../../../src/context/AuthContext';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { reviewsApi, ReviewListPage } from '../../../src/features/reviews/api';
import { fmtReviewDate } from '../../../src/features/reviews/types';
import { ReplyBox } from '../../../src/features/reviews/components/ReplyBox';
import { Card, EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';

const PAGE_SIZE = 20;

/**
 * Reviews — what residents said, and the one place the partner can answer
 * from their phone. C7, mirroring web `partner/reviews/page.tsx`.
 *
 * Reads the PUBLIC list (`GET /partners/:partnerId/reviews`) with the
 * signed-in partner's own tenant id — see `features/reviews/api.ts`'s header
 * for why there is no partner-scoped list to call instead. Author names
 * arrive masked ("Priya N.") for the same reason they do on web: this is
 * exactly what a resident browsing the profile page sees.
 */
export default function ReviewsScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const mayReply = can('CUSTOMERS', 'FULL');
  const partnerId = profile?.tenantType === 'PARTNER' ? profile.tenantId : undefined;

  const [page, setPage] = useState(1);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const query = useQuery({
    queryKey: qk.reviews(page),
    queryFn: () => reviewsApi.list(partnerId as string, page, PAGE_SIZE),
    enabled: Boolean(partnerId),
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
    return reviews.reduce((t, r) => t + r.rating, 0) / reviews.length;
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
        setToast('Reply posted');
      } catch (e: unknown) {
        setToast(apiErrorMessage(e, 'That reply could not be posted.'));
      } finally {
        setReplyingId(null);
      }
    },
    [queryClient, page],
  );

  if (!partnerId) {
    return (
      <Screen c={c} title="Reviews">
        <ErrorBlock c={c} message="Reviews belong to one business, and this session is not in a business context." />
      </Screen>
    );
  }

  if (query.isPending) return <Screen c={c} title="Reviews"><Loading c={c} label="Loading your reviews…" /></Screen>;
  if (query.isError) {
    return (
      <Screen c={c} title="Reviews">
        <ErrorBlock c={c} message={apiErrorMessage(query.error, 'We could not load your reviews.')} onRetry={() => query.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen c={c} title="Reviews" subtitle="What residents said, and your reply">
      {reviews.length > 0 && (
        <Card c={c} style={styles.statsCard}>
          <StatBlock c={c} label="On this page" value={pageAverage?.toFixed(1) ?? '—'} icon="star" />
          <StatBlock c={c} label="Published" value={String(total)} />
          <StatBlock c={c} label="Awaiting reply" value={String(unanswered)} />
        </Card>
      )}

      {reviews.length === 0 ? (
        <EmptyBlock
          c={c}
          icon="star-outline"
          title="No reviews yet"
          body="Residents can review you once a booking or an order is closed."
        />
      ) : (
        reviews.map((r) => (
          <Card key={r._id} c={c} style={styles.reviewCard}>
            <View style={styles.headerRow}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.textPrimary }} numberOfLines={1}>
                {r.authorName || 'A resident'}
              </Text>
              <View style={styles.ratingRow}>
                <MaterialCommunityIcons name="star" size={14} color={c.warning} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.textPrimary }}>{r.rating}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 11, color: c.textDisabled, marginTop: 2 }}>
              {fmtReviewDate(r.createdAt)}
              {r.bookingId ? ' · after a booking' : r.orderId ? ' · after an order' : ''}
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
            Previous
          </Button>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>Page {page} of {totalPages}</Text>
          <Button compact disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)}>
            Next
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
      <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: c.textDisabled }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
        {icon && <MaterialCommunityIcons name={icon as never} size={14} color={c.warning} />}
        <Text style={{ fontSize: 16, fontWeight: '800', color: c.textPrimary }}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statsCard: { flexDirection: 'row', gap: 12 },
  reviewCard: { gap: 0 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 4 },
});
