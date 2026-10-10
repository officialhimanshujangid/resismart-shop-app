import React, { useState } from 'react';
import { Alert, StyleSheet, TextInput as RNTextInput, useColorScheme, View } from 'react-native';
import { Snackbar, Text, TextInput } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { formatPaise, parseRupeesToPaise } from '../../../src/lib/money';
import { DateField } from '../../../src/components/DateField';
import { moneyApi } from '../../../src/features/money/api';
import { cashVariance, DENOMINATIONS, sumDenominations } from '../../../src/features/money/logic';
import { DaySummaryCard } from '../../../src/features/money/components/DaySummaryCard';
import { Card, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { ActionRow, Banner, PillButton, StatGrid, StatTile, TwoPane } from '../../../src/features/p1/ui';
import { ReasonDialog } from '../../../src/features/p1/ReasonDialog';
import { SuccessCheck } from '../../../src/components/ui';
import { todayYmd } from '../../../src/features/p1/dates';

/**
 * Day summary + day close (screen S22): the day's sales, collections and
 * expenses, then count the cash drawer (type the total or count notes) and
 * close — the difference is recorded. A closed day locks entries on that date
 * for everyone but the owner; only the owner may reopen it.
 */
export default function DayCloseScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const { can, entitlements } = usePartnerEntitlements();
  const canClose = can('INVOICING_MANAGE', 'FULL');
  const isOwner = entitlements.isAdmin;
  const [day, setDay] = useState(todayYmd());
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState<Partial<Record<number, number>>>({});
  const [useNotes, setUseNotes] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const summary = useQuery({ queryKey: qk.money.daySummary(day), queryFn: () => moneyApi.daySummary({ date: day }) });
  const s = summary.data;
  const countedPaise = useNotes ? sumDenominations(notes) : parseRupeesToPaise(counted);
  const variance = s && countedPaise !== null ? cashVariance(s.cash.expectedPaise, countedPaise) : null;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.money.all() });
  const close = useMutation({
    mutationFn: () => moneyApi.closeDay({ date: day, countedCashPaise: countedPaise ?? 0, note: note.trim() || undefined }),
    onSuccess: () => {
      invalidate(); setToast(t('money.day.closedToast'));
      // M21: the success moment (springs in; nothing moves under reduce-motion).
      setCelebrate(true); setTimeout(() => setCelebrate(false), 1600);
    },
    onError: (e) => setToast(apiErrorMessage(e, t('money.day.closeFailed'))),
  });
  const reopen = useMutation({
    mutationFn: (reason: string) => moneyApi.reopenDay(s!.closed!.id, reason),
    onSuccess: () => { setReopenOpen(false); invalidate(); },
    onError: (e) => setToast(apiErrorMessage(e, t('money.day.closeFailed'))),
  });

  const confirmClose = () => {
    if (countedPaise === null || !s) return;
    Alert.alert(
      t('money.day.confirmTitle'),
      t('money.day.confirmBody', { counted: formatPaise(countedPaise), expected: formatPaise(s.cash.expectedPaise) }),
      [{ text: t('common.cancel'), style: 'cancel' }, { text: t('money.day.close'), onPress: () => close.mutate() }],
    );
  };

  const left = (
    <View style={{ gap: 10 }}>
      <DateField label={t('money.day.date')} value={day} onChangeText={setDay} mode="date" maximumDate={new Date()} />
      {summary.isPending ? <Loading c={c} skeleton={4} /> : summary.isError || !s ? (
        <ErrorBlock c={c} message={apiErrorMessage(summary.error, t('money.loadFailed'))} onRetry={() => summary.refetch()} />
      ) : <DaySummaryCard c={c} s={s} />}
    </View>
  );

  const right = s ? (
    <View style={{ gap: 10 }}>
      {s.closed ? (
        <>
          <Banner
            c={c}
            title={t('money.day.closedTitle')}
            body={t('money.day.closedBody', {
              counted: formatPaise(s.closed.countedCashPaise),
              variance: formatPaise(s.closed.variancePaise),
              name: s.closed.closedByName ?? '—',
            })}
            testID="day-closed"
          />
          {isOwner && (
            <ActionRow>
              <PillButton c={c} tone="outline" icon="lock-open-variant-outline" label={t('money.day.reopen')} onPress={() => setReopenOpen(true)} />
            </ActionRow>
          )}
        </>
      ) : canClose ? (
        <Card c={c}>
          <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{t('money.day.countTitle')}</Text>
          <ActionRow>
            <PillButton c={c} tone={useNotes ? 'outline' : 'primary'} label={t('money.day.typeTotal')} onPress={() => setUseNotes(false)} />
            <PillButton c={c} tone={useNotes ? 'primary' : 'outline'} label={t('money.day.countNotes')} onPress={() => setUseNotes(true)} />
          </ActionRow>
          {useNotes ? (
            <View style={styles.notes}>
              {DENOMINATIONS.map((d) => (
                <View key={d} style={styles.noteCell}>
                  <Text style={{ color: c.textSecondary, width: 52 }}>₹{d} ×</Text>
                  <RNTextInput
                    value={notes[d] ? String(notes[d]) : ''}
                    onChangeText={(v) => setNotes((n) => ({ ...n, [d]: Number(v.replace(/\D/g, '')) || 0 }))}
                    keyboardType="number-pad"
                    accessibilityLabel={`₹${d}`}
                    style={[styles.noteInput, { color: c.textPrimary, borderColor: c.divider }]}
                  />
                </View>
              ))}
            </View>
          ) : (
            <TextInput
              mode="outlined"
              label={t('money.day.counted')}
              value={counted}
              onChangeText={setCounted}
              keyboardType="decimal-pad"
              outlineStyle={{ borderRadius: radii.field }}
              testID="day-counted"
            />
          )}
          <StatGrid>
            <StatTile c={c} label={t('money.day.expected')} value={formatPaise(s.cash.expectedPaise)} />
            <StatTile c={c} label={t('money.day.counted')} value={countedPaise !== null ? formatPaise(countedPaise) : '—'} />
            <StatTile
              c={c}
              label={t('money.day.variance')}
              value={variance !== null ? formatPaise(variance) : '—'}
              tone={variance === null || variance === 0 ? undefined : variance < 0 ? c.error : c.warning}
              testID="day-variance"
            />
          </StatGrid>
          <TextInput mode="outlined" label={t('money.day.note')} value={note} onChangeText={(v) => setNote(v.slice(0, 300))} outlineStyle={{ borderRadius: radii.field }} />
          <ActionRow>
            <PillButton c={c} icon="lock-check-outline" label={close.isPending ? t('p1.saving') : t('money.day.close')} disabled={countedPaise === null || close.isPending} onPress={confirmClose} testID="day-close" />
          </ActionRow>
        </Card>
      ) : null}
    </View>
  ) : undefined;

  return (
    <Screen c={c} rise title={t('money.dayClose')} floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3500}>{toast}</Snackbar>}>
      {celebrate ? <SuccessCheck size={72} testID="day-closed-check" /> : null}
      <TwoPane left={left} right={right} />
      <ReasonDialog
        visible={reopenOpen}
        title={t('money.day.reopenTitle')}
        body={t('money.day.reopenBody')}
        confirmLabel={t('money.day.reopen')}
        submitting={reopen.isPending}
        onCancel={() => setReopenOpen(false)}
        onSubmit={(r) => reopen.mutate(r)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  notes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  noteCell: { flexDirection: 'row', alignItems: 'center', gap: 6, flexBasis: 140, flexGrow: 1 },
  noteInput: { flex: 1, minWidth: 56, height: 44, borderWidth: 1, borderRadius: radii.sm, textAlign: 'center', fontSize: 16 },
});
