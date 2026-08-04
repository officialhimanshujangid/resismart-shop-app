import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { themeColors, radii } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import {
  reportsApi, exportReport, PartnerReportKey, ReportQuery,
  RegisterReport, ItemWiseReport, GrossProfitReport, PartyWiseReport, AgeingReport,
} from '../../../src/api/reports.api';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { AppButton } from '../../../src/components/AppButton';
import { AppInput } from '../../../src/components/AppInput';
import { Card, ChipRow, EmptyBlock, ErrorBlock, Loading, SectionLabel } from '../../../src/features/more/ui';

/**
 * `sales`/`purchase`/`items`/`parties`/`outstanding`/`profit` are read on
 * screen AND exportable. `gstr1`/`gstr3b` are export-only — a GST return has
 * B2B/B2CL/B2CS/exports/nil-rated/HSN sections that do not fit a phone width,
 * and a partner filing GST reads it in the government portal's own upload
 * format anyway. Squeezing a summary onto the screen would be a worse return
 * than the one their CA actually needs; a clean PDF/Excel export handed
 * straight to WhatsApp or email is the honest phone-shaped version of this
 * feature (spec: "say what you decided").
 */
const REPORT_TABS: { key: PartnerReportKey; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'purchase', label: 'Purchase' },
  { key: 'items', label: 'Items' },
  { key: 'parties', label: 'Parties' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'profit', label: 'Profit' },
  { key: 'gstr1', label: 'GSTR-1' },
  { key: 'gstr3b', label: 'GSTR-3B' },
];
const EXPORT_ONLY = new Set<PartnerReportKey>(['gstr1', 'gstr3b']);

function pad(n: number) { return String(n).padStart(2, '0'); }
function isoDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function monthRange(monthsAgo: number): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const last = monthsAgo === 0 ? now : new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
  return { from: isoDate(first), to: isoDate(last) };
}

