/**
 * A PREVIEW of what the server will charge — copied line for line from
 * `backend/src/utils/partner-tax.util.ts`, never re-derived.
 *
 * The server is still the only thing that TAXES a document: nothing here is
 * ever sent up, and `partner-billing.validator.ts` refuses a tax field from a
 * client anyway. What this file buys is that the shopkeeper can see the tax
 * BEFORE tapping Issue, on the phone, where the whole point of the app is that
 * the bill is settled at the counter with the customer standing there.
 *
 * It is copied rather than approximated because an approximation is worse than
 * nothing: a preview that rounds differently from the number that gets filed
 * teaches a shopkeeper to distrust the total that actually matters. The same
 * mirror already exists on the web
 * (`frontend/src/app/(dashboard)/dashboard/partner/documents/shared.ts`), and
 * this is the third copy of the same arithmetic by necessity — a phone cannot
 * import a backend file. Three copies that agree are the cost; the thing to
 * never do is a fourth that is "close enough".
 *
 * IF THE SERVER'S FUNCTION CHANGES, THIS FILE CHANGES IN THE SAME COMMIT.
 *
 * The four rules it carries over verbatim:
 *   1. Place of supply decides CGST+SGST vs IGST. Never both, never neither.
 *   2. Inclusive tax is derived by SUBTRACTION, so the line totals the shelf
 *      price exactly; exclusive tax is added on top.
 *   3. Round off the DOCUMENT once, not each line.
 *   4. Integer paise throughout.
 */

/**
 * Mirrors `GST_STATE_CODES` in `partner-tax.util.ts`. A second table, not a
 * second scheme: comparing raw state strings calls "Delhi" and "DELHI " two
 * different places of supply and puts IGST on a counter sale.
 */
const GST_STATE_CODES: Readonly<Record<string, string>> = Object.freeze({
  'JAMMU AND KASHMIR': '01',
  'HIMACHAL PRADESH': '02',
  PUNJAB: '03',
  CHANDIGARH: '04',
  UTTARAKHAND: '05',
  HARYANA: '06',
  DELHI: '07',
  RAJASTHAN: '08',
  'UTTAR PRADESH': '09',
  BIHAR: '10',
  SIKKIM: '11',
  'ARUNACHAL PRADESH': '12',
  NAGALAND: '13',
  MANIPUR: '14',
  MIZORAM: '15',
  TRIPURA: '16',
  MEGHALAYA: '17',
  ASSAM: '18',
  'WEST BENGAL': '19',
  JHARKHAND: '20',
  ODISHA: '21',
  CHHATTISGARH: '22',
  'MADHYA PRADESH': '23',
  GUJARAT: '24',
  'DADRA AND NAGAR HAVELI AND DAMAN AND DIU': '26',
  MAHARASHTRA: '27',
  KARNATAKA: '29',
  GOA: '30',
  LAKSHADWEEP: '31',
  KERALA: '32',
  'TAMIL NADU': '33',
  PUDUCHERRY: '34',
  'ANDAMAN AND NICOBAR ISLANDS': '35',
  TELANGANA: '36',
  'ANDHRA PRADESH': '37',
  LADAKH: '38',
  'OTHER TERRITORY': '97',
});

