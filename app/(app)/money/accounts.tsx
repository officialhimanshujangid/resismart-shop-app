import React, { useState } from 'react';
import { Alert, useColorScheme, View } from 'react-native';
import { Button, Dialog, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { moneyApi, MoneyAccount } from '../../../src/features/money/api';
import { AccountCard } from '../../../src/features/money/components/AccountCard';
import { EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { ActionRow, PillButton } from '../../../src/features/p1/ui';

/**
 * FPB P5 (2026-10-31) — Cash & bank accounts, managed on the phone as on the web
 * (`partner/money/accounts`): ACCOUNTS reads; changing anything is a settings
 * change (SETTINGS FULL). Per account: open its book, rename (and the bank's
 * last 4 / UPI id), make it the default, switch it off / on, delete. The server
 * keeps the rules (one default per kind — MONEY_ACCOUNT_IS_DEFAULT; an account
 * with entries cannot be deleted — MONEY_ACCOUNT_IN_USE); its sentence is shown.
 * New accounts are still added from Money home.
 */
export default function MoneyAccountsScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const mayRead = can('ACCOUNTS', 'READ');
  const mayChange = can('SETTINGS', 'FULL');
  const [picked, setPicked] = useState<MoneyAccount | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [last4, setLast4] = useState('');
  const [upi, setUpi] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const accounts = useQuery({ queryKey: qk.money.accounts(), queryFn: moneyApi.accounts, enabled: mayRead });

  const done = (msg: string) => {
    setPicked(null); setEditing(false); setToast(msg);
    void queryClient.invalidateQueries({ queryKey: qk.money.all() });
  };
  const fail = (e: unknown) => setToast(apiErrorMessage(e, t('money.accounts.failed')));

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof moneyApi.updateAccount>[1]; msg: string }) => moneyApi.updateAccount(id, body),
    onSuccess: (_r, v) => done(v.msg),
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => moneyApi.deleteAccount(id),
    onSuccess: () => done(t('money.accounts.deleted')),
    onError: fail,
  });
  const busy = update.isPending || remove.isPending;

  const openEdit = (a: MoneyAccount) => { setName(a.name); setLast4(a.bankLast4 ?? ''); setUpi(a.upiId ?? ''); setEditing(true); };
  const last4Bad = last4.trim() !== '' && !/^\d{4}$/.test(last4.trim());
  const askDelete = (a: MoneyAccount) => Alert.alert(
    t('money.accounts.deleteTitle'),
    t('money.accounts.deleteMessage', { name: a.name }),
    [
      { text: t('money.accounts.keep'), style: 'cancel' },
      { text: t('money.accounts.delete'), style: 'destructive', onPress: () => remove.mutate(a._id) },
    ],
  );

  const sorted = [...(accounts.data ?? [])].sort((a, b) =>
    (a.kind === b.kind ? 0 : a.kind === 'CASH' ? -1 : 1)
    || (Number(b.isDefault) - Number(a.isDefault))
    || (Number(b.isActive) - Number(a.isActive))
    || a.name.localeCompare(b.name));

  return (
    <Screen c={c} rise title={t('money.accounts.title')} subtitle={mayChange ? t('money.accounts.intro') : t('money.accounts.introReadOnly')}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)}>{toast}</Snackbar>}>
      <View style={{ gap: 10 }} testID="money-accounts">
        {!mayRead ? (
          <EmptyBlock c={c} title={t('money.accounts.denied')} />
        ) : accounts.isPending ? (
          <Loading c={c} skeleton={4} />
        ) : accounts.isError ? (
          <ErrorBlock c={c} message={apiErrorMessage(accounts.error, t('money.loadFailed'))} onRetry={() => accounts.refetch()} />
        ) : sorted.length === 0 ? (
          <EmptyBlock c={c} title={t('money.accounts.empty')} />
        ) : (
          sorted.map((a) => (
            <AccountCard key={a._id} c={c} account={a}
              onPress={() => (mayChange ? setPicked(a) : router.push({ pathname: '/money/cash-book', params: { accountId: a._id } }))} />
          ))
        )}
      </View>

      <Portal>
        {/* What to do with one account. */}
        <Dialog visible={!!picked && !editing} onDismiss={() => setPicked(null)} style={{ backgroundColor: c.surface }}>
          <Dialog.Title numberOfLines={2}>{picked?.name}</Dialog.Title>
          <Dialog.Content>
            <ActionRow>
              <PillButton c={c} tone="outline" icon="book-open-variant" label={t('money.cashBook')} testID="account-open-book"
                onPress={() => { const id = picked?._id; setPicked(null); if (id) router.push({ pathname: '/money/cash-book', params: { accountId: id } }); }} />
              <PillButton c={c} tone="outline" icon="pencil-outline" label={t('money.accounts.edit')} testID="account-edit"
                onPress={() => picked && openEdit(picked)} disabled={busy} />
              {picked && !picked.isDefault && picked.isActive && (
                <PillButton c={c} tone="outline" icon="star-outline" label={t('money.accounts.makeDefault')} testID="account-make-default" disabled={busy}
                  onPress={() => update.mutate({ id: picked._id, body: { isDefault: true }, msg: t('money.accounts.madeDefault', { name: picked.name }) })} />
              )}
              {picked && (
                <PillButton c={c} tone="outline" icon={picked.isActive ? 'toggle-switch-off-outline' : 'toggle-switch-outline'} testID="account-toggle" disabled={busy}
                  label={picked.isActive ? t('money.accounts.switchOff') : t('money.accounts.switchOn')}
                  onPress={() => update.mutate({ id: picked._id, body: { isActive: !picked.isActive }, msg: picked.isActive ? t('money.accounts.switchedOff') : t('money.accounts.switchedOn') })} />
              )}
              {picked && (
                <PillButton c={c} tone="outline" icon="trash-can-outline" label={t('money.accounts.delete')} testID="account-delete" disabled={busy}
                  onPress={() => askDelete(picked)} />
              )}
            </ActionRow>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPicked(null)}>{t('common.cancel')}</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Rename (and the bank's last 4 / UPI id). */}
        <Dialog visible={!!picked && editing} onDismiss={() => setEditing(false)} style={{ backgroundColor: c.surface }}>
          <Dialog.Title>{t('money.accounts.edit')}</Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <TextInput mode="outlined" label={t('money.accountName')} value={name} onChangeText={(v) => setName(v.slice(0, 60))} outlineStyle={{ borderRadius: radii.field }} testID="account-name" />
            {picked?.kind === 'BANK' && (
              <>
                <TextInput mode="outlined" label={t('money.accounts.last4')} value={last4} onChangeText={(v) => setLast4(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" outlineStyle={{ borderRadius: radii.field }} error={last4Bad} />
                <TextInput mode="outlined" label={t('money.accounts.upiId')} value={upi} onChangeText={(v) => setUpi(v.trim().slice(0, 80))} autoCapitalize="none" outlineStyle={{ borderRadius: radii.field }} />
              </>
            )}
            {last4Bad ? <Text style={{ color: c.error, fontSize: 12 }}>{t('money.accounts.last4Bad')}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditing(false)}>{t('common.cancel')}</Button>
            <Button testID="account-save" loading={update.isPending} disabled={!name.trim() || last4Bad || busy}
              onPress={() => picked && update.mutate({
                id: picked._id,
                body: picked.kind === 'BANK' ? { name: name.trim(), bankLast4: last4.trim() || null, upiId: upi.trim() || null } : { name: name.trim() },
                msg: t('money.accounts.saved'),
              })}>
              {t('common.save')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}
