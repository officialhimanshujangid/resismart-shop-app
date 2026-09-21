import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

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
import { DateField } from '../../../src/components/DateField';
import { Hero } from '../../../src/components/Hero';
import { HelpButton } from '../../../src/features/help/HelpButton';
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

/**
 * `key` is the WIRE value — it is the report name `reportsApi` and
 * `exportReport` are switched on, and `EXPORT_ONLY` is written against — so it
 * stays an English literal. Only `labelKey` is display.
 */
const REPORT_TABS: { key: ReportTabKey; labelKey: string }[] = [
  { key: 'insights', labelKey: 'reports.tab.insights' },
  { key: 'sales', labelKey: 'reports.tab.sales' },
  { key: 'purchase', labelKey: 'reports.tab.purchase' },
  { key: 'items', labelKey: 'reports.tab.items' },
  { key: 'parties', labelKey: 'reports.tab.parties' },
  { key: 'outstanding', labelKey: 'reports.tab.outstanding' },
  { key: 'profit', labelKey: 'reports.tab.profit' },
  { key: 'gstr1', labelKey: 'reports.tab.gstr1' },
  { key: 'gstr3b', labelKey: 'reports.tab.gstr3b' },
];

/**
 * The three period presets. `id` is this screen's own React key and the label
 * lookup; it is deliberately NOT the label, which used to be both — a
 * translated label as a `key` changes identity the moment the language does.
 */
const PERIOD_PRESETS = [
  { id: 'thisMonth', labelKey: 'reports.page.presetThisMonth', range: () => monthRange(0) },
  { id: 'lastMonth', labelKey: 'reports.page.presetLastMonth', range: () => monthRange(1) },
  // "This financial year", spelled out. The old "This year" meant the calendar
  // year here and the April-start FY on the web — see `financialYearRange`.
  { id: 'financialYear', labelKey: 'reports.page.presetFinancialYear', range: () => financialYearRange() },
] as const;
const EXPORT_ONLY = new Set<PartnerReportKey>(['gstr1', 'gstr3b']);

function pad(n: number) { return String(n).padStart(2, '0'); }
function isoDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function monthRange(monthsAgo: number): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const last = monthsAgo === 0 ? now : new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
  return { from: isoDate(first), to: isoDate(last) };
}

/**
 * The April-start Indian financial year — the same range
 * `currentFinancialYearRange` gives the web reports screen, and the same one
 * `financial-year.util.ts` computes on the server.
 *
 * This control used to say "This year" and mean 1 January. Two people reading
 * the same-named button on a phone and a laptop got two different periods, and
 * the period is the whole of what a GST report says: a March invoice belongs to
 * last year's return on one and this year's on the other. Named and computed
 * like the web one so there is one answer to "this year" in the product.
 */
function financialYearRange(today = new Date()): { from: string; to: string } {
  const startYear = today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  return { from: isoDate(new Date(startYear, 3, 1)), to: isoDate(new Date(startYear + 1, 2, 31)) };
}

