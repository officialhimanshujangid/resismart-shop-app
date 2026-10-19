import axios from 'axios';
import { apiClient } from './axios';
import { AI_ERROR_CODES, type AiErrorCode } from './ai.api';

/**
 * AI-4 — the partner AI drafts, shop-app side. Same verbs, codes and rules as the
 * website (`frontend/src/lib/ai-partner.ts`):
 *
 *   P1  `POST /partners/me/ai/product-draft`        multipart `photo` + `notes`
 *   P2  `POST /partners/me/ai/purchase-bill-draft`  multipart `file`
 *
 * The server answers a DRAFT for the EXISTING form (Add product / a new purchase
 * bill) — it saves nothing. Whether the cards show at all comes from
 * `GET /ai/status` (Owner console: per partner plan, per business, default OFF).
 */

export type AiPartnerStatus = { available: boolean; productDraft: boolean; purchaseDraft: boolean; consent: boolean };
export const AI_PARTNER_OFF: AiPartnerStatus = { available: false, productDraft: false, purchaseDraft: false, consent: false };

export const AI_PARTNER_ERROR_CODES = [
  'AI_PARTNER_FILE_INVALID', 'AI_PRODUCT_UNREADABLE', 'AI_PRODUCT_NOT_A_PRODUCT', 'AI_PURCHASE_UNREADABLE', 'AI_PURCHASE_NOT_A_BILL',
] as const;
export type AiPartnerErrorCode = typeof AI_PARTNER_ERROR_CODES[number];

export const AI_PRODUCT_WARNINGS = ['LOW_CONFIDENCE', 'NAME_UNCLEAR', 'CATEGORY_NONE', 'UNIT_UNSURE', 'TAX_VERIFY', 'SIMILAR_PRODUCT', 'PRICE_REMOVED'] as const;
export type AiProductWarning = typeof AI_PRODUCT_WARNINGS[number];
export const AI_PURCHASE_WARNINGS = [
  'LOW_CONFIDENCE', 'SUPPLIER_UNCLEAR', 'SUPPLIER_NEW', 'SUPPLIER_GSTIN_DIFFERENT', 'GSTIN_INVALID',
  'BILL_NUMBER_MISSING', 'DATE_UNCLEAR', 'DATE_FUTURE', 'TOTAL_MISSING', 'TOTAL_MISMATCH',
  'LINES_MISSING', 'LINES_UNMATCHED', 'LINES_TO_CHECK', 'BANK_DETAILS_HIDDEN', 'DUPLICATE_BILL',
] as const;
export type AiPurchaseWarning = typeof AI_PURCHASE_WARNINGS[number];
export const AI_PURCHASE_LINE_WARNINGS = ['QTY_UNCLEAR', 'RATE_UNCLEAR', 'UNIT_DIFFERS', 'PRODUCT_INACTIVE', 'TAX_VERIFY'] as const;
export type AiPurchaseLineWarning = typeof AI_PURCHASE_LINE_WARNINGS[number];

export const AI_NOTES_MAX = 300;
const UNITS = ['PCS', 'BOX', 'KG', 'LTR', 'PKT', 'DOZ', 'GM', 'ML'] as const;

export type AiProductDraft = {
  name: string;
  description: { en: string; hi: string };
  category: { id: string; name: string } | null;
  unit: typeof UNITS[number];
  hsnCode: string | null;
  gstRatePercent: number | null;
  similar: { id: string; name: string } | null;
  warnings: AiProductWarning[];
};
export type AiSupplierView = {
  _id: string; name: string; gstin: string | null; phone: string | null; kind: string;
  billingAddress: Record<string, string> | null; outstandingPaise: number; isWalkIn: boolean; isActive: boolean;
};
export type AiLineMatch =
  | { kind: 'CODE' | 'NAME' | 'LIKELY'; productId: string; productName: string; productUnit: string }
  | { kind: 'NONE' };
