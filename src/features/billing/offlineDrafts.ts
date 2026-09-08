import { store } from '../../lib/store';
import { DEVICE_KEYS } from '../../constants/app';
import { DraftLineInput, InvoiceDraft } from './types';
import { previewDocumentTax } from './taxPreview';

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
 * What this draft comes to, for the offline UI ONLY — never sent to the server
 * and never printed on anything. Real tax is still computed exactly once, by
 * `computeDocumentTax()` on the server at `create`/`issue` time.
 *
 * This used to sum `qty × rate − discount` and call itself a pre-tax estimate,
 * on the reasoning that reimplementing the tax rules here would be a second,
 * drifting answer to a tax question. The reasoning stands; what changed is that
 * `taxPreview.ts` is now a verbatim COPY of the server's function rather than a
 * second answer, so this can show the real number instead of one that is 18%
 * light next to the billing screen's total for the same bill.
 *
 * TWO THINGS IT CANNOT KNOW OFFLINE, and neither moves the total:
 *
 *   - **The supplier's state and the place of supply.** They decide CGST+SGST
 *     vs IGST, which is how the tax SPLITS, not how much of it there is. The
 *     grand total is identical either way, which is why `undefined` is passed
 *     rather than guessed.
 *   - **Whether the shop is GST registered.** `gstApplicable: true` is assumed,
 *     which OVER-states the total for an unregistered shop rather than
 *     under-stating it. That is the safer direction for a number a partner
 *     reads off a queue screen, and the issued document corrects it downward.
 */
export function estimateDraftTotalPaise(lines: DraftLineInput[]): number {
  return previewDocumentTax(lines, undefined, undefined, { gstApplicable: true }).totals.grandPaise;
}

export const PENDING_DRAFT_STATUSES = ['PENDING', 'FAILED', 'BLOCKED_UPGRADE'] as const;
