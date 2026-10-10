import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from 'react-native-paper';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAppTheme } from '../../../src/theme/useAppTheme';
import { Rise } from '../../../src/theme/motion';
import { Button, Card, StatusBadge, SearchField, SkeletonList, SuccessCheck, useShake, Money, Detail } from '../../../src/components/ui';
import { themeColors } from '../../../src/constants/colors';
import { Screen } from '../../../src/features/more/ui';
import { partiesApi, MergeCandidate, MergeMatch, MergePreview, MergeSide } from '../../../src/api/parties.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { formatPaise } from '../../../src/lib/money';
import { qk } from '../../../src/lib/queryKeys';
import { usePartnerEntitlements } from '../../../src/hooks';

/**
 * M21 — "Merge customer" (Owner AS answer 7), opened from a customer's screen.
 * One person shows up as two customers (phone login + email login, or a walk-in
 * typed by hand): pick the other entry, see BOTH balances and history counts,
 * confirm; the server folds it into this one in one transaction (Idempotency-Key,
 * one per intent, held across retries). Same steps and words as the web's merge
 * sheet. Presented as a modal sheet (slides up); success springs a check; a
 * refusal shakes the message; skeletons while loading; reduce-motion respected.
 */

const MATCH_KEY: Record<MergeMatch, string> = {
  SAME_PERSON_LOGIN: 'parties.merge.matchLogin', PHONE: 'parties.merge.matchPhone', EMAIL: 'parties.merge.matchEmail',
};

