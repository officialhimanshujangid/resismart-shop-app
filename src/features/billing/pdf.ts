import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { documentsApi } from './documents.api';
import { platformBillingApi } from '../../api/billing.api';

/**
 * Fetching and sharing a document's PDF — `GET /partners/me/documents/:id/pdf`
 * (spec §4, "one-tap WhatsApp share").
 *
 * **`expo-file-system` here is the SDK 54 `File`/`Directory` API, not the
 * `FileSystem.writeAsStringAsync` one your training data likely remembers.**
 * That older API moved to `expo-file-system/legacy` in this SDK — see
 * `mobile-shop/AGENTS.md`'s warning, confirmed against
 * `node_modules/expo-file-system/build/FileSystem.d.ts` before writing this
 * file. `File.write()` takes a `Uint8Array` directly, which is exactly what
 * `documentsApi.pdfBytes()` returns — no base64 round trip needed.
 */

const INVOICE_DIR = new Directory(Paths.cache, 'partner-invoices');

function safeFileName(label: string): string {
  const cleaned = label.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'document';
  return `${cleaned}.pdf`;
}

/**
 * Downloads the PDF fresh every call rather than caching by document id.
 *
 * A document's LINES are immutable once issued (`IMMUTABLE_ONCE_ISSUED` on
 * the server model), but its `status` is not — a partial payment moves it to
 * `PARTIALLY_PAID`/`PAID`, which the printed layout may reflect. Re-fetching
 * is one extra request on an action the partner takes once per bill; a stale
 * "unpaid" PDF handed to a customer who already paid is the worse trade.
 */
export async function downloadDocumentPdf(id: string, label: string): Promise<string> {
  const bytes = await documentsApi.pdfBytes(id);

  if (!INVOICE_DIR.exists) INVOICE_DIR.create({ intermediates: true, idempotent: true });

  const file = new File(INVOICE_DIR, safeFileName(label));
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

/**
 * The OS share sheet, carrying the PDF — never the WhatsApp Cloud API from
 * the device (spec §4: that number is the platform's, not the partner's).
 * WhatsApp is one of the apps the sheet offers; this cannot force it to be
 * the only one, which is the correct behaviour on both platforms and is what
 * every "share to WhatsApp" button in a consumer app actually does.
 */
export async function shareDocumentPdf(id: string, label: string): Promise<void> {
  const uri = await downloadDocumentPdf(id, label);
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Share ${label}`,
  });
}

/**
 * The same share sheet for a RESISMART subscription invoice — the receipt the
 * partner gets from us, not the one they hand a customer.
 *
 * It lives beside `shareDocumentPdf` for the file plumbing (one cache
 * directory, one `safeFileName`, one share sheet) and for nothing else: the
 * fetch is a different shape entirely, and the difference is the reason this is
 * a second function rather than a parameter on the first.
 *
 *   - `GET /billing/invoices/:id/download` returns a URL, not bytes. It is
 *     either Razorpay's hosted invoice page or a five-minute presigned S3 link,
 *     and both carry their own authorisation inside the URL.
 *   - So the file is fetched with `File.downloadFileAsync`, NOT through
 *     `apiClient`. `documentsApi.pdfBytes` goes through axios deliberately —
 *     that endpoint is authenticated with our bearer token and needs the
 *     refresh interceptor. Sending the same token to Razorpay's CDN would be
 *     pointless at best.
 *   - A `razorpayInvoiceUrl` is an HTML page, not a PDF. It is handed to the
 *     share sheet with no mime type rather than being announced as a PDF it is
 *     not; `settings/plan.tsx` opens those in the browser instead and only
 *     calls this for invoices it knows carry a `customPdfUrl`.
 *
 * A 404 here ("No PDF available for this invoice") is a normal answer for a
 * PENDING invoice, not a fault — the caller renders the server's own sentence.
 */
export async function sharePlatformInvoicePdf(id: string, label: string): Promise<void> {
  const url = await platformBillingApi.invoiceDownloadUrl(id);

  if (!INVOICE_DIR.exists) INVOICE_DIR.create({ intermediates: true, idempotent: true });

  // Overwritten rather than appended-to: the same invoice shared twice must not
  // leave `Invoice-1.pdf` beside `Invoice.pdf` in the cache.
  const target = new File(INVOICE_DIR, safeFileName(label));
  if (target.exists) target.delete();
  const downloaded = await File.downloadFileAsync(url, target);

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(downloaded.uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Share ${label}`,
  });
}
