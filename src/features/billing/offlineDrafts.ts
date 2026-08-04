import { store } from '../../lib/store';
import { DEVICE_KEYS } from '../../constants/app';
import { DraftLineInput, InvoiceDraft } from './types';

/**
 * Local storage for offline invoice drafts — the reason this is an app and
 * not a mobile web page (PARTNERS_PLAN §12.5). Pure read/write over
 * `DEVICE_KEYS.INVOICE_DRAFTS`; the state, the sync loop and the network
 * trigger live in `useOfflineDrafts.ts`.
 *
 * Kept as a flat array under one key rather than one AsyncStorage row per
 * draft: a shop bills dozens of times a day at most, the whole list is always
 * read together (the drafts screen, the sync sweep), and one key means one
 * read/write pair can never leave the set half-written.
 */

export async function loadDrafts(): Promise<InvoiceDraft[]> {
  const list = await store.getJson<InvoiceDraft[]>(DEVICE_KEYS.INVOICE_DRAFTS);
  return Array.isArray(list) ? list : [];
}

/**
 * Returns `false` when the write itself failed (see `store.set`), so a caller
 * that just queued a bill offline can tell the partner it was NOT saved
 * instead of showing a false "saved" — a bill that silently never existed is
 * the one failure mode an offline billing feature must never have.
 */
export async function saveDrafts(drafts: InvoiceDraft[]): Promise<boolean> {
  return store.setJson(DEVICE_KEYS.INVOICE_DRAFTS, drafts);
}

/**
 * A pre-tax estimate for the offline UI ONLY — never sent to the server and
 * never printed on anything. Real tax is computed exactly once, by
 * `computeDocumentTax()` on the server, at `create`/`issue` time
 * (`partner-tax.util.ts`). Reimplementing CGST/SGST/IGST splitting here to
 * show a fancier number offline would be a second, independently-drifting
 * answer to a tax question — exactly what that file's own header warns
 * against. `taxInclusive` lines already have the shop's tax baked into
 * `ratePaise`, so summing qty×rate minus discount is a reasonable "about this
 * much" figure either way; it is labelled "estimated" in the UI for the same
 * reason it is approximate here.
 */
export function estimateDraftTotalPaise(lines: DraftLineInput[]): number {
  return lines.reduce((sum, line) => {
    const gross = Math.round(line.qty * line.ratePaise);
    return sum + Math.max(0, gross - (line.discountPaise ?? 0));
  }, 0);
}

export const PENDING_DRAFT_STATUSES = ['PENDING', 'FAILED', 'BLOCKED_UPGRADE'] as const;