export default function ReportsScreen() {
  const { t } = useTranslation();
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
      Alert.alert(t('reports.page.exportFailed'), apiErrorMessage(err));
    } finally {
      setExporting(null);
    }
  };

  const checkDrift = async () => {
    try {
      const rows = await reportsApi.drift();
      if (rows.length === 0) {
        Alert.alert(t('reports.page.driftAllClearTitle'), t('reports.page.driftAllClearBody'));
        return;
      }
      /* Assembled from KEYS, not concatenated English: the "(s)" this title used
         to carry is `_one`/`_other` now, and the "…and N more" tail is its own
         key so a translator can move it. `r.name` is the party's own name. */
      const lines = rows
        .slice(0, 8)
        .map((r) => t('reports.page.driftLine', { name: r.name, amount: formatPaise(Math.abs(r.driftPaise)) }))
        .join('\n');
      Alert.alert(
        t('reports.page.driftTitle', { count: rows.length }),
        t('reports.page.driftBody', {
          lines,
          more: rows.length > 8 ? t('reports.page.driftMore', { count: rows.length - 8 }) : '',
        }),
      );
    } catch (err) {
      Alert.alert(t('reports.page.driftCheckFailed'), apiErrorMessage(err));
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <Hero isDark={isDark} action={<HelpButton c={c} variant="hero" />} rounded={false} eyebrow={t('reports.page.eyebrow')} title={t('reports.page.title')} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <ChipRow c={c} value={key} options={REPORT_TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey) }))} onChange={setKey} />

        {/*
          `DateField`, not a raw `AppInput`. These three feed a GST period, and
          a free-text box invites "1/4/25" and "31-03-2026" — neither of which
          is the "YYYY-MM-DD" the server parses, and neither of which said so.
          The picker can only emit the format that works, which is why there is
          no validation here to write: the invalid states stopped existing.
        */}
        {key === 'outstanding' ? (
          <DateField label={t('reports.page.asOf')} value={asOf} onChangeText={setAsOf} mode="date" />
        ) : (
          <View style={{ gap: 8 }}>
            <View style={styles.periodRow}>
              <DateField
                label={t('reports.page.from')}
                value={range.from}
                onChangeText={(v) => setRange((r) => ({ ...r, from: v }))}
                mode="date"
                // The one ordering a picker cannot fix on its own: "to" before
                // "from" is a range the server answers with nothing at all.
                maximumDate={range.to ? new Date(`${range.to}T00:00:00`) : undefined}
                style={styles.periodInput}
              />
              <DateField
                label={t('reports.page.to')}
                value={range.to}
                onChangeText={(v) => setRange((r) => ({ ...r, to: v }))}
                mode="date"
                minimumDate={range.from ? new Date(`${range.from}T00:00:00`) : undefined}
                style={styles.periodInput}
              />
            </View>
            <View style={styles.presetRow}>
              {PERIOD_PRESETS.map((preset) => (
                <Pressable
                  key={preset.id}
                  onPress={() => setRange(preset.range())}
                  style={[styles.presetChip, { borderColor: c.border }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: c.primary }}>{t(preset.labelKey)}</Text>
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
            <AppButton label={t('reports.page.pdf')} mode="outlined" onPress={() => doExport('pdf')} loading={exporting === 'pdf'} disabled={exporting !== null} style={styles.exportBtn} fullWidth={false} />
            <AppButton label={t('reports.page.excel')} mode="outlined" onPress={() => doExport('xlsx')} loading={exporting === 'xlsx'} disabled={exporting !== null} style={styles.exportBtn} fullWidth={false} />
          </View>
        )}

        {isInsights ? (
          insights.isPending ? (
            <Loading c={c} />
          ) : insights.isError ? (
            <ErrorBlock c={c} message={apiErrorMessage(insights.error, t('reports.page.insightsLoadFailed'))} onRetry={() => insights.refetch()} />
          ) : (
            <InsightsBody c={c} board={insights.data} />
          )
        ) : exportOnly ? (
          <Card c={c}>
            <Text style={{ color: c.textPrimary, fontWeight: '600' }}>
              {t(key === 'gstr1' ? 'reports.page.gstr1Title' : 'reports.page.gstr3bTitle')}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
              {t('reports.page.gstrBody')}
            </Text>
          </Card>
        ) : data.isPending ? (
          <Loading c={c} />
        ) : data.isError ? (
          <ErrorBlock c={c} message={apiErrorMessage(data.error, t('reports.page.reportLoadFailed'))} onRetry={() => data.refetch()} />
        ) : (
          // `isInsights` (checked above) has already excluded `'insights'`.
          <ReportBody c={c} reportKey={key as PartnerReportKey} data={data.data} />
        )}

        <SectionLabel c={c}>{t('reports.page.partyBalances')}</SectionLabel>
        <AppButton label={t('reports.page.checkDrift')} mode="text" onPress={checkDrift} />
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
  const { t } = useTranslation();
  if (!board) return <EmptyBlock c={c} title={t('reports.page.nothingToShow')} />;

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
  //
  // The second band is `info`, not `primary`. Now that the brand ramp is green
  // (see `constants/colors.ts`), a `primary` slice sat next to a `success` slice
  // would be two greens in the same legend and the band would stop being
  // readable. `info` is a real blue and is not used anywhere else in this chart.
  const AGEING_COLORS = [c.success, c.info, c.warning, c.error];

  return (
    <>
      <Card c={c}>
        <SummaryLine c={c} label={t('reports.insights.totalSales')} value={formatKpiValue(totalSales?.value ?? null, 'PAISE')} bold />
        <SummaryLine c={c} label={t('reports.insights.orders')} value={formatKpiValue(ordersCount?.value ?? null, 'COUNT')} />
        <SummaryLine c={c} label={t('reports.insights.bookings')} value={formatKpiValue(bookingsCount?.value ?? null, 'COUNT')} />
        <SummaryLine c={c} label={t('reports.insights.averageOrderValue')} value={formatKpiValue(aov?.value ?? null, 'PAISE')} />
        <SummaryLine
          c={c}
          label={t('reports.insights.grossMargin')}
          value={formatKpiValue(marginValue, 'PERCENT')}
          tone={marginValue !== null && marginValue < 0 ? 'warn' : undefined}
        />
        <SummaryLine
          c={c}
          label={t('reports.insights.receivablesOutstanding')}
          value={formatKpiValue(receivablesValue, 'PAISE')}
          tone={receivablesValue > 0 ? 'warn' : undefined}
        />
      </Card>

      <SectionLabel c={c}>{t('reports.insights.salesTrend')}</SectionLabel>
      <Card c={c}>
        {hasSales ? (
          <MiniBars c={c} points={salesSeries?.points ?? []} height={90} width={280} />
        ) : (
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('reports.insights.noSales')}</Text>
        )}
      </Card>

      <SectionLabel c={c}>{t('reports.insights.topItems')}</SectionLabel>
      {!topItems || topItems.rows.length === 0 ? (
        <Card c={c}>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('reports.insights.noItemSold')}</Text>
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

      <SectionLabel c={c}>{t('reports.insights.receivablesAgeing')}</SectionLabel>
      <Card c={c} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <DonutRing
          c={c}
          size={104}
          strokeWidth={14}
          centerValue={formatPaise(ageingTotal, { showDecimals: false })}
          centerLabel={t('reports.insights.outstandingCentre')}
          /* `r.label` is the SERVER's bucket name ("0-30", "90+") — data on the
             board, not copy this screen owns. */
          slices={ageingRows.map((r, i) => ({
            label: r.label,
            value: r.value,
            color: AGEING_COLORS[i % AGEING_COLORS.length],
          }))}
        />
        <View style={{ flex: 1, gap: 8 }}>
          {ageingTotal <= 0 ? (
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('reports.insights.nothingOutstanding')}</Text>
          ) : (
            ageingRows.map((r, i) => (
              <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: AGEING_COLORS[i % AGEING_COLORS.length] }} />
                <Text style={{ color: c.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={1}>
                  {r.label}
                </Text>
                <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: '600' }}>
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

/*
 * Every `row.name`, `row.itemName`, `row.typeLabel`, `row.status`, `row.unit`,
 * `bucket.label` and `notes[]` below is the SERVER's own text
 * (`partner-report.service.ts`), printed back as it came. Only this screen's
 * own frame around them is translated — the same trade `UsageMeter.tsx`
 * documents for `capacity.noun`.
 */
function ReportBody({ c, reportKey, data }: { c: ReturnType<typeof themeColors>; reportKey: PartnerReportKey; data: unknown }) {
  const { t } = useTranslation();
  if (!data) return <EmptyBlock c={c} title={t('reports.page.nothingToShow')} />;

  if (reportKey === 'sales' || reportKey === 'purchase') {
    const r = data as RegisterReport;
    return (
      <>
        <Card c={c}>
          <SummaryLine c={c} label={t('reports.body.grandTotal')} value={formatPaise(r.totals.grandPaise)} bold />
          <SummaryLine c={c} label={t('reports.body.receivedPaid')} value={formatPaise(r.totals.settledPaise)} />
          <SummaryLine c={c} label={t('reports.body.outstanding')} value={formatPaise(r.totals.outstandingPaise)} tone={r.totals.outstandingPaise > 0 ? 'warn' : undefined} />
          <SummaryLine c={c} label={t('reports.body.documents')} value={String(r.totals.count)} />
        </Card>
        {r.rows.length === 0 ? (
          <EmptyBlock c={c} title={t('reports.body.noDocuments')} />
        ) : (
          <Card c={c} style={{ padding: 0 }}>
            {r.rows.slice(0, 50).map((row, i) => (
              <View key={row.documentId} style={[styles.docRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                    {t('reports.body.docTitle', { number: row.number || row.typeLabel, party: row.partyName })}
                  </Text>
                  <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                    {t('reports.body.docMeta', { type: row.typeLabel, status: row.status })}
                  </Text>
                </View>
                <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }}>{formatPaise(row.grandPaise)}</Text>
              </View>
            ))}
            {r.rows.length > 50 && (
              <Text style={{ color: c.textDisabled, fontSize: 11, padding: 12 }}>
                {t('reports.body.moreRows', { count: r.rows.length - 50 })}
              </Text>
            )}
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
          <SummaryLine c={c} label={t('reports.body.revenue')} value={formatPaise(r.totals.revenuePaise)} bold />
          <SummaryLine c={c} label={t('reports.body.grossProfit')} value={formatPaise(r.totals.grossProfitPaise)} />
          <SummaryLine c={c} label={t('reports.body.margin')} value={t('reports.body.percent', { percent: (r.totals.marginBasisPoints / 100).toFixed(1) })} />
        </Card>
        {r.rows.length === 0 ? <EmptyBlock c={c} title={t('reports.body.noSales')} /> : (
          <Card c={c} style={{ padding: 0 }}>
            {r.rows.slice(0, 50).map((row, i) => (
              <View key={row.key} style={[styles.docRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{row.itemName}</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                    {t('reports.body.itemMeta', { qty: row.qtySold, unit: row.unit })}
                    {!row.costKnown ? t('reports.body.itemNoCost') : ''}
                  </Text>
                </View>
                <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }}>{formatPaise(row.revenuePaise)}</Text>
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
          <SummaryLine c={c} label={t('reports.body.revenue')} value={formatPaise(r.revenuePaise)} bold />
          <SummaryLine c={c} label={t('reports.body.costOfSales')} value={formatPaise(r.cogsPaise)} />
          <SummaryLine c={c} label={t('reports.body.grossProfit')} value={formatPaise(r.grossProfitPaise)} tone={r.grossProfitPaise >= 0 ? 'good' : 'warn'} />
          <SummaryLine c={c} label={t('reports.body.margin')} value={t('reports.body.percent', { percent: (r.marginBasisPoints / 100).toFixed(1) })} />
        </Card>
        {r.notes.map((n, i) => (
          <Text key={i} style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17 }}>{n}</Text>
        ))}
        {r.topByProfit.length > 0 && (
          <>
            <SectionLabel c={c}>{t('reports.body.topByProfit')}</SectionLabel>
            <Card c={c} style={{ padding: 0 }}>
              {r.topByProfit.slice(0, 20).map((row, i) => (
                <View key={row.key} style={[styles.docRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
                  <Text style={{ color: c.textPrimary, fontSize: 13, flex: 1 }} numberOfLines={1}>{row.itemName}</Text>
                  <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }}>{formatPaise(row.grossProfitPaise)}</Text>
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
    return r.rows.length === 0 ? <EmptyBlock c={c} title={t('reports.body.noTrading')} /> : (
      <Card c={c} style={{ padding: 0 }}>
        {r.rows.slice(0, 50).map((row, i) => (
          <View key={row.partyId} style={[styles.docRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{row.name}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                {t('reports.body.partyMeta', { sales: formatPaise(row.salesPaise), purchase: formatPaise(row.purchasePaise) })}
              </Text>
            </View>
            <Text style={{ color: row.closingBalancePaise > 0 ? c.error : c.textSecondary, fontWeight: '600', fontSize: 13 }}>
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
      <SectionLabel c={c}>{t('reports.body.receivablesSection')}</SectionLabel>
      <AgeingCard c={c} section={r.receivables} buckets={r.buckets} />
      <SectionLabel c={c}>{t('reports.body.payablesSection')}</SectionLabel>
      <AgeingCard c={c} section={r.payables} buckets={r.buckets} />
    </>
  );
}

function AgeingCard({ c, section, buckets }: { c: ReturnType<typeof themeColors>; section: AgeingReport['receivables']; buckets: AgeingReport['buckets'] }) {
  const { t } = useTranslation();
  if (section.rows.length === 0) {
    return <Card c={c}><Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('reports.body.nothingOpen')}</Text></Card>;
  }
  return (
    <Card c={c} style={{ padding: 0 }}>
      <View style={styles.docRow}>
        <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '600', flex: 1 }}>{t('reports.body.total')}</Text>
        <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 14 }}>{formatPaise(section.totals.netPaise)}</Text>
      </View>
      {section.rows.slice(0, 50).map((row, i) => (
        <View key={row.partyId} style={[styles.docRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{row.name}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>
              {t('reports.body.ageingMeta', {
                days: row.oldestDays,
                buckets: buckets
                  .map((b, bi) => t('reports.body.ageingBucket', {
                    label: b.label,
                    amount: formatPaise(row.buckets[bi] ?? 0, { showDecimals: false }),
                  }))
                  .join(' · '),
              })}
            </Text>
          </View>
          <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }}>{formatPaise(row.netPaise)}</Text>
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
      <Text style={{ color, fontWeight: bold ? '600' : '500', fontSize: bold ? 16 : 13 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  periodRow: { flexDirection: 'row', gap: 10 },
  periodInput: { flex: 1 },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetChip: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 },
  exportRow: { flexDirection: 'row', gap: 10 },
  exportBtn: { flex: 1 },
  docRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
