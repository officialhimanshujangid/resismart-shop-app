import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { Chip, Searchbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { themeColors, radii } from '../../../src/constants/colors';
import { BookingCard } from '../../../src/features/bookings/components/BookingCard';
import { BookingActionModal } from '../../../src/features/bookings/components/BookingActionModal';
import { useBookingAction, useBookingsList } from '../../../src/features/bookings/hooks';
import { BookingVerb, PartnerBookingView, VERB_LABELS } from '../../../src/features/bookings/booking.types';
import { apiErrorMessage } from '../../../src/api/axios';

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

  const filters = useMemo(
    () => ({ status: FILTER_STATUS[tab], code: code.trim() || undefined, limit: 50 }),
    [tab, code],
  );
  const list = useBookingsList(filters);
  const { act, pendingId, isPending } = useBookingAction();

  const runQuick = useCallback(
    (booking: PartnerBookingView, verb: BookingVerb) => {
      const prompt = CONFIRM_COPY[verb];
      const fire = () => {
        act(booking.id, verb).catch((e) => Alert.alert('Could not do that', apiErrorMessage(e)));
      };
      if (!prompt) return fire();
      Alert.alert(VERB_LABELS[verb], prompt, [
        { text: 'Not now', style: 'cancel' },
        { text: VERB_LABELS[verb], onPress: fire },
      ]);
    },
    [act],
  );

  const openForm = useCallback((booking: PartnerBookingView, verb: BookingVerb) => {
    setFormTarget({ booking, verb });
  }, []);

  const submitForm = useCallback(
    (body: Record<string, unknown>) => {
      if (!formTarget) return;
      const { booking, verb } = formTarget;
      act(booking.id, verb, body)
        .then(() => setFormTarget(null))
        .catch((e) => Alert.alert('Could not do that', apiErrorMessage(e)));
    },
    [act, formTarget],
  );

  const rows = list.data?.data ?? [];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Bookings</Text>
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
        refreshing={list.isFetching}
        onRefresh={() => void list.refetch()}
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
          !list.isLoading ? (
            <Text style={[styles.empty, { color: c.textSecondary }]}>
              {tab === 'REQUESTED' ? 'No new requests right now.' : 'Nothing here yet.'}
            </Text>
          ) : null
        }
      />

      <BookingActionModal
        visible={Boolean(formTarget)}
        verb={formTarget?.verb ?? null}
        booking={formTarget?.booking ?? null}
        isDark={isDark}
        submitting={isPending}
        onDismiss={() => setFormTarget(null)}
        onSubmit={submitForm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
  title: { fontSize: 24, fontWeight: '800' },
  search: { elevation: 0, borderRadius: radii.field },
  tabs: { flexDirection: 'row', gap: 8 },
  tabChip: {},
  list: { padding: 20, paddingTop: 12, flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