/** Mirrors `stateKey` — same normalisation, same deliberate fallback for an unrecognised name. */
const stateKey = (state?: string | null): string => {
  const cleaned = String(state ?? '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const asCode = cleaned.match(/^(\d{1,2})\b/);
  if (asCode) return asCode[1].padStart(2, '0');
  return GST_STATE_CODES[cleaned] ?? cleaned;
};

/**
 * Mirrors `isInterStateSupply`. A BLANK place of supply is intra-state, the
 * same safe default the server takes: the place of supply for an
 * over-the-counter sale is the shop's own state, and defaulting the other way
 * would put IGST on every walk-in bill.
 */
export const isInterStatePreview = (supplierState?: string | null, placeOfSupply?: string | null): boolean => {
  const place = stateKey(placeOfSupply);
  if (!place) return false;
  return place !== stateKey(supplierState);
};

export interface TaxPreviewLineInput {
  qty: number;
  ratePaise: number;
  taxRatePercent?: number;
  cessRatePercent?: number;
  taxInclusive?: boolean;
  discountPaise?: number;
}

export interface TaxPreviewLine {
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  taxRatePercent: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  totalPaise: number;
}

export interface TaxPreviewTotals {
  subPaise: number;
  discountPaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  roundOffPaise: number;
  grandPaise: number;
}

/** Mirrors `splitHalves` — the halves come OUT of the pool so `cgst + sgst === pool` exactly. */
const splitHalves = (pool: number): { cgstPaise: number; sgstPaise: number } => {
  const cgstPaise = Math.floor(pool / 2);
  return { cgstPaise, sgstPaise: pool - cgstPaise };
};

/** Mirrors `computeLine`. The inclusive branch subtracts; it must not multiply back up. */
function previewLine(line: TaxPreviewLineInput, interState: boolean, gstApplicable: boolean): TaxPreviewLine {
  const taxRatePercent = gstApplicable ? Math.max(0, line.taxRatePercent ?? 0) : 0;
  const cessRatePercent = gstApplicable ? Math.max(0, line.cessRatePercent ?? 0) : 0;
  // `?? true` matches the server's own default, and the server's default is
  // what an omitted flag becomes on the stored line.
  const inclusive = line.taxInclusive ?? true;

  const grossPaise = Math.round(line.qty * line.ratePaise);
  const discountPaise = Math.min(Math.max(0, Math.round(line.discountPaise ?? 0)), Math.max(0, grossPaise));
  const netPaise = grossPaise - discountPaise;

  let taxablePaise: number;
  let gstPaise: number;
  let cessPaise: number;

  if (taxRatePercent <= 0 && cessRatePercent <= 0) {
    taxablePaise = netPaise;
    gstPaise = 0;
    cessPaise = 0;
  } else if (inclusive) {
    taxablePaise = Math.round((netPaise * 100) / (100 + taxRatePercent + cessRatePercent));
    const pool = netPaise - taxablePaise;
    cessPaise = Math.min(Math.round((taxablePaise * cessRatePercent) / 100), pool);
    gstPaise = pool - cessPaise;
  } else {
    taxablePaise = netPaise;
    gstPaise = Math.round((taxablePaise * taxRatePercent) / 100);
    cessPaise = Math.round((taxablePaise * cessRatePercent) / 100);
  }

  const split = interState
    ? { cgstPaise: 0, sgstPaise: 0, igstPaise: gstPaise }
    : { ...splitHalves(gstPaise), igstPaise: 0 };

  return {
    grossPaise,
    discountPaise,
    taxablePaise,
    taxRatePercent,
    ...split,
    cessPaise,
    totalPaise: taxablePaise + split.cgstPaise + split.sgstPaise + split.igstPaise + cessPaise,
  };
}

/** Mirrors `computeDocumentTax`: every line, then the totals, then ONE round-off. */
export function previewDocumentTax(
  lines: TaxPreviewLineInput[],
  supplierState: string | undefined,
  placeOfSupply: string | undefined,
  opts: { gstApplicable?: boolean; reverseCharge?: boolean; roundOff?: boolean } = {},
): { lines: TaxPreviewLine[]; totals: TaxPreviewTotals; interState: boolean } {
  const interState = isInterStatePreview(supplierState, placeOfSupply);
  const gstApplicable = opts.gstApplicable ?? true;
  const priced = lines.map((l) => previewLine(l, interState, gstApplicable));

  const sum = (pick: (l: TaxPreviewLine) => number) => priced.reduce((t, l) => t + pick(l), 0);
  const subPaise = sum((l) => l.taxablePaise);
  const cgstPaise = sum((l) => l.cgstPaise);
  const sgstPaise = sum((l) => l.sgstPaise);
  const igstPaise = sum((l) => l.igstPaise);
  const cessPaise = sum((l) => l.cessPaise);
  const taxPaise = cgstPaise + sgstPaise + igstPaise + cessPaise;

  const payablePaise = subPaise + (opts.reverseCharge ? 0 : taxPaise);
  const roundOffPaise = (opts.roundOff ?? true) ? Math.round(payablePaise / 100) * 100 - payablePaise : 0;

  return {
    lines: priced,
    totals: {
      subPaise,
      discountPaise: sum((l) => l.discountPaise),
      taxPaise,
      cgstPaise,
      sgstPaise,
      igstPaise,
      cessPaise,
      roundOffPaise,
      grandPaise: payablePaise + roundOffPaise,
    },
    interState,
  };
}

/** The slabs the web's line grid offers (`shared.ts#TAX_SLABS`), so the two screens speak one vocabulary. */
export const TAX_SLABS = [0, 5, 12, 18, 28] as const;

/**
 * `shared.ts#DOC_UNITS` plus `JOB`, which only this app produces: a bill raised
 * from a completed service booking seeds one line whose unit is JOB, and
 * dropping it from the picker would silently rewrite that line to PCS the first
 * time the partner opened the editor on it.
 */
export const DOC_UNITS = ['PCS', 'BOX', 'KG', 'LTR', 'PKT', 'DOZ', 'JOB'] as const;
