import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { qk } from '../../../lib/queryKeys';
import { usePartnerEntitlements } from '../../../hooks';
import { ChipRow } from '../../more/ui';
import { moneyApi } from '../api';

/**
 * Which cash drawer or bank a payment lands in (CONTRACT-partner-P1 §8,
 * `accountId?` on `POST /payments`). Optional: `''` means "let the server
 * choose" — the default CASH account for a cash payment, the default BANK one
 * otherwise. Drawn only when the shop has MORE than one active account and the
 * person may read accounts; with one account there is nothing to choose.
 */
export function AccountPicker({
  c, value, onChange,
}: { c: ColorScheme; value: string; onChange: (accountId: string) => void }) {
  const { t } = useTranslation();
  const { can } = usePartnerEntitlements();
  const allowed = can('ACCOUNTS', 'READ');
  const accounts = useQuery({ queryKey: qk.money.accounts(), queryFn: moneyApi.accounts, enabled: allowed, staleTime: 60_000 });
  const active = (accounts.data ?? []).filter((a) => a.isActive);
  if (!allowed || active.length <= 1) return null;
  return (
    <View style={{ gap: 6 }} testID="account-picker">
      <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>{t('money.picker.label')}</Text>
      <ChipRow
        c={c}
        value={value || 'DEFAULT'}
        options={[{ key: 'DEFAULT', label: t('money.picker.default') }, ...active.map((a) => ({ key: a._id, label: a.name }))]}
        onChange={(k) => onChange(k === 'DEFAULT' ? '' : k)}
      />
    </View>
  );
}
