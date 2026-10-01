import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../constants/colors';
import { usePartnerEntitlements } from '../../hooks';
import { ActionRow, PillButton } from './ui';

/**
 * The P1 quick actions on Today: add an expense (the 3-tap quick add, "from
 * home" per screen S20), khata dues, and closing the day. Each only for a
 * person who may do it; nothing is drawn when none apply.
 */
export function TodayShortcuts({ c }: { c: ColorScheme }) {
  const { t } = useTranslation();
  const { can, hasModule } = usePartnerEntitlements();
  if (!hasModule('INVOICING')) return null;
  const expense = can('EXPENSES_MANAGE', 'FULL');
  const khata = can('CUSTOMERS', 'READ');
  const close = can('ACCOUNTS', 'READ') && can('INVOICING_MANAGE', 'FULL');
  if (!expense && !khata && !close) return null;
  return (
    <ActionRow>
      {expense && <PillButton c={c} icon="cash-minus" label={t('money.addExpense')} onPress={() => router.push('/money/expense')} testID="today-add-expense" />}
      {khata && <PillButton c={c} tone="outline" icon="notebook-outline" label={t('more.rows.khata')} onPress={() => router.push('/khata')} />}
      {close && <PillButton c={c} tone="outline" icon="lock-check-outline" label={t('money.dayClose')} onPress={() => router.push('/money/day-close')} />}
    </ActionRow>
  );
}