export default function ReportsScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const [key, setKey] = useState<PartnerReportKey>('sales');
  const [range, setRange] = useState(monthRange(0));
  const [asOf, setAsOf] = useState(isoDate(new Date()));
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);

  const query: ReportQuery = key === 'outstanding' ? { asOf } : { from: range.from, to: range.to };
  const exportOnly = EXPORT_ONLY.has(key);

  const cacheKey = qk.reports(`${key}:${JSON.stringify(query)}`);
  const data = useQuery({
    queryKey: cacheKey,
    queryFn: async () => {
      if (key === 'sales' || key === 'purchase') return reportsApi.register(key, query);
      if (key === 'items') return reportsApi.items(query);
      if (key === 'profit') return reportsApi.profit(query);
      if (key === 'parties') return reportsApi.parties(query);
      if (key === 'outstanding') return reportsApi.outstanding(query);
      return null;
    },
    enabled: !exportOnly,
    staleTime: 30_000,
  });

  const doExport = async (format: 'pdf' | 'xlsx') => {
    setExporting(format);
    try {
      await exportReport(key, format, query);
    } catch (err) {
      Alert.alert('Could not export that report', apiErrorMessage(err));
    } finally {
      setExporting(null);
    }
  };

  const checkDrift = async () => {
    try {
      const rows = await reportsApi.drift();
      if (rows.length === 0) {
        Alert.alert('All clear', 'Every party balance matches the ledger.');
        return;
      }
      const lines = rows.slice(0, 8).map((r) => `${r.name}: off by ${formatPaise(Math.abs(r.driftPaise))}`).join('\n');
      Alert.alert(
        `${rows.length} balance(s) disagree with the ledger`,
        `${lines}${rows.length > 8 ? `\n…and ${rows.length - 8} more` : ''}\n\nOpen each party and use "Rebuild balance" to fix it.`,
      );
    } catch (err) {
      Alert.alert('Could not check balances', apiErrorMessage(err));
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Reports</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <ChipRow c={c} value={key} options={REPORT_TABS} onChange={setKey} />

        {key === 'outstanding' ? (
          <AppInput label="As of (YYYY-MM-DD)" value={asOf} onChangeText={setAsOf} />
        ) : (
          <View style={{ gap: 8 }}>
            <View style={styles.periodRow}>
              <AppInput label="From" value={range.from} onChangeText={(v) => setRange((r) => ({ ...r, from: v }))} style={styles.periodInput} />
              <AppInput label="To" value={range.to} onChangeText={(v) => setRange((r) => ({ ...r, to: v }))} style={styles.periodInput} />
            </View>
            <View style={styles.presetRow}>
              {([
                ['This month', () => setRange(monthRange(0))],
                ['Last month', () => setRange(monthRange(1))],
                ['This year', () => setRange({ from: `${new Date().getFullYear()}-01-01`, to: isoDate(new Date()) })],
              ] as const).map(([label, apply]) => (
                <Pressable key={label} onPress={apply} style={[styles.presetChip, { borderColor: c.border }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary }}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.exportRow}>
          <AppButton label="PDF" mode="outlined" onPress={() => doExport('pdf')} loading={exporting === 'pdf'} disabled={exporting !== null} style={styles.exportBtn} fullWidth={false} />
          <AppButton label="Excel" mode="outlined" onPress={() => doExport('xlsx')} loading={exporting === 'xlsx'} disabled={exporting !== null} style={styles.exportBtn} fullWidth={false} />
        </View>

        {exportOnly ? (
          <Card c={c}>
            <Text style={{ color: c.textPrimary, fontWeight: '700' }}>
              {key === 'gstr1' ? 'GSTR-1 — outward supplies' : 'GSTR-3B — summary return'}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
              This return has more sections (B2B, B2CL, B2CS, exports, HSN summary) than a phone screen can show
              usefully. Export it as PDF to read, or Excel to upload to the GST portal or hand to your CA.
            </Text>
          </Card>
        ) : data.isPending ? (
          <Loading c={c} />
        ) : data.isError ? (
          <ErrorBlock c={c} message={apiErrorMessage(data.error, 'Could not load that report.')} onRetry={() => data.refetch()} />
        ) : (
          <ReportBody c={c} reportKey={key} data={data.data} />
        )}

        <SectionLabel c={c}>Party balances</SectionLabel>
        <AppButton label="Check for drift" mode="text" onPress={checkDrift} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportBody({ c, reportKey, data }: { c: ReturnType<typeof themeColors>; reportKey: PartnerReportKey; data: unknown }) {
  if (!data) return <EmptyBlock c={c} title="Nothing to show" />;

  if (reportKey === 'sales' || reportKey === 'purchase') {
    const r = data as RegisterReport;
    return (
      <>
        <Card c={c}>
          <SummaryLine c={c} label="Grand total" value={formatPaise(r.totals.grandPaise)} bold />
          <SummaryLine c={c} label="Received / paid" value={formatPaise(r.totals.settledPaise)} />
          <SummaryLine c={c} label="Outstanding" value={formatPaise(r.totals.outstandingPaise)} tone={r.totals.outstandingPaise > 0 ? 'warn' : undefined} />
          <SummaryLine c={c} label="Documents" value={String(r.totals.count)} />
        </Card>
        {r.rows.length === 0 ? (
          <EmptyBlock c={c} title="No documents in this period" />
        ) : (
          <Card c={c} style={{ padding: 0 }}>
            {r.rows.slice(0, 50).map((row, i) => (
              <View key={row.documentId} style={[styles.docRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                    {row.number || row.typeLabel} · {row.partyName}
                  </Text>
                  <Text style={{ color: c.textSecondary, fontSize: 11 }}>{row.typeLabel} · {row.status}</Text>
                </View>
                <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 13 }}>{formatPaise(row.grandPaise)}</Text>
              </View>
            ))}
            {r.rows.length > 50 && <Text style={{ color: c.textDisabled, fontSize: 11, padding: 12 }}>+{r.rows.length - 50} more — export for the full list.</Text>}
          </Card>
        )}
      </>
    );
  }

  if (reportKey === 'items') {
    const r = data as ItemWiseReport;
    return (
      <>
        <Card c={c}>
          <SummaryLine c={c} label="Revenue" value={formatPaise(r.totals.revenuePaise)} bold />
          <SummaryLine c={c} label="Gross profit" value={formatPaise(r.totals.grossProfitPaise)} />
          <SummaryLine c={c} label="Margin" value={`${(r.totals.marginBasisPoints / 100).toFixed(1)}%`} />
        </Card>
        {r.rows.length === 0 ? <EmptyBlock c={c} title="No sales in this period" /> : (
          <Card c={c} style={{ padding: 0 }}>
            {r.rows.slice(0, 50).map((row, i) => (
              <View key={row.key} style={[styles.docRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{row.itemName}</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 11 }}>{row.qtySold} {row.unit} sold{!row.costKnown ? ' · no cost on record' : ''}</Text>
                </View>
                <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 13 }}>{formatPaise(row.revenuePaise)}</Text>
              </View>
            ))}
          </Card>
        )}
      </>
    );
  }

  if (reportKey === 'profit') {
    const r = data as GrossProfitReport;
    return (
      <>
        <Card c={c}>
          <SummaryLine c={c} label="Revenue" value={formatPaise(r.revenuePaise)} bold />
          <SummaryLine c={c} label="Cost of sales" value={formatPaise(r.cogsPaise)} />
          <SummaryLine c={c} label="Gross profit" value={formatPaise(r.grossProfitPaise)} tone={r.grossProfitPaise >= 0 ? 'good' : 'warn'} />
          <SummaryLine c={c} label="Margin" value={`${(r.marginBasisPoints / 100).toFixed(1)}%`} />
        </Card>
        {r.notes.map((n, i) => (
          <Text key={i} style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17 }}>{n}</Text>
        ))}
        {r.topByProfit.length > 0 && (
          <>
            <SectionLabel c={c}>Top by profit</SectionLabel>
            <Card c={c} style={{ padding: 0 }}>
              {r.topByProfit.slice(0, 20).map((row, i) => (
                <View key={row.key} style={[styles.docRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
                  <Text style={{ color: c.textPrimary, fontSize: 13, flex: 1 }} numberOfLines={1}>{row.itemName}</Text>
                  <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 13 }}>{formatPaise(row.grossProfitPaise)}</Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </>
    );
  }

  if (reportKey === 'parties') {
    const r = data as PartyWiseReport;
    return r.rows.length === 0 ? <EmptyBlock c={c} title="No trading in this period" /> : (
      <Card c={c} style={{ padding: 0 }}>
        {r.rows.slice(0, 50).map((row, i) => (
          <View key={row.partyId} style={[styles.docRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{row.name}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 11 }}>Sold {formatPaise(row.salesPaise)} · Bought {formatPaise(row.purchasePaise)}</Text>
            </View>
            <Text style={{ color: row.closingBalancePaise > 0 ? c.error : c.textSecondary, fontWeight: '700', fontSize: 13 }}>
              {formatPaise(Math.abs(row.closingBalancePaise))}
            </Text>
          </View>
        ))}
      </Card>
    );
  }

  // outstanding
  const r = data as AgeingReport;
  return (
    <>
      <SectionLabel c={c}>Receivables — who owes you</SectionLabel>
      <AgeingCard c={c} section={r.receivables} buckets={r.buckets} />
      <SectionLabel c={c}>Payables — who you owe</SectionLabel>
      <AgeingCard c={c} section={r.payables} buckets={r.buckets} />
    </>
  );
}

function AgeingCard({ c, section, buckets }: { c: ReturnType<typeof themeColors>; section: AgeingReport['receivables']; buckets: AgeingReport['buckets'] }) {
  if (section.rows.length === 0) return <Card c={c}><Text style={{ color: c.textSecondary, fontSize: 13 }}>Nothing open.</Text></Card>;
  return (
    <Card c={c} style={{ padding: 0 }}>
      <View style={styles.docRow}>
        <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '700', flex: 1 }}>TOTAL</Text>
        <Text style={{ color: c.textPrimary, fontWeight: '800', fontSize: 14 }}>{formatPaise(section.totals.netPaise)}</Text>
      </View>
      {section.rows.slice(0, 50).map((row, i) => (
        <View key={row.partyId} style={[styles.docRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{row.name}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>Oldest {row.oldestDays}d · {buckets.map((b, bi) => `${b.label}: ${formatPaise(row.buckets[bi] ?? 0, { showDecimals: false })}`).join(' · ')}</Text>
          </View>
          <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 13 }}>{formatPaise(row.netPaise)}</Text>
        </View>
      ))}
    </Card>
  );
}

function SummaryLine({ c, label, value, bold, tone }: { c: ReturnType<typeof themeColors>; label: string; value: string; bold?: boolean; tone?: 'warn' | 'good' }) {
  const color = tone === 'warn' ? c.error : tone === 'good' ? c.success : (bold ? c.textPrimary : c.textSecondary);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>{label}</Text>
      <Text style={{ color, fontWeight: bold ? '800' : '700', fontSize: bold ? 16 : 13 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  periodRow: { flexDirection: 'row', gap: 10 },
  periodInput: { flex: 1 },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetChip: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 },
  exportRow: { flexDirection: 'row', gap: 10 },
  exportBtn: { flex: 1 },
  docRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
