import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Chip, Searchbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { themeColors, radii } from '../../../src/constants/colors';
import { Hero } from '../../../src/components/Hero';
import { BookingCard } from '../../../src/features/bookings/components/BookingCard';
import { BookingActionModal } from '../../../src/features/bookings/components/BookingActionModal';
import { useBookingAction, useBookingsList } from '../../../src/features/bookings/hooks';
import { BookingConflictView, BookingVerb, PartnerBookingView, VERB_LABELS } from '../../../src/features/bookings/booking.types';
import { slotConflictsOf } from '../../../src/features/bookings/booking.api';
import { apiErrorMessage, apiErrorCode } from '../../../src/api/axios';
import { ErrorBlock } from '../../../src/features/more/ui';
// `as Href` on the push below: the destination is built with a query string, so
// it is not one of the literal routes the generated union describes — the same
// documented escape hatch `catalog/create.tsx` uses for `returnTo`.
import { router, type Href } from 'expo-router';

/**
 * Accept / reject / reschedule / assign, and "I've reached" → the customer's
 * completion code.
 *
 * The tab is only reachable when the gate already says `BOOKINGS_VIEW: READ`
 * and module `BOOKINGS` is on — see `(tabs)/_layout.tsx`. What is NOT true is
 * that everybody who can reach this tab may act: `BookingCard` draws a button
 * only for a verb in THIS booking's own `allowedVerbs`, which the server
 * computed for THIS viewer (manager or the assignee, never both blindly) from
 * the same table `booking-transitions.ts` enforces. A button that would 400 is
 * a button this screen never draws in the first place.
 */

type FilterTab = 'LIVE' | 'REQUESTED' | 'PAST';

const FILTER_STATUS: Record<FilterTab, string | undefined> = {
  REQUESTED: 'REQUESTED',
  LIVE: 'ACCEPTED,SCHEDULED,RESCHEDULED,IN_PROGRESS',
  PAST: 'COMPLETED,INVOICED,PAID,REJECTED,CANCELLED,NO_SHOW',
};

const TAB_LABEL: Record<FilterTab, string> = {
  REQUESTED: 'New',
  LIVE: 'Live',
  PAST: 'Past',
};

/** One page. Was a flat `limit: 50` with no second page — see the accumulate effect. */
const PAGE_LIMIT = 20;

/** Verbs whose confirmation is a native alert rather than the form sheet — see `BookingCard.CONFIRM_DIRECTLY`. */
const CONFIRM_COPY: Partial<Record<BookingVerb, string>> = {
  accept: 'Accept this booking?',
  start: 'Start this job now?',
  reach: 'Send the customer their completion code now?',
  noShow: 'Mark this as nobody turning up? This closes the job.',
};