export type AiPurchaseLine = {
  name: string; hsn: string | null; qty: number; unit: string; ratePaise: number; gstRatePercent: number | null;
  match: AiLineMatch;
  newProduct: { name: string; hsnCode: string | null; unit: string; gstRatePercent: number | null } | null;
  warnings: AiPurchaseLineWarning[];
};
export type AiPurchaseDraft = {
  supplier: { name: string | null; gstin: string | null; gstinValid: boolean; match: { kind: 'GSTIN' | 'NAME'; party: AiSupplierView } | { kind: 'NONE' }; suggestions: AiSupplierView[] };
  billNumber: string | null;
  billDate: string | null;
  lines: AiPurchaseLine[];
  totals: { taxablePaise: number | null; taxPaise: number | null; totalPaise: number | null };
  duplicate: { id: string; supplierInvoiceNo: string; date: string } | null;
  canAddProducts: boolean;
  warnings: AiPurchaseWarning[];
};

const rec = (v: unknown): Record<string, any> => (v && typeof v === 'object' ? (v as Record<string, any>) : {});
const body = (r: { data: unknown }) => rec(rec(r.data).data ?? r.data);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const listOf = <T extends string>(v: unknown, allowed: readonly T[]): T[] => (Array.isArray(v) ? v.filter((x): x is T => (allowed as readonly unknown[]).includes(x)) : []);

export function toAiPartnerStatus(raw: unknown): AiPartnerStatus {
  const d = rec(raw);
  const f = rec(d.features);
  const available = d.available === true;
  return { available, productDraft: available && f.productDraft === true, purchaseDraft: available && f.purchaseDraft === true, consent: rec(d.consent).given === true };
}

export function toAiProductDraft(raw: unknown): AiProductDraft {
  const d = rec(raw);
  const desc = rec(d.description);
  const cat = rec(d.category);
  const sim = rec(d.similar);
  return {
    name: String(d.name ?? ''),
    description: { en: String(desc.en ?? ''), hi: String(desc.hi ?? '') },
    category: typeof cat.id === 'string' && cat.id ? { id: cat.id, name: String(cat.name ?? '') } : null,
    unit: (UNITS as readonly string[]).includes(d.unit) ? d.unit : 'PCS',
    hsnCode: str(d.hsnCode),
    gstRatePercent: numOrNull(d.gstRatePercent),
    similar: typeof sim.id === 'string' && sim.id ? { id: sim.id, name: String(sim.name ?? '') } : null,
    warnings: listOf(d.warnings, AI_PRODUCT_WARNINGS),
  };
}

const toSupplier = (v: unknown): AiSupplierView | null => {
  const p = rec(v);
  if (typeof p._id !== 'string' || !p._id) return null;
  return {
    _id: p._id, name: String(p.name ?? ''), gstin: str(p.gstin), phone: str(p.phone), kind: String(p.kind || 'SUPPLIER'),
    billingAddress: p.billingAddress && typeof p.billingAddress === 'object' ? p.billingAddress : null,
    outstandingPaise: num(p.outstandingPaise), isWalkIn: p.isWalkIn === true, isActive: p.isActive !== false,
  };
};

