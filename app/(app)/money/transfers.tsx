import React, { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text, TextInput } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { formatPaise, parseRupeesToPaise } from '../../../src/lib/money';
import { formatI18nDate } from '../../../src/i18n';
import { DateField } from '../../../src/components/DateField';
import { moneyApi, MoneyTransfer } from '../../../src/features/money/api';
import { Card, ChipRow, EmptyBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { ActionRow, Banner, PillButton, TwoPane } from '../../../src/features/p1/ui';
import { ReasonDialog } from '../../../src/features/p1/ReasonDialog';
import { isoOfDay, todayYmd } from '../../../src/features/p1/dates';

/**
 * Move money between the cash drawer and a bank (screen S20) — a deposit, a
 * withdrawal. One form, the list below it; cancelling needs DOCUMENTS_VOID.
 */
export default function TransfersScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const canMove = can('ACCOUNTS', 'READ') && can('INVOICING_MANAGE', 'FULL');
  const canVoid = can('DOCUMENTS_VOID', 'FULL');

  const accounts = useQuery({ queryKey: qk.money.accounts(), queryFn: moneyApi.accounts });
  const list = useQuery({ queryKey: qk.money.transfers(), queryFn: () => moneyApi.transfers({ limit: 50 }) });
  const active = (accounts.data ?? []).filter((a) => a.isActive);
  const nameOf = (id: string) => accounts.data?.find((a) => a._id === id)?.name ?? '—';

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(todayYmd());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MoneyTransfer | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.money.all() });
  const create = useMutation({
    mutationFn: () => moneyApi.createTransfer({
      date: isoOfDay(day) as string, fromAccountId: fromId, toAccountId: toId,
      amountPaise: parseRupeesToPaise(amount) ?? 0, note: note.trim() || undefined,
    }),
    onSuccess: () => { setAmount(''); setNote(''); setError(null); invalidate(); setToast(t('money.transfer.saved')); },
    onError: (e) => setError(apiErrorMessage(e, t('money.transfer.failed'))),
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => moneyApi.cancelTransfer(cancelTarget!._id, reason),
    onSuccess: () => { setCancelTarget(null); invalidate(); },
    onError: (e) => setToast(apiErrorMessage(e, t('money.transfer.failed'))),
  });

  const submit = () => {
    const paise = parseRupeesToPaise(amount);
    if (!fromId || !toId) { setError(t('money.transfer.pickBoth')); return; }
    if (fromId === toId) { setError(t('errors.MONEY_TRANSFER_SAME_ACCOUNT')); return; }
    if (paise === null || paise <= 0) { setError(t('money.expense.error.amount')); return; }
    create.mutate();
  };

  const accountChips = active.map((a) => ({ key: a._id, label: a.name }));
  const form = canMove ? (
    <Card c={c}>
      <Text style={[styles.title, { color: c.textPrimary }]}>{t('money.moveMoney')}</Text>
      <Text style={[styles.label, { color: c.textSecondary }]}>{t('money.transfer.from')}</Text>
      <ChipRow c={c} value={fromId} options={accountChips} onChange={setFromId} />
      <Text style={[styles.label, { color: c.textSecondary }]}>{t('money.transfer.to')}</Text>
      <ChipRow c={c} value={toId} options={accountChips} onChange={setToId} />
      <TextInput mode="outlined" label={t('money.expense.amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" outlineStyle={{ borderRadius: radii.field }} testID="transfer-amount" />
      <DateField label={t('money.expense.date')} value={day} onChangeText={setDay} mode="date" maximumDate={new Date()} />
      <TextInput mode="outlined" label={t('money.transfer.note')} value={note} onChangeText={(v) => setNote(v.slice(0, 300))} outlineStyle={{ borderRadius: radii.field }} />
      {error ? <Banner c={c} tone="error" body={error} testID="transfer-error" /> : null}
      <ActionRow>
        <PillButton c={c} icon="swap-horizontal" label={create.isPending ? t('p1.saving') : t('money.transfer.save')} disabled={create.isPending} onPress={submit} testID="transfer-save" />
      </ActionRow>
    </Card>
  ) : undefined;

  const history = (
    <View style={{ gap: 8 }}>
      <SectionLabel c={c}>{t('money.transfers')}</SectionLabel>
      {list.isPending ? <Loading c={c} /> : (list.data?.data ?? []).length === 0 ? (
        <EmptyBlock c={c} icon="swap-horizontal" title={t('money.transfer.empty')} />
      ) : (list.data?.data ?? []).map((tr) => {
        const off = tr.status === 'CANCELLED';
        return (
          <View key={tr._id} style={[styles.row, { backgroundColor: c.surface, opacity: off ? 0.6 : 1 }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>
                {t('money.transfer.line', { from: nameOf(tr.fromAccountId), to: nameOf(tr.toAccountId) })}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
                {formatI18nDate(tr.date, t)}{tr.note ? ` · ${tr.note}` : ''}{off ? ` · ${t('money.expense.cancelled')}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{formatPaise(tr.amountPaise)}</Text>
              {canVoid && !off ? (
                <Text onPress={() => setCancelTarget(tr)} style={{ color: c.error, fontWeight: '600', paddingVertical: 6 }} accessibilityRole="button">
                  {t('money.expense.cancel')}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );

  return (
    <Screen c={c} title={t('money.transfers')} floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3000}>{toast}</Snackbar>}>
      <TwoPane left={form ?? history} right={form ? history : undefined} />
      <ReasonDialog
        visible={!!cancelTarget}
        title={t('money.transfer.cancelTitle')}
        confirmLabel={t('money.expense.cancel')}
        submitting={cancel.isPending}
        onCancel={() => setCancelTarget(null)}
        onSubmit={(r) => cancel.mutate(r)}
        danger
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radii.card, padding: 14, minHeight: 60 },
});
