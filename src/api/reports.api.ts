import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiClient, ApiEnvelope, unwrap } from './axios';
import i18n from '../i18n';

/**
 * `/partners/me/reports` — the eight business reports plus the party-balance
 * drift check, mirroring `backend/src/services/partner-report.service.ts`.
 *
 * Two of the eight (`gstr1`, `gstr3b`) are deliberately NOT given a typed JSON
 * shape here and never fetched as JSON by the screen — see the header on
 * `reports/index.tsx` for why a GST return is export-only on a phone. Every
 * other report is read on screen AND exportable, from the one query, exactly
 * as the server's `report()` registry guarantees (spec: "the file a partner
 * downloads is the screen they downloaded it from").
 */

/**
 * `i18n.t` on the singleton rather than a `t` handed in by the screen — nothing
 * in this module is a React component, so there is no hook to read, and
 * `exportReport`'s only caller reaches the sentence below through
 * `apiErrorMessage`, which prefers a thrown message over the fallback it passes.
 * `features/billing/pdf.ts` records the same reasoning at length; this is the
 * second module to need it, not a second translator.
 */
const t = (key: string, vars?: Record<string, string>): string => i18n.t(key, vars ?? {});

export const PARTNER_REPORT_KEYS = [
  'sales', 'purchase', 'gstr1', 'gstr3b', 'items', 'parties', 'outstanding', 'profit',
  // P1 (CONTRACT-partner-P1 §8/§9): export-only on the Reports screen; P&L is
  // also read on screen under Money → Profit & loss.
  'pnl', 'stock-valuation', 'expenses', 'cmp08',
  // P2 (B5): listed by GET /reports only when the business-type module is on and
  // the viewer holds its grant; export-only here (PDF / Excel).
  'near-expiry-value', 'subscription-collections', 'appointment-utilisation', 'job-conversion',
] as const;
export type PartnerReportKey = typeof PARTNER_REPORT_KEYS[number];
export const P2_REPORT_KEYS = ['near-expiry-value', 'subscription-collections', 'appointment-utilisation', 'job-conversion'] as const;
export type P2ReportKey = typeof P2_REPORT_KEYS[number];
export const isP2ReportKey = (k: string): k is P2ReportKey => (P2_REPORT_KEYS as readonly string[]).includes(k);

export interface ReportListEntry {
  key: PartnerReportKey;
  label: string;
}

export interface ReportQuery {
  from?: string;
  to?: string;
  asOf?: string;
  partyId?: string;
  type?: string;
  side?: 'CUSTOMER' | 'SUPPLIER';
}

export interface ReportWindow {
  from: string;
  to: string;
}

// ─────────────────────────────────────────────────────── sales / purchase

export interface RegisterRow {
  documentId: string;
  type: string;
  typeLabel: string;
  number?: string;
  documentDate: string;
  partyName: string;
  gstin?: string;
  placeOfSupply?: string;
  status: string;
  reverseCharge: boolean;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  roundOffPaise: number;
  grandPaise: number;
  settledPaise: number;
  outstandingPaise: number;
}

export interface RegisterReport {
  direction: 'SALES' | 'PURCHASE';
  period: ReportWindow;
  rows: RegisterRow[];
  totals: {
    count: number;
    taxablePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    cessPaise: number;
    grandPaise: number;
    settledPaise: number;
    outstandingPaise: number;
  };
}

// ────────────────────────────────────────────────────────────────── items

export interface ItemActivityRow {
  key: string;
  itemId?: string;
  itemName: string;
  hsn?: string;
  unit: string;
  qtySold: number;
  revenuePaise: number;
  taxPaise: number;
  qtyPurchased: number;
  purchaseValuePaise: number;
  avgCostPaise?: number;
  cogsPaise: number;
  grossProfitPaise: number;
  marginBasisPoints: number;
  costKnown: boolean;
}

export interface ItemWiseReport {
  period: ReportWindow;
  rows: ItemActivityRow[];
  totals: {
    qtySold: number;
    revenuePaise: number;
    taxPaise: number;
    cogsPaise: number;
    grossProfitPaise: number;
    marginBasisPoints: number;
  };
  uncostedItems: { itemName: string; revenuePaise: number }[];
}

// ───────────────────────────────────────────────────────────────── profit

export interface GrossProfitReport {
  period: ReportWindow;
  documentCount: number;
  revenuePaise: number;
  cogsPaise: number;
  grossProfitPaise: number;
  marginBasisPoints: number;
  costedRevenuePaise: number;
  costedMarginBasisPoints: number;
  uncostedRevenuePaise: number;
  uncostedItems: { itemName: string; revenuePaise: number }[];
  topByProfit: ItemActivityRow[];
  notes: string[];
}

// ──────────────────────────────────────────────────────────────── parties

export interface PartyWiseRow {
  partyId: string;
  name: string;
  kind: string;
  gstin?: string;
  phone?: string;
  salesPaise: number;
  salesReturnPaise: number;
  purchasePaise: number;
  purchaseReturnPaise: number;
  receivedPaise: number;
  paidPaise: number;
  closingBalancePaise: number;
}