export function toAiPurchaseDraft(raw: unknown): AiPurchaseDraft {
  const d = rec(raw);
  const s = rec(d.supplier);
  const m = rec(s.match);
  const party = toSupplier(m.party);
  const dup = rec(d.duplicate);
  const t = rec(d.totals);
  return {
    supplier: {
      name: str(s.name), gstin: str(s.gstin), gstinValid: s.gstinValid === true,
      match: (m.kind === 'GSTIN' || m.kind === 'NAME') && party ? { kind: m.kind, party } : { kind: 'NONE' },
      suggestions: (Array.isArray(s.suggestions) ? s.suggestions : []).map(toSupplier).filter((x): x is AiSupplierView => !!x),
    },
    billNumber: str(d.billNumber),
    billDate: typeof d.billDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.billDate) ? d.billDate : null,
    lines: (Array.isArray(d.lines) ? d.lines : []).map(rec).filter((l) => typeof l.name === 'string' && l.name).map((l): AiPurchaseLine => {
      const lm = rec(l.match);
      const np = rec(l.newProduct);
      return {
        name: l.name, hsn: str(l.hsn), qty: num(l.qty) || 1, unit: String(l.unit || 'PCS'), ratePaise: Math.max(0, Math.round(num(l.ratePaise))),
        gstRatePercent: numOrNull(l.gstRatePercent),
        match: (lm.kind === 'CODE' || lm.kind === 'NAME' || lm.kind === 'LIKELY') && typeof lm.productId === 'string'
          ? { kind: lm.kind, productId: lm.productId, productName: String(lm.productName ?? ''), productUnit: String(lm.productUnit ?? 'PCS') }
          : { kind: 'NONE' },
        newProduct: typeof np.name === 'string' && np.name ? { name: np.name, hsnCode: str(np.hsnCode), unit: String(np.unit || 'PCS'), gstRatePercent: numOrNull(np.gstRatePercent) } : null,
        warnings: listOf(l.warnings, AI_PURCHASE_LINE_WARNINGS),
      };
    }),
    totals: { taxablePaise: numOrNull(t.taxablePaise), taxPaise: numOrNull(t.taxPaise), totalPaise: numOrNull(t.totalPaise) },
    duplicate: typeof dup.id === 'string' && dup.id ? { id: dup.id, supplierInvoiceNo: String(dup.supplierInvoiceNo ?? ''), date: String(dup.date ?? '') } : null,
    canAddProducts: d.canAddProducts === true,
    warnings: listOf(d.warnings, AI_PURCHASE_WARNINGS),
  };
}

export type PickedFile = { uri: string; name: string; mimeType: string };
const part = (f: PickedFile) => ({ uri: f.uri, name: f.name, type: f.mimeType }) as unknown as Blob;
const lang = (l: string) => (l === 'hi' ? 'hi' : 'en');

export const aiPartnerApi = {
  /** Fails closed: any error = no AI card. */
  async status(): Promise<AiPartnerStatus> {
    try {
      return toAiPartnerStatus(body(await apiClient.get('/ai/status', { params: { app: 'shop' } })));
    } catch {
      return AI_PARTNER_OFF;
    }
  },
  async productDraft(file: PickedFile, notes: string, language: string): Promise<{ photoUrl: string; draft: AiProductDraft }> {
    const form = new FormData();
    form.append('notes', notes.slice(0, AI_NOTES_MAX));
    form.append('photo', part(file));
    const b = body(await apiClient.post(`/partners/me/ai/product-draft?lang=${lang(language)}`, form, { headers: { 'Content-Type': undefined }, timeout: 90_000 }));
    return { photoUrl: String(rec(b.photo).url ?? ''), draft: toAiProductDraft(b.draft) };
  },
  async purchaseDraft(file: PickedFile, language: string): Promise<AiPurchaseDraft> {
    const form = new FormData();
    form.append('file', part(file));
    const b = body(await apiClient.post(`/partners/me/ai/purchase-bill-draft?lang=${lang(language)}`, form, { headers: { 'Content-Type': undefined }, timeout: 120_000 }));
    return toAiPurchaseDraft(b.draft);
  },
};

/** A refusal: an AI gate code (`ai.errors.*`), a partner code (`aiPartner.errors.*`), the server's sentence, a kept photo (P1). */
export function aiPartnerRefusal(e: unknown): { aiCode: AiErrorCode | null; partnerCode: AiPartnerErrorCode | null; message: string; photoUrl: string | null } {
  const data = axios.isAxiosError(e) ? rec(e.response?.data) : rec(rec(rec(e).response).data);
  const code = typeof data.code === 'string' ? data.code : '';
  const url = rec(data.photo).url;
  return {
    aiCode: (AI_ERROR_CODES as readonly string[]).includes(code) ? code as AiErrorCode : null,
    partnerCode: (AI_PARTNER_ERROR_CODES as readonly string[]).includes(code) ? code as AiPartnerErrorCode : null,
    message: typeof data.message === 'string' ? data.message : '',
    photoUrl: typeof url === 'string' && url.startsWith('https://') ? url : null,
  };
}