export default function BookingsScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const [tab, setTab] = useState<FilterTab>('REQUESTED');
  const [code, setCode] = useState('');
  const [formTarget, setFormTarget] = useState<{ booking: PartnerBookingView; verb: BookingVerb } | null>(null);
  /** The appointments the last submit was refused for — see `submitForm`. */
  const [conflicts, setConflicts] = useState<BookingConflictView[]>([]);

  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PartnerBookingView[]>([]);

  // Any change of tab or search starts the accumulated list over at page 1.
  useEffect(() => {
    setPage(1);
    setRows([]);
  }, [tab, code]);

  const filters = useMemo(
    () => ({ status: FILTER_STATUS[tab], code: code.trim() || undefined, page, limit: PAGE_LIMIT }),
    [tab, code, page],
  );
  const list = useBookingsList(filters);
  const { act, pendingId, isPending } = useBookingAction();

  /**
   * Pages accumulated into one list — the `(tabs)/orders.tsx` pattern, which
   * this screen was the only list not to use.
   *
   * It asked for `limit: 50` and had NO paging at all, and the Past tab is where
   * that hurt: a shop doing ten jobs a week runs out of reachable history in
   * about five weeks, and last quarter's bookings were simply not addressable
   * from anywhere in the app. `bookingApi.list` has always returned
   * `page`/`limit`/`total`; nothing was asking for page two.
   *
   * De-duplicated by id: a booking whose status changes moves between tabs and
   * can shift across a page boundary between two requests.
   */
  useEffect(() => {
    if (!list.data) return;
    setRows((prev) => {
      if (list.data.page === 1) return list.data.data;
      const seen = new Set(prev.map((b) => b.id));
      return [...prev, ...list.data.data.filter((b) => !seen.has(b.id))];
    });
  }, [list.data]);

  const hasMore = list.data ? rows.length < list.data.total : false;
  const loadMore = useCallback(() => {
    if (list.isFetching || !hasMore) return;
    setPage((p) => p + 1);
  }, [list.isFetching, hasMore]);

  /**
   * The Billing screen, opened to raise the bill for THIS job.
   *
   * `sourceType`/`sourceId` are the link `POST /bookings/:id/invoice` reads back
   * — without them the document is MANUAL and the job can never be invoiced.
   * The rest is prefill: the party the booking already created, and one line at
   * the total actually agreed (`pricing.totalPaise`, not the service's list
   * price — a job that was rescheduled, or one carrying a visit charge, is
   * billed at what the booking says).
   *
   * `advancePaise` is deliberately NOT subtracted. An advance is a PAYMENT
   * against the bill, recorded on the document where it moves the party's
   * balance; netting it off the line would hide it from the ledger and hand the
   * customer an invoice whose total is not what they agreed.
   */
  const openBillFor = useCallback((booking: PartnerBookingView) => {
    const q = new URLSearchParams({
      sourceType: 'BOOKING',
      sourceId: booking.id,
      itemName: booking.serviceSnapshot.name,
      ratePaise: String(booking.pricing.totalPaise),
    });
    if (booking.customer.partyId) q.set('partyId', booking.customer.partyId);
    if (booking.customer.name) q.set('partyName', booking.customer.name);
    if (booking.customer.phone) q.set('partyPhone', booking.customer.phone);
    router.push(`/(app)/billing/new?${q.toString()}` as Href);
  }, []);

  const runQuick = useCallback(
    (booking: PartnerBookingView, verb: BookingVerb) => {
      const prompt = CONFIRM_COPY[verb];
      const fire = () => {
        act(booking.id, verb).catch((e) => {
          /**
           * `invoice` does not raise the bill — it records that a bill covers
           * the job, and refuses while none does. That refusal has an obvious
           * next step, and leaving the partner to find the Billing tab, pick the
           * right customer and retype the amount is how a finished job stays
           * unbilled. So the refusal offers to go and do it.
           */
          if (verb === 'invoice' && apiErrorCode(e) === 'NO_BILL_RAISED') {
            Alert.alert(
              'No bill for this job yet',
              'Raise it now? The customer and the amount are filled in for you.',
              [
                { text: 'Not now', style: 'cancel' },
                { text: 'Raise the bill', onPress: () => openBillFor(booking) },
              ],
            );
            return;
          }
          Alert.alert('Could not do that', apiErrorMessage(e));
        });
      };
      if (!prompt) return fire();
      Alert.alert(VERB_LABELS[verb], prompt, [
        { text: 'Not now', style: 'cancel' },
        { text: VERB_LABELS[verb], onPress: fire },
      ]);
    },
    [act, openBillFor],
  );

  const openForm = useCallback((booking: PartnerBookingView, verb: BookingVerb) => {
    setFormTarget({ booking, verb });
  }, []);

  const submitForm = useCallback(
    (body: Record<string, unknown>) => {
      if (!formTarget) return;
      const { booking, verb } = formTarget;
      setConflicts([]);
      act(booking.id, verb, body)
        .then(() => setFormTarget(null))
        .catch((e) => {
          /**
           * A refusal that NAMES the appointments in the way stays in the sheet.
           *
           * `extend` answers 409 `SLOT_TAKEN_AHEAD` carrying `data.conflicts[]`.
           * "Could not do that" throws away the only part the partner can act
           * on — the whole reason `BookingConflictError` carries a body is so
           * the app can show whose appointment is about to be eaten into and
           * offer to move it rather than presenting a dead end with an OK
           * button.
           */
          const named = slotConflictsOf(e);
          if (named.length) return setConflicts(named);
          Alert.alert('Could not do that', apiErrorMessage(e));
        });
    },
    [act, formTarget],
  );

  /**
   * Why the diary is empty, when it is empty for a reason other than "no
   * bookings".
   *
   * `isLoading` goes false whether the request succeeded or failed, so on its
   * own it hands a 500, a 403 or a dropped connection straight to "No new
   * requests right now." — telling a partner their day is clear when the app
   * simply does not know. The paused case is the same lie from the other side:
   * `onlineManager` (see `lib/queryClient.ts`) holds a query rather than firing
   * it into a dead radio, so "still pending" means "offline" as often as it
   * means "loading" and only one of those deserves a spinner.
   */
  const loadError = list.isError
    ? apiErrorMessage(list.error, 'Could not load your bookings.')
    : list.isPending && list.isPaused
      ? 'No connection. Check your network and try again.'
      : null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <Hero isDark={isDark} rounded={false} eyebrow="Manage" title="Bookings" />
      <View style={styles.controls}>
        <Searchbar
          placeholder="Search by code (BK-0001)"
          value={code}
          onChangeText={setCode}
          style={[styles.search, { backgroundColor: c.surfaceVariant }]}
          inputStyle={{ minHeight: 0 }}
        />
        <View style={styles.tabs}>
          {(Object.keys(TAB_LABEL) as FilterTab[]).map((t) => (
            <Chip key={t} selected={tab === t} onPress={() => setTab(t)} style={styles.tabChip}>
              {TAB_LABEL[t]}
            </Chip>
          ))}
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        // `page === 1` on both: without it, fetching page four spins the
        // pull-to-refresh indicator at the TOP of a list the partner is reading
        // the bottom of.
        refreshing={list.isFetching && page === 1}
        onRefresh={() => { setPage(1); void list.refetch(); }}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListFooterComponent={
          list.isFetching && page > 1 ? (
            <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} />
          ) : null
        }
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            isDark={isDark}
            pending={isPending && pendingId === item.id}
            onQuickAction={(verb) => runQuick(item, verb)}
            onOpenForm={(verb) => openForm(item, verb)}
          />
        )}
        ListEmptyComponent={
          loadError ? (
            <ErrorBlock c={c} message={loadError} onRetry={() => void list.refetch()} />
          ) : list.isLoading ? null : (
            <Text style={[styles.empty, { color: c.textSecondary }]}>
              {tab === 'REQUESTED' ? 'No new requests right now.' : 'Nothing here yet.'}
            </Text>
          )
        }
      />

      <BookingActionModal
        visible={Boolean(formTarget)}
        verb={formTarget?.verb ?? null}
        booking={formTarget?.booking ?? null}
        isDark={isDark}
        submitting={isPending}
        conflicts={conflicts}
        onDismiss={() => { setConflicts([]); setFormTarget(null); }}
        onSubmit={submitForm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: { paddingHorizontal: 20, paddingTop: 14, gap: 10 },
  search: { elevation: 0, borderRadius: radii.field },
  tabs: { flexDirection: 'row', gap: 8 },
  tabChip: {},
  list: { padding: 20, paddingTop: 12, flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