export interface PartyWiseReport {
  period: ReportWindow;
  rows: PartyWiseRow[];
  totals: Omit<PartyWiseRow, 'partyId' | 'name' | 'kind' | 'gstin' | 'phone'>;
}

// ─────────────────────────────────────────────────────────────── outstanding

export interface AgeingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
}

export interface AgeingPartyRow {
  partyId: string;
  name: string;
  kind: string;
  phone?: string;
  buckets: number[];
  totalPaise: number;
  onAccountPaise: number;
  netPaise: number;
  oldestDays: number;
  documentCount: number;
}

export interface AgeingSection {
  side: 'CUSTOMER' | 'SUPPLIER';
  rows: AgeingPartyRow[];
  totals: { buckets: number[]; totalPaise: number; onAccountPaise: number; netPaise: number };
}

export interface AgeingReport {
  asOf: string;
  buckets: AgeingBucket[];
  receivables: AgeingSection;
  payables: AgeingSection;
  notes: string[];
}

// ───────────────────────────────────────────────────────────────── drift

export interface PartyDrift {
  partyId: string;
  name: string;
  kind: string;
  cachedOutstandingPaise: number;
  ledgerOutstandingPaise: number;
  driftPaise: number;
  outstandingRecomputedAt?: string;
}

export type ReportExportFormat = 'pdf' | 'xlsx';

export const reportsApi = {
  index: () => apiClient.get<ApiEnvelope<ReportListEntry[]>>('/partners/me/reports').then((r) => unwrap(r.data)),

  drift: (side?: 'CUSTOMER' | 'SUPPLIER') =>
    apiClient
      .get<ApiEnvelope<PartyDrift[]>>('/partners/me/reports/drift', { params: side ? { side } : undefined })
      .then((r) => unwrap(r.data)),

  register: (key: 'sales' | 'purchase', query: ReportQuery) =>
    apiClient
      .get<ApiEnvelope<RegisterReport>>(`/partners/me/reports/${key}`, { params: query })
      .then((r) => unwrap(r.data)),

  /** P2 (B5): one business-type report as JSON (es.body.data), drawn by P2ReportSummary. */
  p2: (key: P2ReportKey, query: ReportQuery) =>
    apiClient
      .get<ApiEnvelope<Record<string, unknown>>>(`/partners/me/reports/${key}`, { params: query })
      .then((r) => unwrap(r.data)),

  items: (query: ReportQuery) =>
    apiClient
      .get<ApiEnvelope<ItemWiseReport>>('/partners/me/reports/items', { params: query })
      .then((r) => unwrap(r.data)),

  profit: (query: ReportQuery) =>
    apiClient
      .get<ApiEnvelope<GrossProfitReport>>('/partners/me/reports/profit', { params: query })
      .then((r) => unwrap(r.data)),

  parties: (query: ReportQuery) =>
    apiClient
      .get<ApiEnvelope<PartyWiseReport>>('/partners/me/reports/parties', { params: query })
      .then((r) => unwrap(r.data)),

  outstanding: (query: ReportQuery) =>
    apiClient
      .get<ApiEnvelope<AgeingReport>>('/partners/me/reports/outstanding', { params: query })
      .then((r) => unwrap(r.data)),
};

/**
 * Download a report as PDF/Excel and hand it to the OS share sheet.
 *
 * `responseType: 'arraybuffer'` rather than a blob URL — this is React
 * Native, there is no blob URL to hand a `<a download>`. The bytes are
 * written straight to `Paths.cache` with SDK 54's `File` API (the old
 * `FileSystem.writeAsStringAsync(..., { encoding: 'base64' })` call this
 * app's training data would reach for was replaced this SDK — see
 * `mobile-shop/AGENTS.md`), then handed to `expo-sharing`, which is how a
 * shop owner actually gets a GSTR-1 export onto WhatsApp or their CA's email:
 * this app has no SMTP client and should not grow one for a report screen.
 */
export async function exportReport(
  key: PartnerReportKey,
  format: ReportExportFormat,
  query: ReportQuery,
): Promise<void> {
  const response = await apiClient.get<ArrayBuffer>(`/partners/me/reports/${key}`, {
    params: { ...query, format },
    responseType: 'arraybuffer',
    timeout: 60_000, // an eight-report registry over a full financial year is not a 30-second request
  });

  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  const mimeType = format === 'pdf' ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const file = new File(Paths.cache, `${key}-${Date.now()}.${ext}`);
  file.write(new Uint8Array(response.data));

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error(t('reports.share.sharingUnavailable'));
  }
  // The report's own name, from the SAME catalogue entry the chip row on
  // `reports/index.tsx` reads — so the share sheet and the tab the partner
  // tapped to get here cannot end up calling the report two different things.
  await Sharing.shareAsync(file.uri, {
    mimeType,
    dialogTitle: t('reports.share.dialogTitle', { label: t(`reports.tab.${key}`) }),
  });
}
