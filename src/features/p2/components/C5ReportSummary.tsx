import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { Card, SectionLabel } from '../../more/ui';
import { StatGrid, StatTile } from '../../p1/ui';
import type { C5ReportKey } from '../../../api/reports.api';

/**
 * FPB P2 (2026-10-31) — the three commerce C5 reports on the phone, the web's
 * `partner/reports/C5Views.tsx` in phone shape: sales by staff, dead & slow
 * stock, offer performance. Same figures and the same totals as the web screen
 * and the PDF / Excel export (backend `partner-report.service.ts`,
 * COMMERCE-C5-REPORTS). Headline tiles, then one row per staff / item / offer
 * that wraps at 320dp (no table running off the screen). Every field is read
 * defensively — a missing block draws less, never crashes.
 */
type AnyObj = Record<string, unknown>;
const obj = (v: unknown): AnyObj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as AnyObj) : {});
const arr = (v: unknown): AnyObj[] => (Array.isArray(v) ? v.map(obj) : []);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function Row({ c, title, right, sub, testID }: { c: ColorScheme; title: string; right: string; sub?: string; testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.rowTop}>
        <Text style={[styles.left, { color: c.textPrimary }]} numberOfLines={2}>{title}</Text>
        <Text style={[styles.right, { color: c.textPrimary }]}>{right}</Text>
      </View>
      {sub ? <Text style={[styles.sub, { color: c.textSecondary }]}>{sub}</Text> : null}
    </View>
  );
}

export function C5ReportSummary({ c, reportKey, data }: { c: ColorScheme; reportKey: C5ReportKey; data: unknown }) {
  const { t, i18n } = useTranslation();
  const s = (k: string, o?: Record<string, unknown>) => t(`reports.c5.${k}`, o);
  const d = obj(data);
  const day = (iso: string) => {
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) return iso;
    return when.toLocaleDateString(i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  let tiles: { label: string; value: string }[] = [];
  let note = '';
  let listTitle = '';
  let rows: { title: string; right: string; sub?: string }[] = [];
  let totalLine: { title: string; right: string } | null = null;
  let empty = '';
  let extra: React.ReactNode = null;

  if (reportKey === 'sales-by-staff') {
    const list = arr(d.rows);
    const sum = (k: string) => list.reduce((a, r) => a + num(r[k]), 0);
    tiles = [
      { label: s('staff.bills'), value: String(sum('bills')) },
      { label: s('staff.billed'), value: formatPaise(sum('billsPaise')) },
      { label: s('staff.accepted'), value: String(sum('ordersHandled')) },
      { label: s('staff.delivered'), value: String(sum('ordersDelivered')) },
    ];
    note = s('staff.note');
    listTitle = s('staff.table');
    rows = list.map((r) => ({
      title: str(r.name) || s('staff.unnamed'),
      right: formatPaise(num(r.billsPaise)),
      sub: s('staff.line', { bills: num(r.bills), accepted: num(r.ordersHandled), delivered: num(r.ordersDelivered) }),
    }));
    totalLine = list.length ? { title: s('total'), right: formatPaise(sum('billsPaise')) } : null;
    empty = s('staff.empty');
  } else if (reportKey === 'dead-stock') {
    const list = arr(d.rows);
    const count = (k: string) => list.filter((r) => r.class === k).length;
    const word = (k: string) => (k === 'DEAD' || k === 'SLOW' || k === 'NEW' ? s(`dead.class.${k}`) : k);
    tiles = [
      { label: s('dead.class.DEAD'), value: String(count('DEAD')) },
      { label: s('dead.class.SLOW'), value: String(count('SLOW')) },
      { label: s('dead.class.NEW'), value: String(count('NEW')) },
    ];
    note = s('dead.note');
    listTitle = str(d.asOf) ? s('dead.asOf', { date: day(str(d.asOf)) }) : s('dead.items');
    rows = list.map((r) => ({
      title: str(r.name) || '—',
      right: word(str(r.class)),
      sub: s('dead.line', {
        qty: num(r.stockQty),
        last: str(r.lastSoldAt) ? day(str(r.lastSoldAt)) : s('dead.never'),
      }),
    }));
    empty = s('dead.empty');
  } else {
    const offers = arr(d.offers);
    const totals = obj(d.totals);
    const b = obj(d.broadcasts);
    tiles = [
      { label: s('offers.used'), value: String(num(totals.redemptions)) },
      { label: s('offers.discount'), value: formatPaise(num(totals.discountPaise)) },
      { label: s('offers.sales'), value: formatPaise(num(totals.salesPaise)) },
      { label: s('offers.messagesSent'), value: String(num(b.sent)) },
    ];
    listTitle = s('offers.table');
    rows = offers.map((r) => ({
      // The offer's own name / code and the server's status word, as the export prints them.
      title: [str(r.name) || '—', str(r.code)].filter(Boolean).join(' · '),
      right: formatPaise(num(r.salesPaise)),
      sub: s('offers.line', {
        used: num(r.redemptions), reversed: num(r.reversed), customers: num(r.customers),
        online: num(r.onlineOrders), counter: num(r.counterBills), discount: formatPaise(num(r.discountPaise)),
      }) + (str(r.status) ? ` · ${str(r.status)}` : ''),
    }));
    totalLine = offers.length ? { title: s('total'), right: formatPaise(num(totals.salesPaise)) } : null;
    empty = s('offers.empty');
    extra = (
      <>
        <SectionLabel c={c}>{s('offers.messages')}</SectionLabel>
        <Card c={c}>
          <Row c={c} title={s('offers.messagesSent')} right={String(num(b.sent))} />
          <Row c={c} title={s('offers.reached')} right={String(num(b.reached))} />
          <Row c={c} title={s('offers.fromMessages')} right={String(num(b.ordersFromBroadcasts))} sub={formatPaise(num(b.salesFromBroadcastsPaise))} />
        </Card>
      </>
    );
  }

  return (
    <View style={{ gap: 10 }} testID={`c5-report-${reportKey}`}>
      <StatGrid>
        {tiles.map((x) => <StatTile key={x.label} c={c} label={x.label} value={x.value} />)}
      </StatGrid>
      {note ? <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 18 }}>{note}</Text> : null}
      <SectionLabel c={c}>{listTitle}</SectionLabel>
      <Card c={c}>
        {rows.length === 0 ? (
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{empty}</Text>
        ) : (
          rows.map((r, i) => <Row key={`${r.title}-${i}`} c={c} title={r.title} right={r.right} sub={r.sub} />)
        )}
        {totalLine ? (
          <View style={[styles.total, { borderTopColor: c.divider }]}>
            <Row c={c} title={totalLine.title} right={totalLine.right} testID={`c5-total-${reportKey}`} />
          </View>
        ) : null}
      </Card>
      {extra}
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('reports.p2.exportHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2, paddingVertical: 4 },
  rowTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  left: { flex: 1, minWidth: 120, fontSize: 13.5, fontWeight: '600' },
  right: { fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 12, lineHeight: 17 },
  total: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4, paddingTop: 4 },
});
