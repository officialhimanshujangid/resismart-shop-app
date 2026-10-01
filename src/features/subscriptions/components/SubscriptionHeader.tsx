import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { Pill } from '../../p2/ui';
import { shortDay } from '../../p2/dates';
import { lineSummary, revisionOn, scheduleText } from '../logic';
import type { Subscription } from '../types';

/** Who, what, when, how billed — the top of a subscription. */
export function SubscriptionHeader({
  c, sub, routeName, today,
}: { c: ColorScheme; sub: Subscription; routeName?: string; today: string }) {
  const { t } = useTranslation();
  const rev = revisionOn(sub.revisions ?? [], today);
  const billing = rev?.billing;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]} testID="sub-header">
      <View style={styles.top}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={2}>{sub.title}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>
            {[sub.code, t(`p2.subscriptions.kind.${sub.kind}`)].join(' · ')}
          </Text>
        </View>
        <Pill c={c} tone={sub.status === 'ACTIVE' ? 'good' : 'neutral'} label={t(`p2.subscriptions.status.${sub.status}`)} />
      </View>
      <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>
        {sub.flatLabel ? `${sub.flatLabel} · ${sub.customerName}` : sub.customerName}
      </Text>
      {rev ? (
        <Text style={{ color: c.textPrimary }} numberOfLines={3}>
          {`${lineSummary(rev.lines)} — ${scheduleText(rev.schedule, t)}`}
        </Text>
      ) : null}
      {billing ? (
        <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={2}>
          {billing.mode === 'FIXED_MONTHLY'
            ? t('p2.subscriptions.detail.fixedFee', { amount: formatPaise(billing.monthlyFeePaise ?? 0) })
            : t('p2.subscriptions.billing.PER_DELIVERY')}
        </Text>
      ) : null}
      <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={2}>
        {[
          t('p2.subscriptions.detail.since', { day: shortDay(sub.startDate, t) }),
          sub.endDate ? t('p2.subscriptions.detail.until', { day: shortDay(sub.endDate, t) }) : null,
          routeName ? t('p2.subscriptions.detail.onRoute', { route: routeName }) : null,
        ].filter(Boolean).join(' · ')}
      </Text>
      {sub.status === 'ENDED' && sub.endedReason ? (
        <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={3}>{t('p2.subscriptions.detail.endedWhy', { reason: sub.endedReason })}</Text>
      ) : null}
      {sub.notes ? <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={3}>{sub.notes}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 17, fontWeight: '700' },
});
