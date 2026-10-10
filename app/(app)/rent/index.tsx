import React, { useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors, radii, ColorScheme } from '../../../src/constants/colors';
import { Card, EmptyBlock, ErrorBlock, Screen, SectionLabel } from '../../../src/features/more/ui';
import { Ring, Segmented, SkeletonList } from '../../../src/components/ui';
import { PressableScale, Rise } from '../../../src/theme/motion';
import { apiErrorMessage } from '../../../src/api/axios';
import { formatI18nDate } from '../../../src/i18n';
import { formatPaise } from '../../../src/lib/money';
import { useMyRent } from '../../../src/features/rent/hooks';
import {
  BILL_STATUS_KEYS, LEASE_STATUS_KEYS, dateOfDay, hasLease, isBillId, isOpenBill, periodText,
} from '../../../src/features/rent/logic';
import type { PartnerRentBill, PartnerRentLease, RentListStatus } from '../../../src/features/rent/types';

/**
 * "My shop rent" (CONTRACT-partner-P4 §12 S, same verbs as the web partner
 * dashboard's `/dashboard/partner/society-rent`): the lease card(s), what is due,
 * and the rent / deposit bills. `?open=<billId>` (the notification link) opens
 * that bill straight away.
 */
export default function MyRentScreen() {
  const { t, i18n } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { open } = useLocalSearchParams<{ open?: string }>();
  const [status, setStatus] = useState<RentListStatus>('OPEN');
  const query = useMyRent(true, status);
  const data = query.data;

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !isBillId(open)) return;
    opened.current = true;
    router.push({ pathname: '/rent/[id]', params: { id: open } });
  }, [open]);

  const single = data && data.leases.length === 1 ? data.leases[0] : undefined;

  let body: React.ReactNode;
  if (query.isPending) body = <SkeletonList rows={3} testID="rent-loading" />;
  else if (query.isError) body = <ErrorBlock c={c} message={apiErrorMessage(query.error, t('rent.loadFailed'))} onRetry={() => void query.refetch()} />;
  else if (!hasLease(data)) body = <EmptyBlock c={c} icon="storefront-outline" title={t('rent.noLeaseTitle')} body={t('rent.noLeaseBody')} />;
  else {
    body = (
      <>
        <Rise index={0}>
        <Card c={c}>
          <View style={styles.totals}>
            <View style={styles.total}>
              <Text style={[styles.totalLabel, { color: c.textSecondary }]}>{t('rent.dueNow')}</Text>
              <Text style={[styles.totalValue, { color: c.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatPaise(data.totals.duePaise)}
              </Text>
            </View>
            <View style={styles.total}>
              <Text style={[styles.totalLabel, { color: c.textSecondary }]}>{t('rent.overdue')}</Text>
              <Text
                style={[styles.totalValue, { color: data.totals.overduePaise > 0 ? c.error : c.textPrimary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatPaise(data.totals.overduePaise)}
              </Text>
            </View>
          </View>
          {data.totals.duePaise === 0 ? (
            <Text style={[styles.note, { color: c.textSecondary }]}>{t('rent.nothingDue')}</Text>
          ) : null}
        </Card>
        </Rise>

        <SectionLabel c={c}>{t(data.leases.length === 1 ? 'rent.leaseSection' : 'rent.leasesSection')}</SectionLabel>
        {data.leases.map((l, i) => <Rise key={l.leaseId} index={Math.min(i + 1, 5)}><LeaseCard c={c} lease={l} /></Rise>)}

        <SectionLabel c={c}>{t('rent.billsSection')}</SectionLabel>
        {/* M15: the kit's sliding segmented pill (same three filters as the web). */}
        <Segmented<RentListStatus>
          testID="rent-filter"
          value={status}
          options={[
            { key: 'OPEN', label: t('rent.filter.OPEN') },
            { key: 'PAID', label: t('rent.filter.PAID') },
            { key: 'ALL', label: t('rent.filter.ALL') },
          ]}
          onChange={setStatus}
        />
        {data.bills.length === 0 ? (
          <Card c={c}><Text style={{ color: c.textSecondary }}>{t(`rent.noBills.${status}`)}</Text></Card>
        ) : (
          <Rise index={2}>
          <Card c={c} style={styles.listCard}>
            {data.bills.map((b, i) => (
              <View key={b.id}>
                <BillRow c={c} bill={b} lang={i18n.language} />
                {i < data.bills.length - 1 ? <View style={[styles.divider, { backgroundColor: c.divider }]} /> : null}
              </View>
            ))}
          </Card>
          </Rise>
        )}
        {data.total > data.bills.length ? (
          <Text style={[styles.note, { color: c.textSecondary }]}>
            {t('rent.showingLatest', { shown: data.bills.length, total: data.total })}
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <Screen c={c} title={t('rent.title')} subtitle={single?.societyName} scroll={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        {body}
      </ScrollView>
    </Screen>
  );
}

function LeaseCard({ c, lease }: { c: ColorScheme; lease: PartnerRentLease }) {
  const { t } = useTranslation();
  const statusKey = LEASE_STATUS_KEYS[lease.status];
  const live = lease.status === 'ACTIVE' || lease.status === 'NOTICE';
  return (
    <Card c={c}>
      <View style={styles.leaseHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.leaseTitle, { color: c.textPrimary }]} numberOfLines={2}>
            {t('rent.unitAt', { unit: lease.unitLabel, society: lease.societyName })}
          </Text>
          <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
            {t('rent.leaseNumber', { number: lease.number })}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: live ? c.surfaceVariant : c.background, borderColor: c.border }]}>
          <Text style={[styles.pillText, { color: lease.status === 'NOTICE' ? c.warning : c.textPrimary }]}>
            {statusKey ? t(statusKey) : lease.status}
          </Text>
        </View>
      </View>
      <Fact c={c} label={t('rent.monthlyRent')} value={formatPaise(lease.monthlyRentPaise)} />
      {lease.dueDay ? (
        <Fact
          c={c}
          label={t('rent.dueDay')}
          value={t(lease.frequency === 'QUARTERLY' ? 'rent.dueDayQuarterly' : 'rent.dueDayMonthly', { day: lease.dueDay })}
        />
      ) : null}
      <Fact c={c} label={t('rent.leaseRuns')} value={`${formatI18nDate(dateOfDay(lease.startDate), t)} – ${formatI18nDate(dateOfDay(lease.endDate), t)}`} />
      <Fact c={c} label={t('rent.depositHeld')} value={formatPaise(lease.depositHeldPaise)} />
      {live ? <TermRow c={c} lease={lease} /> : null}
    </Card>
  );
}

/** M15 — how far the lease has run (IST day, both days counted): the same ring the society and web show. */
function TermRow({ c, lease }: { c: ColorScheme; lease: PartnerRentLease }) {
  const { t } = useTranslation();
  const DAY = 86_400_000;
  const day = (iso: string) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00.000Z`);
  const s = day(lease.startDate); const e = day(lease.endDate);
  const today = day(new Date(Date.now() + 330 * 60_000).toISOString());
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  const total = Math.round((e - s) / DAY) + 1;
  const gone = today < s ? 0 : today > e ? total : Math.round((today - s) / DAY) + 1;
  const pct = Math.round((gone / total) * 100);
  const left = total - gone;
  return (
    <View style={styles.term} testID="rent-term">
      <Ring progress={gone / total} size={64} stroke={7} label={t('rent.term.aria', { pct })}>
        <Text style={[styles.termPct, { color: c.textPrimary }]}>{pct}%</Text>
      </Ring>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.factLabel, { color: c.textSecondary }]}>{t('rent.term.title')}</Text>
        <Text style={[styles.leaseTitle, { color: c.textPrimary }]}>
          {today < s ? t('rent.term.starts', { date: formatI18nDate(dateOfDay(lease.startDate), t) })
            : t('rent.term.daysLeft', { count: left })}
        </Text>
        {today >= s ? (
          <Text style={[styles.meta, { color: c.textSecondary }]}>
            {t(today > e ? 'rent.term.over' : 'rent.term.ends', { date: formatI18nDate(dateOfDay(lease.endDate), t) })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Fact({ c, label, value }: { c: ColorScheme; label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: c.textSecondary }]}>{label}</Text>
      <Text style={[styles.factValue, { color: c.textPrimary }]}>{value}</Text>
    </View>
  );
}

function BillRow({ c, bill, lang }: { c: ColorScheme; bill: PartnerRentBill; lang: string }) {
  const { t } = useTranslation();
  const open = isOpenBill(bill);
  const title = bill.kind === 'LEASE_DEPOSIT' ? t('rent.kind.LEASE_DEPOSIT') : t('rent.kind.RENTFor', { period: periodText(bill, lang) });
  const statusKey = BILL_STATUS_KEYS[bill.status];
  const overdue = bill.status === 'OVERDUE';
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/rent/[id]', params: { id: bill.id } })}
      accessibilityRole="button"
      testID={`rent-bill-${bill.id}`}
      scaleTo={0.98}
      style={[styles.billRow, { backgroundColor: c.surface }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.billTitle, { color: c.textPrimary }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={2}>
          {t('rent.billMeta', { number: bill.invoiceNumber, date: formatI18nDate(bill.dueDate, t) })}
        </Text>
      </View>
      <View style={styles.billRight}>
        <Text style={[styles.billAmount, { color: overdue ? c.error : c.textPrimary }]} numberOfLines={1}>
          {formatPaise(open ? bill.outstandingPaise : bill.totalPaise)}
        </Text>
        <Text style={[styles.billStatus, { color: overdue ? c.error : bill.status === 'PAID' ? c.success : c.textSecondary }]} numberOfLines={1}>
          {overdue && bill.overdueDays > 0
            ? t('rent.overdueDays', { count: bill.overdueDays })
            : statusKey ? t(statusKey) : bill.status}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  totals: { flexDirection: 'row', gap: 12 },
  total: { flex: 1, minWidth: 0 },
  totalLabel: { fontSize: 12, fontWeight: '600' },
  totalValue: { fontSize: 20, fontWeight: '700', marginTop: 2 },
  note: { fontSize: 12.5, lineHeight: 18 },
  leaseHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  leaseTitle: { fontSize: 15.5, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  pill: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth },
  pillText: { fontSize: 11.5, fontWeight: '600' },
  fact: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12 },
  factLabel: { fontSize: 13 },
  factValue: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  listCard: { padding: 0, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  billTitle: { fontSize: 14.5, fontWeight: '600' },
  billRight: { alignItems: 'flex-end', maxWidth: '45%' },
  billAmount: { fontSize: 14.5, fontWeight: '700' },
  billStatus: { fontSize: 11.5, marginTop: 2 },
  term: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  termPct: { fontSize: 13, fontWeight: '700' },
});
