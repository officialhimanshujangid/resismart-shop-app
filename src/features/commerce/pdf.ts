import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import i18n from '../../i18n';
import { commerceApi } from './api';
import type { LabelCounts, LabelSheetInput } from './types';

/**
 * Commerce PDFs through the OS share sheet (print, save, WhatsApp — the person
 * picks; nothing is sent by us). SDK 54's `File` / `Directory` API, the same
 * plumbing as `features/rent/pdf.ts` and `features/billing/pdf.ts`.
 */
const safeName = (label: string, fallback: string) =>
  `${label.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || fallback}.pdf`;

async function sharePdf(bytes: Uint8Array, label: string, fallback: string): Promise<void> {
  // Built on use, not at import: a screen that never shares must not touch the file system.
  const DIR = new Directory(Paths.cache, 'commerce');
  if (!DIR.exists) DIR.create({ intermediates: true, idempotent: true });
  const file = new File(DIR, safeName(label, fallback));
  file.create({ overwrite: true });
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error(i18n.t('billing.share.sharingUnavailable'));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: i18n.t('billing.share.dialogTitle', { label }),
  });
}

/** The store-credit top-up / pay-back receipt (`SC-261002-AB12CD`). */
export async function shareWalletReceipt(partyId: string, paymentId: string, receiptNo: string): Promise<void> {
  const bytes = await commerceApi.wallet.receiptBytes(partyId, paymentId);
  await sharePdf(bytes, receiptNo, 'receipt');
}

/**
 * A barcode label sheet (A4 65-up, A4 24-up or a 50×25 mm roll).
 * GAP-C-SHOP: answers what the server counted (`X-Labels-Count` / `X-Labels-Skipped`), or `null`.
 */
export async function shareLabelSheet(input: LabelSheetInput): Promise<LabelCounts | null> {
  const { bytes, counts } = await commerceApi.labels(input);
  const day = new Date().toISOString().slice(0, 10);
  await sharePdf(bytes, `labels-${day}`, 'labels');
  return counts;
}
