import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { Card, SectionLabel } from '../../more/ui';
import { StatGrid, StatTile } from '../../p1/ui';
import type { P2ReportKey } from '../../../api/reports.api';

/**
 * The four P2 business-type reports (B5, `partner-p2-reports.ts`) read on the
 * phone: the headline figures as tiles and the one breakdown that matters,
 * rows that wrap at 320dp. The full tables are in the PDF / Excel export.
 * Every field is read defensively — a report missing a block draws less, never crashes.
 */
type AnyObj = Record<string, unknown>;
const obj = (v: unknown): AnyObj => (v && typeof v === 'object' ? (v as AnyObj) : {});
const arr = (v: unknown): AnyObj[] => (Array.isArray(v) ? (v as AnyObj[]) : []);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const pct = (bps: unknown) => `${(num(bps) / 100).toFixed(1)}%`;

function Line({ c, left, right }: { c: ColorScheme; left: string; right: string }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.left, { color: c.textPrimary }]} numberOfLines={2}>{left}</Text>
      <Text style={[styles.right, { color: c.textSecondary }]}>{right}</Text>
    </View>
  );
}

export function P2ReportSummary({ c, reportKey, data }: { c: ColorScheme; reportKey: P2ReportKey; data: unknown }) {
  const { t } = useTranslation();
  const d = obj(data);
  const s = (k: string, o?: Record<string, unknown>) => t(`reports.p2.${k}`, o);

  let tiles: { label: string; value: string }[] = [];
  let listTitle = '';
  let lines: { left: string; right: string }[] = [];

  if (reportKey === 'near-expiry-value') {
    const tot = obj(obj(d.valuation).totals);
    tiles = [
      { label: s('atRisk'), value: formatPaise(num(tot.atRiskValuePaise)) },
      { label: s('stockValue'), value: formatPaise(num(tot.valuePaise)) },
      { label: s('batches'), value: String(num(tot.batches)) },
      { label: s('rxEntries'), value: String(num(obj(d.rx).entries)) },
    ];
    listTitle = s('byBucket');
    lines = arr(d.buckets).map((b) => ({
      left: String(b.label) === 'EXPIRED' ? s('expired') : s('within', { label: String(b.label).replace('≤', '') }),
      right: `${num(b.count)} · ${formatPaise(num(b.valuePaise))}`,
    }));
  } else if (reportKey === 'subscription-collections') {
    const tot = obj(d.totals);
    const subs = obj(d.subscriptions);
    tiles = [
      { label: s('billed'), value: formatPaise(num(tot.billedPaise)) },
      { label: s('collected'), value: formatPaise(num(tot.collectedPaise)) },
      { label: s('outstanding'), value: formatPaise(num(tot.outstandingPaise)) },
      { label: s('collectionRate'), value: pct(tot.collectionBasisPoints) },
      { label: s('activeSubs'), value: String(num(subs.active)) },
    ];
    listTitle = s('byMonth');
    lines = arr(d.byPeriod).map((p) => ({
      left: String(p.period),
      right: `${formatPaise(num(p.collectedPaise))} / ${formatPaise(num(p.billedPaise))}`,
    }));
  } else if (reportKey === 'appointment-utilisation') {
    const tot = obj(d.totals);
    tiles = [
      { label: s('bookings'), value: String(num(tot.bookings)) },
      { label: s('served'), value: String(num(tot.served)) },
      { label: s('utilisation'), value: pct(tot.utilisationBasisPoints) },
      { label: s('noShowRate'), value: pct(tot.noShowBasisPoints) },
      { label: s('packagesSold'), value: String(num(obj(d.packages).sold)) },
    ];
    listTitle = s('byStaff');
    lines = arr(d.byStaff).map((r) => ({
      left: String(r.name ?? ''),
      right: `${num(r.served)}/${num(r.bookings)} · ${pct(r.utilisationBasisPoints)}`,
    }));
  } else {
    const f = obj(d.funnel);
    const m = obj(d.money);
    tiles = [
      { label: s('jobs'), value: String(num(f.jobs)) },
      { label: s('quoted'), value: String(num(f.quoted)) },
      { label: s('approved'), value: String(num(f.approved)) },
      { label: s('conversion'), value: pct(f.conversionBasisPoints) },
      { label: s('invoiced'), value: formatPaise(num(m.invoicedPaise)) },
    ];
    listTitle = s('openPipeline');
    lines = arr(d.openPipeline).map((r) => ({
      left: String(r.stage ?? ''),
      right: `${num(r.jobs)} · ${formatPaise(num(r.pendingQuotePaise))}`,
    }));
  }

  return (
    <View style={{ gap: 10 }} testID={`p2-report-${reportKey}`}>
      <StatGrid>
        {tiles.map((x) => <StatTile key={x.label} c={c} label={x.label} value={x.value} />)}
      </StatGrid>
      {lines.length ? (
        <>
          <SectionLabel c={c}>{listTitle}</SectionLabel>
          <Card c={c}>{lines.map((l, i) => <Line key={`${l.left}-${i}`} c={c} left={l.left} right={l.right} />)}</Card>
        </>
      ) : null}
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{s('exportHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, minHeight: 32, alignItems: 'center' },
  left: { flex: 1, minWidth: 120, fontSize: 13.5, fontWeight: '600' },
  right: { fontSize: 13 },
});
