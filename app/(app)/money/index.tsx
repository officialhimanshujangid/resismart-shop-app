import React, { useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { Button, Dialog, Portal, Snackbar, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { parseRupeesToPaise } from '../../../src/lib/money';
import { moneyApi } from '../../../src/features/money/api';
import { AccountCard } from '../../../src/features/money/components/AccountCard';
import { Card, ChipRow, ErrorBlock, Loading, Row, Screen, SectionLabel } from '../../../src/features/more/ui';
import { ActionRow, PillButton, TwoPane } from '../../../src/features/p1/ui';

/**
 * Money home (screen S20): the cash drawer and bank accounts with their
 * balances, and the ways in — add an expense (the 3-tap quick add), move money,
 * the cash book, closing the day, expenses and P&L. Every row follows its own
 * permission; an accountant (read-only) sees books and reports, no buttons.
 */
export default function MoneyHomeScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const canAccounts = can('ACCOUNTS', 'READ');
  const canAddExpense = can('EXPENSES_MANAGE', 'FULL');
  const canTransfer = canAccounts && can('INVOICING_MANAGE', 'FULL');
  const canSettings = can('SETTINGS', 'FULL');
  const [addOpen, setAddOpen] = useState(false);
  const [kind, setKind] = useState<'CASH' | 'BANK'>('BANK');
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const accounts = useQuery({ queryKey: qk.money.accounts(), queryFn: moneyApi.accounts, enabled: canAccounts });

  const addAccount = useMutation({
    mutationFn: () => moneyApi.createAccount({ kind, name: name.trim(), openingBalancePaise: parseRupeesToPaise(opening || '0') ?? 0 }),
    onSuccess: () => { setAddOpen(false); setName(''); setOpening(''); void queryClient.invalidateQueries({ queryKey: qk.money.all() }); },
    onError: (e) => setToast(apiErrorMessage(e, t('money.accountFailed'))),
  });

  const left = (
    <View style={{ gap: 10 }}>
      {canAddExpense && (
        <ActionRow>
          <PillButton c={c} icon="cash-minus" label={t('money.addExpense')} onPress={() => router.push('/money/expense')} testID="money-add-expense" />
          {canTransfer && <PillButton c={c} tone="outline" icon="swap-horizontal" label={t('money.moveMoney')} onPress={() => router.push('/money/transfers')} />}
        </ActionRow>
      )}
      {canAccounts && (
        <>
          <SectionLabel c={c}>{t('money.accountsSection')}</SectionLabel>
          {accounts.isPending ? (
            <Loading c={c} />
          ) : accounts.isError ? (
            <ErrorBlock c={c} message={apiErrorMessage(accounts.error, t('money.loadFailed'))} onRetry={() => accounts.refetch()} />
          ) : (
            (accounts.data ?? []).map((a) => (
              <AccountCard key={a._id} c={c} account={a} onPress={() => router.push({ pathname: '/money/cash-book', params: { accountId: a._id } })} />
            ))
          )}
          {canSettings && (
            <ActionRow>
              <PillButton c={c} tone="outline" icon="plus" label={t('money.addAccount')} onPress={() => setAddOpen(true)} />
            </ActionRow>
          )}
        </>
      )}
    </View>
  );

  const right = (
    <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
      {canAccounts && <Row c={c} icon="book-open-variant" title={t('money.cashBook')} subtitle={t('money.cashBookSub')} onPress={() => router.push('/money/cash-book')} />}
      {canAccounts && <Row c={c} icon="calendar-check-outline" title={t('money.dayClose')} subtitle={t('money.dayCloseSub')} onPress={() => router.push('/money/day-close')} />}
      {(can('EXPENSES_VIEW', 'READ') || canAddExpense) && <Row c={c} icon="receipt" title={t('money.expenses')} subtitle={t('money.expensesSub')} onPress={() => router.push('/money/expenses')} />}
      {canAccounts && <Row c={c} icon="swap-horizontal" title={t('money.transfers')} subtitle={t('money.transfersSub')} onPress={() => router.push('/money/transfers')} />}
      {can('COSTS', 'READ') && can('REPORTS', 'READ') && <Row c={c} icon="chart-box-outline" title={t('money.pnl')} subtitle={t('money.pnlSub')} onPress={() => router.push('/money/pnl')} />}
    </Card>
  );

  return (
    <Screen c={c} title={t('money.title')} subtitle={t('money.subtitle')} floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)}>{toast}</Snackbar>}>
      <TwoPane left={left} right={right} />
      <Portal>
        <Dialog visible={addOpen} onDismiss={() => setAddOpen(false)} style={{ backgroundColor: c.surface }}>
          <Dialog.Title>{t('money.addAccount')}</Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <ChipRow c={c} value={kind} options={[{ key: 'CASH', label: t('money.kind.CASH') }, { key: 'BANK', label: t('money.kind.BANK') }]} onChange={setKind} />
            <TextInput mode="outlined" label={t('money.accountName')} value={name} onChangeText={(v) => setName(v.slice(0, 60))} outlineStyle={{ borderRadius: radii.field }} />
            <TextInput mode="outlined" label={t('money.openingBalance')} value={opening} onChangeText={setOpening} keyboardType="decimal-pad" outlineStyle={{ borderRadius: radii.field }} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddOpen(false)}>{t('common.cancel')}</Button>
            <Button onPress={() => addAccount.mutate()} disabled={!name.trim() || addAccount.isPending} loading={addAccount.isPending}>{t('common.save')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}
