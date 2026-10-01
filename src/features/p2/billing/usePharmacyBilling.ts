import { useEffect, useMemo, useState } from 'react';

import { useCategoryModules, useModuleSettings } from '../useCategoryModules';
import { pharmacyApi } from '../../pharmacy/api';
import { isScheduleX, needsRx } from '../../pharmacy/logic';
import type { PartnerDocumentType } from '../../billing/types';

/**
 * PHARMACY at the counter (CONTRACT-partner-P2 §7): on a sale of a medicine the
 * bill may name the BATCH it is sold from (else the server picks the earliest
 * expiry), and a Schedule H/H1 drug needs the prescription on the bill.
 *
 * Everything here is OFF unless the business switched Pharmacy on — the HARD
 * RULE: a grocery bill is byte-for-byte what it was (no batch fields, no rx).
 *
 * The drug facts (schedule, batch tracking) are read per product from
 * `GET /pharmacy/products/:id/batches`: the barcode lookup and the catalogue
 * search do not project them, and a guess here would be a prescription asked
 * for (or not) on the wrong medicine.
 */

/** Sales documents that pick batches AND may carry a prescription (§1.1). */
const PHARMACY_SALE_TYPES: ReadonlySet<PartnerDocumentType> = new Set<PartnerDocumentType>(['TAX_INVOICE', 'DELIVERY_CHALLAN']);

export interface DrugInfo {
  batchTracking: boolean;
  schedule?: 'H' | 'H1' | 'X';
}

export function isPharmacySale(on: boolean, direction: 'SALES' | 'PURCHASE', type: PartnerDocumentType): boolean {
  return on && direction === 'SALES' && PHARMACY_SALE_TYPES.has(type);
}

export function usePharmacyBilling(
  direction: 'SALES' | 'PURCHASE',
  type: PartnerDocumentType,
  lines: readonly { itemId?: string; itemName: string; drugSchedule?: 'H' | 'H1' | 'X'; batchTracking?: boolean }[],
) {
  const { has } = useCategoryModules();
  const active = isPharmacySale(has('PHARMACY'), direction, type);
  const { settings } = useModuleSettings(active);
  const [info, setInfo] = useState<Record<string, DrugInfo>>({});

  // Facts the product lookup already carried (a newer server): used as they are, no request.
  const known = useMemo(() => {
    const out: Record<string, DrugInfo> = {};
    for (const l of lines) {
      if (l.itemId && typeof l.batchTracking === 'boolean') out[l.itemId] = { batchTracking: l.batchTracking, schedule: l.drugSchedule };
    }
    return out;
  }, [lines]);
  const ids = useMemo(
    () => [...new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x && !(x in known)))],
    [lines, known],
  );

  useEffect(() => {
    if (!active) return;
    const missing = ids.filter((id) => !(id in info));
    if (!missing.length) return;
    let alive = true;
    for (const id of missing) {
      pharmacyApi.productBatches(id)
        .then((r) => {
          if (!alive) return;
          const p = r?.product;
          setInfo((prev) => ({ ...prev, [id]: { batchTracking: p?.batchTracking === true, schedule: p?.drugSchedule } }));
        })
        .catch(() => {
          if (alive) setInfo((prev) => ({ ...prev, [id]: { batchTracking: false } }));
        });
    }
    return () => { alive = false; };
  }, [active, ids, info]);

  const requireRxFor = settings.pharmacy.requireRxFor;
  const rxDrugs = useMemo(() => {
    if (!active) return [];
    const out: { name: string; schedule: 'H' | 'H1' }[] = [];
    for (const l of lines) {
      const s = l.itemId ? (known[l.itemId] ?? info[l.itemId])?.schedule : undefined;
      if (needsRx(s, requireRxFor) && !out.some((o) => o.name === l.itemName)) out.push({ name: l.itemName, schedule: s });
    }
    return out;
  }, [active, lines, info, known, requireRxFor]);

  const scheduleXNames = useMemo(
    () => (active ? lines.filter((l) => l.itemId && isScheduleX((known[l.itemId] ?? info[l.itemId])?.schedule)).map((l) => l.itemName) : []),
    [active, lines, info, known],
  );

  return {
    /** Pharmacy rules apply to this bill. */
    active,
    infoFor: (itemId?: string): DrugInfo | undefined => (itemId ? known[itemId] ?? info[itemId] : undefined),
    /** The drugs on this bill that need a prescription (per the Rx setting). */
    rxDrugs,
    /** Schedule X lines — never sold through ResiSmart (the server refuses too). */
    scheduleXNames,
  };
}
