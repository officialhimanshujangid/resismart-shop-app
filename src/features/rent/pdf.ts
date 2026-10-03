import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import i18n from '../../i18n';
import { rentApi } from './api';

/**
 * The rent bill's PDF through the OS share sheet (WhatsApp is one of the apps it
 * offers — no template send, CONTRACT-partner-P4 §0.1-6). SDK 54's
 * `File`/`Directory` API, the same plumbing as `features/billing/pdf.ts`.
 * Fetched fresh every time: a bill's paid status changes what the page shows.
 */
// MP1-QA: built on first use, not at import (on web it throws at module load).
const rentDir = (): Directory => new Directory(Paths.cache, 'society-rent');

const safeName = (label: string) => `${label.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'rent-bill'}.pdf`;

export async function shareRentPdf(id: string, label: string): Promise<void> {
  const bytes = await rentApi.pdfBytes(id);
  const RENT_DIR = rentDir();
  if (!RENT_DIR.exists) RENT_DIR.create({ intermediates: true, idempotent: true });
  const file = new File(RENT_DIR, safeName(label));
  file.create({ overwrite: true });
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error(i18n.t('billing.share.sharingUnavailable'));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: i18n.t('billing.share.dialogTitle', { label }),
  });
}
