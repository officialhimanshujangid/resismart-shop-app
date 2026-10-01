import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { qk } from '../../lib/queryKeys';
import { settingsApi } from '../../api/settings.api';
import { stepQty } from '../../lib/qtyStep';
import { previewDocumentTax } from '../billing/taxPreview';
import type { DocumentLineInput } from '../billing/types';
import { checkRoleLimits } from '../p1/access';
import type { Product } from '../catalog/types';

/**
 * The line list a quote (and a job bill's extra lines) is built from — the same
 * rules as `billing/new.tsx`: a catalogue item merges on a repeat, a one-off
 * line never merges, qty never steps below 1 (removing is the bin's job), and
 * the preview is `previewDocumentTax` fed the business's own state and GST
 * registration. Nothing computed here is ever sent.
 */

export type EditableLine = DocumentLineInput & { key: string; catalogRatePaise?: number };

let seq = 0;
export const nextLineKey = () => `jl-${(seq += 1)}`;

export function lineFromProduct(p: Pick<Product, '_id' | 'name' | 'unit' | 'hsnCode' | 'sellPaise' | 'taxRatePercent' | 'taxInclusive'>): EditableLine {
  return {
    key: nextLineKey(),
    itemId: p._id,
    itemName: p.name,
    ...(p.hsnCode ? { hsn: p.hsnCode } : {}),
    unit: p.unit,
    qty: 1,
    ratePaise: p.sellPaise,
    catalogRatePaise: p.sellPaise,
    discountPaise: 0,
    taxRatePercent: p.taxRatePercent,
    taxInclusive: p.taxInclusive,
  };
}

/** The shop's state and whether its sales carry GST — what the server's tax engine will use. */
export function useTaxContext() {
  const q = useQuery({ queryKey: qk.businessSettings(), queryFn: settingsApi.business.get, staleTime: 5 * 60 * 1000 });
  const supplierState = q.data?.state as string | undefined;
  const gstApplicable = (q.data?.isGstRegistered ?? true) && q.data?.registrationType !== 'COMPOSITION';
  return { supplierState, gstApplicable, loading: q.isPending };
}

export function useLineList(initial: EditableLine[] = [], roleLimits?: Parameters<typeof checkRoleLimits>[0]['limits']) {
  const [lines, setLines] = useState<EditableLine[]>(initial);
  /** `'NEW'` = the one-off line being typed; a key = that line; null = closed. */
  const [editing, setEditing] = useState<string | 'NEW' | null>(null);
  const tax = useTaxContext();

  const addOrBump = useCallback((line: EditableLine) => {
    setLines((prev) => {
      if (line.itemId) {
        const i = prev.findIndex((l) => l.itemId === line.itemId);
        if (i >= 0) {
          const next = [...prev];
          next[i] = { ...next[i], qty: next[i].qty + line.qty };
          return next;
        }
      }
      return [...prev, line];
    });
  }, []);

  const save = useCallback((patch: DocumentLineInput) => {
    if (editing === 'NEW') addOrBump({ ...patch, key: nextLineKey() });
    else if (editing) setLines((prev) => prev.map((l) => (l.key === editing ? { ...l, ...patch, key: l.key } : l)));
    setEditing(null);
  }, [editing, addOrBump]);

  const step = useCallback((key: string, delta: number) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: stepQty(l.qty, delta) } : l)));
  }, []);

  const remove = useCallback((key: string) => setLines((prev) => prev.filter((l) => l.key !== key)), []);

  const preview = useMemo(
    () => previewDocumentTax(lines, tax.supplierState, undefined, { gstApplicable: tax.gstApplicable }),
    [lines, tax.supplierState, tax.gstApplicable],
  );

  const violation = useMemo(() => {
    const priceOf = new Map(lines.filter((l) => l.itemId && l.catalogRatePaise !== undefined)
      .map((l) => [l.itemId as string, l.catalogRatePaise as number]));
    return checkRoleLimits({ limits: roleLimits ?? {}, lines, catalogPricePaise: (id) => priceOf.get(id) });
  }, [lines, roleLimits]);

  const editingLine = editing && editing !== 'NEW' ? (lines.find((l) => l.key === editing) ?? null) : null;

  return {
    lines, setLines, editing, setEditing, editingLine, addOrBump, save, step, remove, preview, tax, violation,
  };
}

export type LineList = ReturnType<typeof useLineList>;
