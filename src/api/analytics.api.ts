import { apiClient } from './axios';
import { formatPaise } from '../lib/money';

/**
 * The Phase-0 envelope every analytics board (web panel, society app, shop
 * app) renders from — see `backend/src/services/analytics/analytics.types.ts`,
 * whose header spells out why: one shape for all consumers so "the shop shows
 * a different total from the panel" cannot happen. Hand-copied here rather
 * than pulled from `types/api-contract.generated.ts`, which does not carry it
 * either — same reasoning `today.types.ts` and `booking.types.ts` give for
 * their own hand-copied unions.
 *
 * The two rules that matter to every screen reading this file:
 *
 *   - **Money is paise, always.** Format at the edge with `formatPaise` —
 *     never before.
 *   - **`null` is not `0`.** A `Kpi.value` of `null` means "genuinely not
 *     computable" (see `reason`) and renders `—`, never a fabricated zero.
 */
export type KpiUnit = 'COUNT' | 'PAISE' | 'PERCENT' | 'MINUTES' | 'RATING';
export type GoodWhen = 'UP' | 'DOWN' | 'NEUTRAL';
export type Direction = 'UP' | 'DOWN' | 'FLAT' | null;
export type Granularity = 'day' | 'week' | 'month';

export interface Kpi {
  key: string;
  label: string;
  /** `null` = genuinely not computable — never a stand-in `0`. See `reason`. */
  value: number | null;
  unit: KpiUnit;
  previous: number | null;
  deltaPercent: number | null;
  direction: Direction;
  goodWhen: GoodWhen;
  reason?: string;
  href?: string;
}

/** One point on a dense time axis. An empty bucket is `0`, never `null` — only a genuinely unknown bucket is. */
export interface SeriesPoint {
  t: string;
  v: number | null;
}

export interface Series {
  key: string;
  label: string;
  unit: KpiUnit;
  points: SeriesPoint[];
}

export interface BreakdownRow {
  label: string;
  value: number;
  /** 0..1 of the breakdown's total. */
  share: number;
  meta?: Record<string, string | number>;
}

export interface Breakdown {
  key: string;
  label: string;
  rows: BreakdownRow[];
}

export interface AnalyticsRange {
  from: string;
  to: string;
  granularity: Granularity;
  timezone: string;
}

export interface AnalyticsBoard {
  range: AnalyticsRange;
  kpis: Kpi[];
  series: Series[];
  breakdowns: Breakdown[];
  generatedAt: string;
  cachedAt?: string;
}

export interface OverviewQuery {
  from?: string;
  to?: string;
  granularity?: Granularity;
}

/**
 * `GET /analytics/partner/today` and `GET /analytics/partner/overview` —
 * both `enforcePartnerScope` only, neither gated on a plan module (see the
 * route files), so both are safe to call for any signed-in partner.
 */
export const analyticsApi = {
  /**
   * Today's sale, order count, pending decisions, low-stock count and a
   * 14-day sparkline — replaces the client-side `limit: 100` sum
   * `today.api.ts` used to do (see that file's header, now trimmed).
   */
  today: () =>
    apiClient
      .get<{ success: boolean; board: AnalyticsBoard }>('/analytics/partner/today')
      .then((r) => r.data.board),

  /** Sales trend, top items, category mix, receivables ageing, utilisation, AOV, 8 KPIs. Defaults to the current calendar month server-side. */
  overview: (query?: OverviewQuery) =>
    apiClient
      .get<{ success: boolean; board: AnalyticsBoard }>('/analytics/partner/overview', { params: query })
      .then((r) => r.data.board),
};

/** One KPI by key, or `undefined` if this board does not carry it. */
export function findKpi(board: AnalyticsBoard | undefined, key: string): Kpi | undefined {
  return board?.kpis.find((k) => k.key === key);
}

/** One series by key. */
export function findSeries(board: AnalyticsBoard | undefined, key: string): Series | undefined {
  return board?.series.find((s) => s.key === key);
}

/** One breakdown by key. */
export function findBreakdown(board: AnalyticsBoard | undefined, key: string): Breakdown | undefined {
  return board?.breakdowns.find((b) => b.key === key);
}

/**
 * `Kpi.value` → the string a tile shows — the one place every screen reading
 * this board turns a unit into text, so a PAISE KPI is never rendered as a raw
 * integer on one screen and a rupee figure on another. `null` always renders
 * `—`, per the envelope's own rule (`analytics.types.ts` on the server).
 */
export function formatKpiValue(kpiValue: number | null, unit: KpiUnit): string {
  if (kpiValue === null) return '—';
  switch (unit) {
    case 'PAISE':
      return formatPaise(kpiValue);
    case 'PERCENT':
      return `${kpiValue.toFixed(1)}%`;
    case 'MINUTES':
      return `${Math.round(kpiValue)} min`;
    case 'RATING':
      return kpiValue.toFixed(1);
    case 'COUNT':
    default:
      return new Intl.NumberFormat('en-IN').format(kpiValue);
  }
}

/**
 * Green/red for a KPI's delta arrow, decided by combining the server's
 * `goodWhen` with its own `direction` — never re-derived per screen (see the
 * server's `kpi.util.ts` header for why this pairing is computed once).
 * `null` (no baseline, or `FLAT`) is neutral, not a colour.
 */
export function kpiToneColor(
  k: Pick<Kpi, 'direction' | 'goodWhen'>,
  c: { success: string; error: string; textSecondary: string },
): string {
  if (!k.direction || k.direction === 'FLAT' || k.goodWhen === 'NEUTRAL') return c.textSecondary;
  const isGood = k.direction === k.goodWhen;
  return isGood ? c.success : c.error;
}
