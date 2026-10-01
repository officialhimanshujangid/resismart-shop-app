import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, useColorScheme, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { PillButton } from '../../../src/features/p1/ui';
import { ChoiceChips } from '../../../src/features/p2/ui';
import { useDebouncedValue } from '../../../src/features/billing/useDebouncedValue';
import { jobKeys, jobsApi } from '../../../src/features/jobs/api';
import { mayQuote, STAGE_FILTERS } from '../../../src/features/jobs/logic';
import type { JobStage } from '../../../src/features/jobs/types';
import { JobRowItem } from '../../../src/features/jobs/components/JobRowItem';
import { BookingPickerSheet } from '../../../src/features/jobs/components/BookingPickerSheet';

/**
 * Jobs: every job this business has quoted, newest activity first. Stage chips
 * and a search on the job code or the service (never the customer — names stay
 * masked until the job is taken). "New quote" picks an open booking and goes
 * straight to the quote screen.
 */
export default function JobsListScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { can } = usePartnerEntitlements();
  const [stage, setStage] = useState<'' | JobStage>('');
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 300).trim();
  const [picking, setPicking] = useState(false);

  const list = useQuery({
    queryKey: jobKeys.list(stage, debounced),
    queryFn: () => jobsApi.list({ ...(stage ? { stage } : {}), q: debounced, limit: 100 }),
  });
  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;

  const header = (
    <View style={styles.header}>
      {mayQuote(can) ? (
        <View style={styles.headRow}>
          <PillButton c={c} icon="file-document-edit-outline" label={t('p2.jobs.list.newQuote')} onPress={() => setPicking(true)} testID="jobs-new-quote" />
        </View>
      ) : null}
      <TextInput
        mode="outlined"
        placeholder={t('p2.jobs.list.search')}
        accessibilityLabel={t('p2.jobs.list.search')}
        value={q}
        onChangeText={setQ}
        style={{ backgroundColor: 'transparent' }}
        outlineStyle={{ borderRadius: radii.field }}
        left={<TextInput.Icon icon="magnify" />}
        testID="jobs-search"
      />
      <ChoiceChips
        c={c}
        options={STAGE_FILTERS.map((s) => ({ key: s || 'ALL', label: s ? t(`p2.jobs.filter.${s}`) : t('p2.common.all') }))}
        value={[stage || 'ALL']}
        onChange={(v) => setStage((v[0] === 'ALL' ? '' : v[0]) as '' | JobStage)}
        testID="jobs-stage-chips"
      />
      {total > rows.length ? (
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.common.showing', { shown: rows.length, total })}</Text>
      ) : null}
    </View>
  );

  return (
    <Screen title={t('p2.jobs.list.title')} c={c} scroll={false}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} />}
        renderItem={({ item }) => (
          <JobRowItem c={c} row={item} onPress={() => router.push(`/jobs/${item.id}` as Href)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          list.isPending ? <Loading c={c} />
            : list.isError ? <ErrorBlock c={c} message={apiErrorMessage(list.error, t('p2.common.loadFailed'))} onRetry={() => list.refetch()} />
              : <EmptyBlock c={c} icon="hammer-wrench" title={t('p2.jobs.list.empty')} body={t('p2.jobs.list.emptyBody')} />
        }
      />
      <BookingPickerSheet
        c={c}
        visible={picking}
        onDismiss={() => setPicking(false)}
        onPick={(b) => { setPicking(false); router.push(`/jobs/quote?bookingId=${b.id}` as Href); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  header: { gap: 10, marginBottom: 12 },
  headRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
