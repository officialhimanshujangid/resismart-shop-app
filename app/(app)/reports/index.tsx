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
import {
  analyticsApi, AnalyticsBoard, findKpi, findSeries, findBreakdown, formatKpiValue,
} from '../../../src/api/analytics.api';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { AppButton } from '../../../src/components/AppButton';
import { AppInput } from '../../../src/components/AppInput';
import { Card, ChipRow, EmptyBlock, ErrorBlock, Loading, SectionLabel } from '../../../src/features/more/ui';
import { MiniBars, DonutRing, ProgressBar } from '../../../src/components/charts';

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
/**
 * `insights` is NOT a `PartnerReportKey` — it draws from
 * `GET /analytics/partner/overview` (the Phase-0 board), not from
 * `partner-report.service.ts`'s eight-report registry, and it is neither
 * exportable (no `exportReport('insights', …)` on the server) nor JSON-fetched
 * through `reportsApi`. Kept as a sibling union rather than folded into
 * `PartnerReportKey` for that reason — widening that type would make every
 * OTHER switch over it (in `reportsApi`, in `exportReport`) need an `insights`
 * case it can never honestly serve.
 */
type ReportTabKey = 'insights' | PartnerReportKey;

const REPORT_TABS: { key: ReportTabKey; label: string }[] = [
  { key: 'insights', label: 'Insights' },
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
  // Insights is the first tab AND the default — the charts a partner opens
  // Reports to see, same reasoning `TodayScreen` leads with its KPI grid.
  const [key, setKey] = useState<ReportTabKey>('insights');
  const [range, setRange] = useState(monthRange(0));
  const [asOf, setAsOf] = useState(isoDate(new Date()));
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);

  const isInsights = key === 'insights';
  const query: ReportQuery = key === 'outstanding' ? { asOf } : { from: range.from, to: range.to };
  // `!isInsights` narrows `key` to `PartnerReportKey` for `EXPORT_ONLY.has`, below.
  const exportOnly = !isInsights && EXPORT_ONLY.has(key);

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
    enabled: !exportOnly && !isInsights,
    staleTime: 30_000,
  });

  /** The Insights tab's own board — a different endpoint, same period controls. */
  const insights = useQuery({
    queryKey: qk.analytics.overview({ from: range.from, to: range.to }),
    queryFn: () => analyticsApi.overview({ from: range.from, to: range.to }),
    enabled: isInsights,
    staleTime: 30_000,
  });

  const doExport = async (format: 'pdf' | 'xlsx') => {
    if (isInsights) return; // no export path for the analytics board yet (plan Phase 8)
    setExporting(format);
    try {
      await exportReport(key as PartnerReportKey, format, query);
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

        {/* No export path for the analytics board (plan Phase 8) — the eight
            report exports below are untouched, this just does not grow a
            ninth. */}
        {!isInsights && (
          <View style={styles.exportRow}>
            <AppButton label="PDF" mode="outlined" onPress={() => doExport('pdf')} loading={exporting === 'pdf'} disabled={exporting !== null} style={styles.exportBtn} fullWidth={false} />
            <AppButton label="Excel" mode="outlined" onPress={() => doExport('xlsx')} loading={exporting === 'xlsx'} disabled={exporting !== null} style={styles.exportBtn} fullWidth={false} />
          </View>
        )}

        {isInsights ? (
          insights.isPending ? (
            <Loading c={c} />
          ) : insights.isError ? (
            <ErrorBlock c={c} message={apiErrorMessage(insights.error, 'Could not load your insights.')} onRetry={() => insights.refetch()} />
          ) : (
            <InsightsBody c={c} board={insights.data} />
          )
        ) : exportOnly ? (
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
          // `isInsights` (checked above) has already excluded `'insights'`.
          <ReportBody c={c} reportKey={key as PartnerReportKey} data={data.data} />
        )}

        <SectionLabel c={c}>Party balances</SectionLabel>
        <AppButton label="Check for drift" mode="text" onPress={checkDrift} />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The Reports → Insights tab: `sales trend`, `top items bar`,
 * `receivables ageing donut` from `GET /analytics/partner/overview`, plus a
 * summary card built from the same board's KPI headline numbers (the board
 * already carries them at no extra cost — leaving them unread would waste the
 * one request this tab makes).
 *
 * Reuses `Card`/`SectionLabel`/`SummaryLine`/`EmptyBlock` exactly as
 * `ReportBody` below does, and the same "dense but possibly all-zero" rule
 * every chart primitive in `components/charts/` already applies: a quiet
 * period draws flat bars and an empty ring, never a blank tab.
 */
function InsightsBody({ c, board }: { c: ReturnType<typeof themeColors>; board: AnalyticsBoard | undefined }) {
  if (!board) return <EmptyBlock c={c} title="Nothing to show" />;

  const totalSales = findKpi(board, 'total_sales');
  const ordersCount = findKpi(board, 'orders_count');
  const bookingsCount = findKpi(board, 'bookings_count');
  const aov = findKpi(board, 'average_order_value');
  const margin = findKpi(board, 'gross_margin');
  const marginValue = margin?.value ?? null;
  const receivablesKpi = findKpi(board, 'receivables_outstanding');
  const receivablesValue = receivablesKpi?.value ?? 0;

  const salesSeries = findSeries(board, 'sales_revenue');
  const hasSales = (salesSeries?.points ?? []).some((p) => (p.v ?? 0) > 0);

  const topItems = findBreakdown(board, 'top_items_by_revenue');
  const topItemsMax = topItems?.rows[0]?.value ?? 0;

  const ageing = findBreakdown(board, 'receivables_ageing');
  const ageingRows = ageing?.rows ?? [];
  const ageingTotal = ageingRows.reduce((sum, r) => sum + r.value, 0);
  // 0-30 → green, 90+ → red — the same "closer to due, closer to danger"
  // reading `AgeingCard` below gives with plain text; here it is colour.
  const AGEING_COLORS = [c.success, c.primary, c.warning, c.error];

  return (
    <>
      <Card c={c}>
        <SummaryLine c={c} label="Total sales" value={formatKpiValue(totalSales?.value ?? null, 'PAISE')} bold />
        <SummaryLine c={c} label="Orders" value={formatKpiValue(ordersCount?.value ?? null, 'COUNT')} />
        <SummaryLine c={c} label="Bookings" value={formatKpiValue(bookingsCount?.value ?? null, 'COUNT')} />
        <SummaryLine c={c} label="Average order value" value={formatKpiValue(aov?.value ?? null, 'PAISE')} />
        <SummaryLine
          c={c}
          label="Gross margin"
          value={formatKpiValue(marginValue, 'PERCENT')}
          tone={marginValue !== null && marginValue < 0 ? 'warn' : undefined}
        />
        <SummaryLine
          c={c}
          label="Receivables outstanding"
          value={formatKpiValue(receivablesValue, 'PAISE')}
          tone={receivablesValue > 0 ? 'warn' : undefined}
        />
      </Card>

      <SectionLabel c={c}>Sales trend</SectionLabel>
      <Card c={c}>
        {hasSales ? (
          <MiniBars c={c} points={salesSeries?.points ?? []} height={90} width={280} />
        ) : (
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>No sales in this period.</Text>
        )}
      </Card>

      <SectionLabel c={c}>Top items by revenue</SectionLabel>
      {!topItems || topItems.rows.length === 0 ? (
        <Card c={c}>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>No item sold in this period.</Text>
        </Card>
      ) : (
        <Card c={c} style={{ gap: 12 }}>
          {topItems.rows.map((row) => (
            <ProgressBar
              key={row.label}
              c={c}
              value={row.value}
              max={topItemsMax}
              label={row.label}
              valueLabel={formatPaise(row.value)}
            />
          ))}
        </Card>
      )}

      <SectionLabel c={c}>Receivables ageing</SectionLabel>
      <Card c={c} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <DonutRing
          c={c}
          size={104}
          strokeWidth={14}
          centerValue={formatPaise(ageingTotal, { showDecimals: false })}
          centerLabel="Outstanding"
          slices={ageingRows.map((r, i) => ({
            label: r.label,
            value: r.value,
            color: AGEING_COLORS[i % AGEING_COLORS.length],
          }))}
        />
        <View style={{ flex: 1, gap: 8 }}>
          {ageingTotal <= 0 ? (
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>Nothing outstanding.</Text>
          ) : (
            ageingRows.map((r, i) => (
              <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: AGEING_COLORS[i % AGEING_COLORS.length] }} />
                <Text style={{ color: c.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={1}>
                  {r.label}
                </Text>
                <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: '700' }}>
                  {formatPaise(r.value, { showDecimals: false })}
                </Text>
              </View>
            ))
          )}
        </View>
      </Card>
    </>
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
