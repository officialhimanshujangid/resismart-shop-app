import React, { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { EmptyBlock, ErrorBlock, Screen } from '../../../src/features/more/ui';
import { Rise, tapHaptic } from '../../../src/theme/motion';
import { SkeletonList } from '../../../src/components/ui';
import { ActionRow, Banner, PillButton } from '../../../src/features/p1/ui';
import { ChoiceChips, DayStepper } from '../../../src/features/p2/ui';
import { istToday } from '../../../src/features/p2/dates';
import { useModuleSettings } from '../../../src/features/p2/useCategoryModules';
import { subKeys, subscriptionsApi } from '../../../src/features/subscriptions/api';
import { allPresent, attendanceEntries, clampDay, markMinDay } from '../../../src/features/subscriptions/logic';
import type { AttendanceStatus } from '../../../src/features/subscriptions/types';
import { AttendanceRow } from '../../../src/features/subscriptions/components/AttendanceRow';

/**
 * Mark attendance (tuition). Pick the day and the class (a BATCH route; none =
 * every tuition student), tap Present / Absent / Leave per student or "All
 * present", then Save. Needs ATTENDANCE_MARK to save; attendance never changes a
 * bill (tuition is a fixed monthly fee).
 */
export default function AttendanceScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const params = useLocalSearchParams<{ batchId?: string; day?: string }>();
  const { can } = usePartnerEntitlements();
  const canMark = can('ATTENDANCE_MARK', 'FULL');
  const { settings } = useModuleSettings();
  const today = istToday();
  const minDay = markMinDay(today, settings.subscriptions.markBackDays);
  const [day, setDay] = useState(() => clampDay(params.day, minDay, today));
  const [batchId, setBatchId] = useState<string>(typeof params.batchId === 'string' ? params.batchId : '');
  const [chosen, setChosen] = useState<Record<string, AttendanceStatus>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<{ key: string; body: string } | null>(null);
  const qc = useQueryClient();

  const routes = useQuery({ queryKey: subKeys.routes(), queryFn: subscriptionsApi.routes });
  const classes = (routes.data ?? []).filter((r) => r.kind === 'BATCH' && r.isActive);
  const sheet = useQuery({
    queryKey: subKeys.attendance(day, batchId),
    queryFn: () => subscriptionsApi.attendanceSheet(day, batchId || undefined),
  });
  const rows = sheet.data?.rows ?? [];

  // What the server holds is the starting point; a new day / class starts again.
  useEffect(() => {
    const next: Record<string, AttendanceStatus> = {};
    for (const r of sheet.data?.rows ?? []) if (r.status) next[r.subscriptionId] = r.status;
    setChosen(next);
    setError(null);
  }, [sheet.data]);

  const entries = attendanceEntries(rows, chosen);
  const save = useMutation({
    mutationFn: () => {
      const body = { day, ...(batchId ? { batchId } : {}), entries };
      const text = JSON.stringify(body);
      // One key per decision; the same body retried keeps it (a changed body is a new request).
      if (!keyRef.current || keyRef.current.body !== text) keyRef.current = { key: newIdempotencyKey('attendance'), body: text };
      return subscriptionsApi.markAttendance(body, keyRef.current.key);
    },
    onSuccess: (r) => {
      keyRef.current = null;
      setError(null);
      setToast(t('p2.subscriptions.attendance.saved', { count: r?.saved ?? entries.length }));
      void qc.invalidateQueries({ queryKey: ['p2', 'subscriptions', 'attendance'] });
    },
    onError: (e) => setError(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });

  const header = (
    <View style={styles.header}>
      <DayStepper c={c} day={day} onChange={setDay} min={minDay} max={today} testID="attendance-day" />
      {classes.length > 0 ? (
        <ChoiceChips
          c={c}
          testID="class-chips"
          options={[{ key: '', label: t('p2.subscriptions.attendance.allClasses') }, ...classes.map((r) => ({ key: r._id, label: r.name }))]}
          value={[batchId]}
          onChange={(v) => setBatchId(v[0] ?? '')}
        />
      ) : null}
      {!canMark ? <Banner c={c} body={t('p2.subscriptions.attendance.viewOnly')} /> : null}
      {error ? <Banner c={c} tone="error" body={error} testID="attendance-error" /> : null}
      {canMark && rows.some((r) => r.classDay) ? (
        <ActionRow>
          <PillButton c={c} tone="outline" icon="account-check" label={t('p2.subscriptions.attendance.allPresent')}
            onPress={() => { tapHaptic(); setChosen((cur) => allPresent(rows, cur)); }} testID="all-present" />
        </ActionRow>
      ) : null}
    </View>
  );

  // M10: the sheet's shape while it loads, not a lone spinner.
  const rowOf = (item: (typeof rows)[number]) => (
    <AttendanceRow c={c} row={item} value={chosen[item.subscriptionId]} disabled={!canMark}
      onChange={(s) => setChosen((cur) => ({ ...cur, [item.subscriptionId]: s }))} />
  );

  const empty = sheet.isPending ? <SkeletonList rows={4} testID="attendance-loading" />
    : sheet.isError ? (
      <ErrorBlock c={c} message={apiErrorMessage(sheet.error, t('p2.common.loadFailed'))} onRetry={() => void sheet.refetch()} />
    ) : <EmptyBlock c={c} icon="school-outline" title={t('p2.subscriptions.attendance.empty')} />;

  return (
    <Screen
      c={c}
      title={t('p2.subscriptions.attendance.title')}
      scroll={false}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3000}>{toast}</Snackbar>}
    >
      <FlatList
        data={rows}
        keyExtractor={(r) => r.subscriptionId}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={Gap}
        contentContainerStyle={styles.list}
        initialNumToRender={10}
        renderItem={({ item, index }) => (
          // M10: the first rows rise in on open; rows drawn later on scroll appear plainly.
          index < 6 ? (
            <Rise index={index}>{rowOf(item)}</Rise>
          ) : rowOf(item)
        )}
      />
      {canMark && rows.length > 0 ? (
        <View style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
          <Text style={{ flex: 1, minWidth: 0, color: c.textSecondary, fontSize: 13 }} numberOfLines={2}>
            {t('p2.subscriptions.attendance.changed', { count: entries.length })}
          </Text>
          <PillButton c={c} icon="content-save" label={save.isPending ? t('common.saving') : t('common.save')}
            onPress={() => { tapHaptic(); save.mutate(); }} disabled={save.isPending || entries.length === 0} testID="attendance-save" />
        </View>
      ) : null}
    </Screen>
  );
}

function Gap() { return <View style={{ height: 10 }} />; }

const styles = StyleSheet.create({
  header: { gap: 10, marginBottom: 10 },
  list: { padding: 12, paddingBottom: 24 },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
