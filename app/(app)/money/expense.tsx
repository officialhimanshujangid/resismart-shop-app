import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput as RNTextInput, useColorScheme, View } from 'react-native';
import { Snackbar, Switch, Text, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { DateField } from '../../../src/components/DateField';
import { EXPENSE_MODES, moneyApi } from '../../../src/features/money/api';
import { buildExpenseBody, defaultAccountFor, ExpenseForm } from '../../../src/features/money/logic';
import { ChipRow, EmptyBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { ActionRow, Banner, PillButton } from '../../../src/features/p1/ui';
import { isoOfDay, todayYmd } from '../../../src/features/p1/dates';

/**
 * Expense quick-add (screen S20): three taps for the common case — pick a
 * category chip, type the amount, Save. What it was for is pre-filled from the
 * category (editable); the date is today; the mode is cash. GST details are
 * behind a switch for the bills that carry them (ITC for a registered shop).
 */
export default function ExpenseQuickAddScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const canAdd = can('EXPENSES_MANAGE', 'FULL');

  const categories = useQuery({ queryKey: qk.money.categories(), queryFn: moneyApi.categories });
  const accounts = useQuery({ queryKey: qk.money.accounts(), queryFn: moneyApi.accounts, enabled: can('ACCOUNTS', 'READ') });
  const cats = useMemo(() => (categories.data ?? []).filter((x) => x.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [categories.data]);

  const [f, setF] = useState<ExpenseForm>({
    day: todayYmd(), categoryId: '', description: '', amount: '', gst: '', supplierGstin: '', itcEligible: true, mode: 'CASH', reference: '',
  });
  const [descTouched, setDescTouched] = useState(false);
  const [withGst, setWithGst] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const set = (p: Partial<ExpenseForm>) => setF((cur) => ({ ...cur, ...p }));

  const intentKey = useRef<string | null>(null);
  useEffect(() => { intentKey.current = null; }, [f, withGst]);

  const account = defaultAccountFor(accounts.data ?? [], f.mode);

  const save = useMutation({
    mutationFn: () => {
      const res = buildExpenseBody({ ...f, gst: withGst ? f.gst : '', supplierGstin: withGst ? f.supplierGstin : '', accountId: account?._id }, isoOfDay);
      if (res.error) throw Object.assign(new Error(t(`money.expense.error.${res.error}`)), { formError: true });
      if (!intentKey.current) intentKey.current = newIdempotencyKey('exp');
      return moneyApi.createExpense(res.body!, intentKey.current);
    },
    onSuccess: (exp) => {
      void queryClient.invalidateQueries({ queryKey: qk.money.all() });
      setToast(t('money.expense.saved', { number: exp.number }));
      // Ready for the next one — the shop often has two or three at once.
      setF((cur) => ({ ...cur, categoryId: '', description: '', amount: '', gst: '', supplierGstin: '', reference: '' }));
      setDescTouched(false);
      setWithGst(false);
      setError(null);
    },
    onError: (e: Error) => {
      if ((e as Error & { formError?: boolean }).formError) setError(e.message);
      else setError(apiErrorMessage(e, t('money.expense.failed')));
    },
  });

  if (!canAdd) {
    return <Screen c={c} title={t('money.addExpense')}><EmptyBlock c={c} icon="lock-outline" title={t('money.noPermission')} /></Screen>;
  }

  return (
    <Screen
      c={c}
      rise
      title={t('money.addExpense')}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3000} action={{ label: t('money.expense.viewAll'), onPress: () => router.replace('/money/expenses') }}>{toast}</Snackbar>}
    >
      <SectionLabel c={c}>{t('money.expense.category')}</SectionLabel>
      {categories.isPending ? <Loading c={c} skeleton={4} /> : (
        <View style={styles.cats}>
          {cats.map((cat) => {
            const on = f.categoryId === cat._id;
            return (
              <Pressable
                key={cat._id}
                onPress={() => set({ categoryId: cat._id, ...(descTouched ? {} : { description: cat.name }) })}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[styles.cat, { backgroundColor: on ? c.primary : c.surface, borderColor: on ? c.primary : c.border }]}
                testID={`expense-cat-${cat._id}`}
              >
                <Text style={{ color: on ? c.textInverse : c.textPrimary, fontWeight: '600', fontSize: 14 }}>
                  {cat.systemKey ? t(`money.systemCategory.${cat.systemKey}`, { defaultValue: cat.name }) : cat.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={[styles.amountBox, { backgroundColor: c.surface, borderColor: c.divider }]}>
        <Text style={{ color: c.textSecondary, fontSize: 22, fontWeight: '700' }}>₹</Text>
        <RNTextInput
          value={f.amount}
          onChangeText={(amount) => set({ amount: amount.replace(/[^0-9.]/g, '') })}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={c.textDisabled}
          accessibilityLabel={t('money.expense.amount')}
          style={[styles.amountInput, { color: c.textPrimary }]}
          testID="expense-amount"
        />
      </View>

      <TextInput
        mode="outlined"
        label={t('money.expense.description')}
        value={f.description}
        onChangeText={(description) => { setDescTouched(true); set({ description: description.slice(0, 300) }); }}
        outlineStyle={{ borderRadius: radii.field }}
      />
      <Text style={[styles.label, { color: c.textSecondary }]}>{t('money.expense.paidBy')}</Text>
      <ChipRow c={c} value={f.mode} options={EXPENSE_MODES.map((m) => ({ key: m, label: t(`money.mode.${m}`) }))} onChange={(mode) => set({ mode })} />
      {account ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('money.expense.fromAccount', { name: account.name })}</Text> : null}
      <DateField label={t('money.expense.date')} value={f.day} onChangeText={(day) => set({ day })} mode="date" maximumDate={new Date()} />

      <View style={styles.switchRow}>
        <Text style={{ color: c.textPrimary, fontWeight: '600', flex: 1 }}>{t('money.expense.hasGst')}</Text>
        <Switch value={withGst} onValueChange={setWithGst} accessibilityLabel={t('money.expense.hasGst')} />
      </View>
      {withGst && (
        <View style={{ gap: 8 }}>
          <TextInput testID="expense-gst" mode="outlined" label={t('money.expense.gstAmount')} value={f.gst} onChangeText={(gst) => set({ gst })} keyboardType="decimal-pad" outlineStyle={{ borderRadius: radii.field }} />
          <TextInput mode="outlined" label={t('money.expense.supplierGstin')} value={f.supplierGstin} onChangeText={(v) => set({ supplierGstin: v.toUpperCase().slice(0, 15) })} autoCapitalize="characters" outlineStyle={{ borderRadius: radii.field }} />
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{t('purchases.bill.itc')}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('money.expense.itcHint')}</Text>
            </View>
            <Switch value={f.itcEligible} onValueChange={(itcEligible) => set({ itcEligible })} accessibilityLabel={t('purchases.bill.itc')} />
          </View>
        </View>
      )}
      <TextInput mode="outlined" label={t('money.expense.reference')} value={f.reference} onChangeText={(reference) => set({ reference: reference.slice(0, 80) })} outlineStyle={{ borderRadius: radii.field }} />

      {error ? <Banner c={c} tone="error" body={error} testID="expense-error" /> : null}
      <ActionRow>
        <PillButton c={c} icon="check" label={save.isPending ? t('p1.saving') : t('money.expense.save')} disabled={save.isPending} onPress={() => save.mutate()} testID="expense-save" />
      </ActionRow>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: { borderRadius: radii.pill, borderWidth: 1.5, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  amountBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.card, borderWidth: 1, paddingHorizontal: 16, minHeight: 64 },
  amountInput: { flex: 1, fontSize: 30, fontWeight: '700', paddingVertical: 8 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
});
