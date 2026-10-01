/**
 * How a boost's GST is said — pure, so the screen only draws lines.
 *
 * The backend (`partner-boost.controller.ts`, decision 8) stores `tax` on every
 * paid boost: the price is TAX-INCLUSIVE, so the charged amount never changes;
 * `tax` only says how it splits. Three cases:
 *   - `tax: null`  → a free boost, or one bought before GST was recorded: say nothing;
 *   - `gstApplicable: false` → "No GST charged" (ResiSmart's GSTIN not configured);
 *   - otherwise CGST + SGST (same state) or IGST (another state), on a taxable value.
 *
 * Returns catalogue KEYS and their values, never words — the screen translates.
 */

export interface BoostTax {
  gstApplicable: boolean;
  supplierGstin?: string;
  supplierStateCode?: string;
  placeOfSupplyCode?: string;
  interState: boolean;
  sac: string;
  ratePercent: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  grandPaise: number;
  note: string;
}

export interface TaxLine {
  key: string;
  values: Record<string, string | number>;
}

export function boostTaxLines(tax: BoostTax | null | undefined, money: (paise: number) => string): TaxLine[] {
  if (!tax) return [];
  if (!tax.gstApplicable) return [{ key: 'promotion.tax.noGst', values: {} }];
  const lines: TaxLine[] = [
    { key: 'promotion.tax.taxable', values: { amount: money(tax.taxablePaise) } },
  ];
  if (tax.interState) {
    lines.push({ key: 'promotion.tax.igst', values: { rate: tax.ratePercent, amount: money(tax.igstPaise) } });
  } else {
    const half = tax.ratePercent / 2;
    lines.push({ key: 'promotion.tax.cgst', values: { rate: half, amount: money(tax.cgstPaise) } });
    lines.push({ key: 'promotion.tax.sgst', values: { rate: half, amount: money(tax.sgstPaise) } });
  }
  lines.push({ key: 'promotion.tax.total', values: { amount: money(tax.grandPaise) } });
  return lines;
}
