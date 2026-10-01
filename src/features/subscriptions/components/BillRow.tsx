import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { Pill } from '../../p2/ui';
import { PillButton } from '../../p1/ui';
import { monthLabel } from '../../p2/dates';
import { billTone, canRetryBill } from '../logic';
import type { BillStatus } from '../types';

export interface BillRowView {
  id: string;
  period: string;
  status: BillStatus;
  number?: string;
  amountPaise?: number;
  deliveredDays?: number;
  errorCode?: string;
  customerName?: string;
  code?: string;
  flatLabel?: string;
}

/** Why a bill is not an issued invoice, in words: `errors.<code>` when we know it, else a plain line. */
export function billReason(code: string | undefined, t: (k: string) => string): string | null {
  if (!code) return null;
  if (code === 'NOTHING_TO_BILL') return t('errors.SUBSCRIPTION_BILL_NOTHING_TO_BILL');
  if (code === 'CANCELLED') return t('p2.subscriptions.bills.cancelled');
  // The app's neutral plan sentence (no "upgrade" pointer), as `apiErrorMessage` gives it.
  if (code === 'PLAN_LIMIT_REACHED') return t('common.apiError.planLimit');
  if (i18n.exists(`errors.${code}`)) {
    const text = t(`errors.${code}`);
    // A sentence that needs values we do not have here reads worse than the plain line.
    if (!text.includes('{{')) return text;
  }
  return t('p2.subscriptions.bills.failedGeneric');
}

/** One monthly bill: who (on the bills screen), the month, status, number, amount, the reason; Retry when it did not issue. */
export function BillRow({
  c, bill, showCustomer, onRetry, retrying,
}: { c: ColorScheme; bill: BillRowView; showCustomer?: boolean; onRetry?: () => void; retrying?: boolean }) {
  const { t } = useTranslation();
  const reason = bill.status === 'ISSUED' ? null : billReason(bill.errorCode, t);
  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.divider }]} testID={`bill-${bill.id}`}>
      <View style={styles.top}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>
            {showCustomer ? [bill.flatLabel, bill.customerName].filter(Boolean).join(' · ') || bill.code || '' : monthLabel(bill.period, t)}
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
            {[showCustomer ? bill.code : null, bill.number, bill.deliveredDays !== undefined ? t('p2.subscriptions.bills.days', { count: bill.deliveredDays }) : null]
              .filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4, maxWidth: '45%' }}>
          <Pill c={c} tone={billTone(bill.status)} label={t(`p2.subscriptions.billStatus.${bill.status}`)} />
          {bill.amountPaise !== undefined ? (
            <Text style={{ color: c.textPrimary, fontWeight: '700' }} numberOfLines={1}>{formatPaise(bill.amountPaise)}</Text>
          ) : null}
        </View>
      </View>
      {reason ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>{reason}</Text> : null}
      {onRetry && canRetryBill(bill.status) ? (
        <View style={styles.actions}>
          <PillButton c={c} tone="outline" icon="refresh" label={bill.status === 'DRAFTED' ? t('p2.subscriptions.bills.issue') : t('p2.common.retry')}
            onPress={onRetry} disabled={retrying} testID={`bill-retry-${bill.id}`} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