export default function MergeCustomerScreen() {
  const { t } = useTranslation();
  const { ds, isDark, status } = useAppTheme();
  const c = themeColors(isDark);
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { can } = usePartnerEntitlements();
  const mayMerge = can('CUSTOMERS', 'FULL') && can('INVOICING_MANAGE', 'FULL');
  const queryClient = useQueryClient();
  const { style: shakeStyle, shake } = useShake();

  const [q, setQ] = useState('');
  const [found, setFound] = useState<MergeCandidate[] | null>(null);
  const [other, setOther] = useState<MergeCandidate | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const intent = useRef<{ otherId: string; key: string } | null>(null);

  const candidates = useQuery({
    queryKey: [...qk.parties.detail(id), 'merge-candidates'],
    queryFn: () => partiesApi.mergeCandidates(id),
    enabled: mayMerge && Boolean(id),
  });

  const fail = useCallback((msg: string) => { setError(msg); shake(); }, [shake]);

  const search = useCallback(async (text: string) => {
    setQ(text);
    const term = text.trim();
    if (term.length < 2) { setFound(null); return; }
    try {
      const rows = await partiesApi.search(term, 'CUSTOMER', 10);
      setFound(rows.filter((r) => r._id !== id).map((r) => ({
        partyId: r._id, name: r.name, outstandingPaise: r.outstandingPaise ?? 0,
        isResidentLinked: Boolean(r.residentUserId), isActive: r.isActive !== false, matchedBy: [],
      })));
    } catch (e) {
      fail(apiErrorMessage(e, t('parties.merge.loadFailed')));
    }
  }, [id, fail, t]);

  const pick = useCallback(async (row: MergeCandidate) => {
    setOther(row); setPreview(null); setError('');
    try {
      setPreview(await partiesApi.mergePreview(id, row.partyId));
    } catch (e) {
      fail(apiErrorMessage(e, t('parties.merge.previewFailed')));
    }
  }, [id, fail, t]);

  const confirm = useCallback(async () => {
    if (!other || !preview) return;
    if (!intent.current || intent.current.otherId !== other.partyId) {
      intent.current = { otherId: other.partyId, key: newIdempotencyKey('merge') };
    }
    setBusy(true); setError('');
    try {
      await partiesApi.merge(id, other.partyId, intent.current.key);
      intent.current = null;
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: qk.parties.all() });
      setTimeout(() => router.back(), 1200);
    } catch (e) {
      fail(apiErrorMessage(e, t('parties.merge.mergeFailed')));
    } finally {
      setBusy(false);
    }
  }, [other, preview, id, queryClient, fail, t]);

  const sideCard = (s: MergeSide, label: string, keep: boolean) => (
    <Card tone={keep ? 'soft' : 'surface'}>
      <Text style={[styles.eyebrow, { color: ds.muted }]}>{label}</Text>
      <Text style={[styles.name, { color: ds.ink }]}>{s.name}</Text>
      {s.phoneMasked || s.emailMasked ? <Detail>{[s.phoneMasked, s.emailMasked].filter(Boolean).join(' · ')}</Detail> : null}
      <View style={styles.grid}>
        <Detail>{t('parties.merge.due')}</Detail><Money size="number">{formatPaise(s.outstandingPaise)}</Money>
        <Detail>{t('parties.merge.credit')}</Detail><Money size="number">{formatPaise(s.walletCreditPaise)}</Money>
        <Detail>{t('parties.merge.points')}</Detail><Money size="number">{String(s.points)}</Money>
      </View>
      <Detail>{t('parties.merge.history', { bills: s.counts.documents, payments: s.counts.payments, orders: s.counts.orders + s.counts.bookings })}</Detail>
    </Card>
  );

  const list = found ?? candidates.data ?? null;

  return (
    <Screen c={c} title={t('parties.merge.title')} subtitle={name ? String(name) : undefined} scroll={!other || !!preview || done}>
      <Stack.Screen options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      {!mayMerge ? (
        <Detail>{t('parties.merge.noRight')}</Detail>
      ) : done ? (
        <View style={styles.done}>
          <SuccessCheck size={84} testID="merge-done" />
          <Text style={[styles.name, { color: ds.ink, textAlign: 'center' }]}>{t('parties.merge.mergedShort')}</Text>
        </View>
      ) : !other ? (
        <View style={{ gap: 12 }}>
          <Rise index={0}><Detail>{t('parties.merge.subtitle', { name: name ?? '' })}</Detail></Rise>
          <Rise index={1}><Detail>{t('parties.merge.pickHelp')}</Detail></Rise>
          <Rise index={2}>
            <SearchField value={q} onChangeText={(v) => void search(v)} placeholder={t('parties.merge.searchPlaceholder')}
              accessibilityLabel={t('parties.merge.searchLabel')} />
          </Rise>
          {error ? <Animated.View style={shakeStyle}><Text style={{ color: status.danger.fg }} accessibilityLiveRegion="polite">{error}</Text></Animated.View> : null}
          <Text style={[styles.eyebrow, { color: ds.muted }]}>{found ? t('parties.merge.searchResults') : t('parties.merge.suggested')}</Text>
          {list === null ? <SkeletonList rows={3} /> : list.length === 0 ? (
            <Card><Detail>{found ? t('parties.merge.noResults') : t('parties.merge.noSuggestions')}</Detail></Card>
          ) : (
            <FlatList
              data={list}
              scrollEnabled={false}
              keyExtractor={(r) => r.partyId}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              renderItem={({ item, index }) => (
                <Rise index={Math.min(index + 3, 8)}>
                  <Pressable onPress={() => void pick(item)} accessibilityRole="button" accessibilityLabel={item.name}
                    style={({ pressed }) => [styles.row, { backgroundColor: ds.surface, borderColor: ds.line, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowName, { color: ds.ink }]}>{item.name}</Text>
                      {item.phoneMasked || item.emailMasked ? <Detail>{[item.phoneMasked, item.emailMasked].filter(Boolean).join(' · ')}</Detail> : null}
                      {item.matchedBy.length || !item.isActive ? (
                        <View style={styles.badges}>
                          {item.matchedBy.map((m) => <StatusBadge key={m} tone="info" label={t(MATCH_KEY[m])} />)}
                          {!item.isActive ? <StatusBadge tone="neutral" label={t('parties.merge.hidden')} /> : null}
                        </View>
                      ) : null}
                    </View>
                    <Money size="number">{formatPaise(item.outstandingPaise)}</Money>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={ds.muted} />
                  </Pressable>
                </Rise>
              )}
            />
          )}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {error ? <Animated.View style={shakeStyle}><Text style={{ color: status.danger.fg }} accessibilityLiveRegion="polite">{error}</Text></Animated.View> : null}
          {!preview && !error ? <SkeletonList rows={4} /> : null}
          {preview ? (
            <>
              <View style={styles.badges}>
                {preview.matchedBy.map((m) => <StatusBadge key={m} tone="info" label={t(MATCH_KEY[m])} />)}
              </View>
              <Rise index={0}>{sideCard(preview.remove, t('parties.merge.removeLabel'), false)}</Rise>
              <View style={{ alignItems: 'center' }}><MaterialCommunityIcons name="arrow-down" size={22} color={ds.muted} /></View>
              <Rise index={1}>{sideCard(preview.keep, t('parties.merge.keepLabel'), true)}</Rise>
              <Rise index={2}>
                <Card>
                  <Text style={[styles.eyebrow, { color: ds.muted }]}>{t('parties.merge.afterLabel')}</Text>
                  <View style={styles.grid}>
                    <Detail>{t('parties.merge.due')}</Detail><Money size="amount">{formatPaise(preview.after.outstandingPaise)}</Money>
                    <Detail>{t('parties.merge.credit')}</Detail><Money size="number">{formatPaise(preview.after.walletCreditPaise)}</Money>
                    <Detail>{t('parties.merge.points')}</Detail><Money size="number">{String(preview.after.points)}</Money>
                  </View>
                </Card>
              </Rise>
              <Rise index={3}>
                <Card tone="warm"><Detail>{t('parties.merge.warning', { name: preview.remove.name, keep: preview.keep.name })}</Detail></Card>
              </Rise>
            </>
          ) : null}
          <View style={styles.actions}>
            <Button label={t('parties.merge.back')} variant="outline" disabled={busy}
              onPress={() => { setOther(null); setPreview(null); setError(''); }} />
            {preview ? (
              <Button label={t('parties.merge.confirm')} icon="call-merge" loading={busy} disabled={busy} onPress={() => void confirm()} testID="merge-confirm" />
            ) : null}
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  name: { fontSize: 17, fontWeight: '700', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4, marginVertical: 8, justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  rowName: { fontSize: 15, fontWeight: '600' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  done: { alignItems: 'center', gap: 12, paddingVertical: 40 },
});
