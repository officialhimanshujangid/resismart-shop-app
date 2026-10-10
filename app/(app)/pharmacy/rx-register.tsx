import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
// M20 — DS search pill + row stagger.
import { SearchField } from '../../../src/components/ui';
import { Rise } from '../../../src/theme/motion';
import { router, type Href } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { DateField } from '../../../src/components/DateField';
import { useDebouncedValue } from '../../../src/features/billing/useDebouncedValue';
import { ChipRow, EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { ActionRow, Banner, PillButton } from '../../../src/features/p1/ui';
import { exportRxRegister, pharmacyApi, pharmacyKeys, type RxExportFormat } from '../../../src/features/pharmacy/api';
import { PagerFooter } from '../../../src/features/pharmacy/components/PagerFooter';
import { RxEntryRow } from '../../../src/features/pharmacy/components/RxEntryRow';
import type { RxEntryStatus, RxSchedule } from '../../../src/features/pharmacy/types';

/**
 * The prescription register (Schedule H / H1 sales), read-only: from / to day,
 * schedule, status and a search (prescription no., entry no., patient name).
 * The register is never edited or deleted here — an entry is cancelled only by
 * cancelling its sale. Export (PDF / CSV, the H1 layout) takes the current
 * filters and opens the phone's share sheet.
 */
const PAGE = 30;
type Sched = 'ALL' | RxSchedule;
type Stat = 'ALL' | RxEntryStatus;

export default function RxRegisterScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { can } = usePartnerEntitlements();
  const allowed = can('RX_REGISTER', 'READ');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [schedule, setSchedule] = useState<Sched>('ALL');
  const [status, setStatus] = useState<Stat>('ALL');
  const [q, setQ] = useState('');
  const search = useDebouncedValue(q.trim(), 300);
  const badRange = !!from && !!to && from > to;

  const params = {
    from: from || undefined,
    to: to || undefined,
    schedule: schedule === 'ALL' ? undefined : schedule,
    status: status === 'ALL' ? undefined : status,
    q: search || undefined,
  };
  const list = useInfiniteQuery({
    queryKey: pharmacyKeys.rx(params),
    queryFn: ({ pageParam }) => pharmacyApi.rxRegister({ ...params, page: pageParam, limit: PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    enabled: allowed && !badRange,
  });
  const [exporting, setExporting] = useState<RxExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const runExport = async (format: RxExportFormat) => {
    if (exporting) return;
    setExportError(null);
    setExporting(format);
    try {
      await exportRxRegister(params, format);
    } catch (e) {
      setExportError(apiErrorMessage(e, t('p2.pharmacy.register.export.failed')));
    } finally {
      setExporting(null);
    }
  };
  const rows = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.data), [list.data]);
  const total = list.data?.pages[list.data.pages.length - 1]?.total ?? 0;

  const header = (
    <View style={styles.header}>
      <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>{t('p2.pharmacy.register.readOnly')}</Text>
      <View style={styles.dates}>
        <View style={styles.date}><DateField label={t('p2.common.from')} value={from} onChangeText={setFrom} maximumDate={new Date()} /></View>
        <View style={styles.date}><DateField label={t('p2.common.to')} value={to} onChangeText={setTo} maximumDate={new Date()} /></View>
      </View>
      {badRange ? <Banner c={c} tone="warn" body={t('p2.pharmacy.register.badRange')} /> : null}
      <SearchField
        placeholder={t('p2.pharmacy.register.search')}
        value={q}
        onChangeText={(s) => setQ(s.slice(0, 40))}
        testID="rx-search"
      />
      <ChipRow<Sched>
        c={c}
        value={schedule}
        options={(['ALL', 'H', 'H1'] as Sched[]).map((k) => ({ key: k, label: t(`p2.pharmacy.register.schedule.${k}`) }))}
        onChange={setSchedule}
      />
      <ChipRow<Stat>
        c={c}
        value={status}
        options={(['ALL', 'ACTIVE', 'CANCELLED'] as Stat[]).map((k) => ({ key: k, label: t(`p2.pharmacy.register.status.${k}`) }))}
        onChange={setStatus}
      />
      <ActionRow>
        <PillButton
          c={c}
          tone="outline"
          icon="file-pdf-box"
          label={exporting === 'pdf' ? t('p2.pharmacy.register.export.working') : t('p2.pharmacy.register.export.pdf')}
          onPress={() => void runExport('pdf')}
          disabled={!!exporting || badRange}
          testID="rx-export-pdf"
        />
        <PillButton
          c={c}
          tone="outline"
          icon="file-delimited-outline"
          label={exporting === 'csv' ? t('p2.pharmacy.register.export.working') : t('p2.pharmacy.register.export.csv')}
          onPress={() => void runExport('csv')}
          disabled={!!exporting || badRange}
          testID="rx-export-csv"
        />
      </ActionRow>
      {exportError ? <View testID="rx-export-error"><Banner c={c} tone="error" body={exportError} /></View> : null}
    </View>
  );

  return (
    <Screen c={c} title={t('p2.pharmacy.register.title')} subtitle={t('p2.pharmacy.register.subtitle')} scroll={false}>
      <FlatList
        data={list.isPending || badRange || (list.isError && rows.length === 0) ? [] : rows}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        renderItem={({ item, index }) => {
          const row = <RxEntryRow c={c} row={item} onPress={() => router.push(`/pharmacy/rx/${item.id}` as Href)} />;
          return index < 8 ? <Rise index={Math.min(index, 5) + 1} distance={10}>{row}</Rise> : row;
        }}
        initialNumToRender={10}
        windowSize={9}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={styles.list}
        onRefresh={() => void list.refetch()}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        ListEmptyComponent={
          badRange ? null
            : list.isPending ? <Loading c={c} skeleton={3} />
              : list.isError ? <ErrorBlock c={c} message={apiErrorMessage(list.error, t('p2.pharmacy.register.loadFailed'))} onRetry={() => list.refetch()} />
                : <EmptyBlock c={c} icon="notebook-outline" title={t('p2.pharmacy.register.empty')} body={t('p2.pharmacy.register.emptyBody')} />
        }
        ListFooterComponent={(
          <PagerFooter
            c={c}
            shown={rows.length}
            total={total}
            hasMore={!!list.hasNextPage}
            loading={list.isFetchingNextPage}
            onMore={() => void list.fetchNextPage()}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 10, paddingBottom: 12 },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  date: { flexGrow: 1, flexBasis: 140, minWidth: 140 },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
});
