import { useState } from 'react';
import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { apiErrorMessage } from '../../api/axios';
import { newIdempotencyKey } from '../../lib/idempotency';
import { qk } from '../../lib/queryKeys';
import { khataApi } from './api';
import { shareMessage } from './logic';

/**
 * The khata verbs a screen offers (screen S15), each ending in the phone's own
 * share sheet where that is the point: a SHARE reminder (the free default —
 * WhatsApp/SMS from the shop's own phone, in the reader's language), a UPI
 * payment link, a statement link, the statement PDF. PUSH reaches a customer
 * who uses the ResiSmart app. `busy` names the verb in flight.
 */
export function useKhataActions(onMessage: (text: string) => void) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const lang: 'en' | 'hi' = String(i18n.language ?? 'en').startsWith('hi') ? 'hi' : 'en';

  const run = async (verb: string, fn: () => Promise<void>) => {
    setBusy(verb);
    try {
      await fn();
    } catch (e) {
      onMessage(apiErrorMessage(e, t('khata.actionFailed')));
    } finally {
      setBusy(null);
    }
  };
  const touched = () => void queryClient.invalidateQueries({ queryKey: qk.parties.all() });

  return {
    busy,
    remindShare: (partyId: string) => run('remind', async () => {
      const res = await khataApi.remind(partyId, { channel: 'SHARE', includeUpiLink: true, lang }, newIdempotencyKey('remind'));
      if (res.channel === 'SHARE') await Share.share({ message: shareMessage(res) });
      touched();
    }),
    remindPush: (partyId: string) => run('push', async () => {
      await khataApi.remind(partyId, { channel: 'PUSH', includeUpiLink: true, lang }, newIdempotencyKey('remind'));
      touched();
      onMessage(t('khata.pushSent'));
    }),
    shareUpi: (partyId: string) => run('upi', async () => {
      const res = await khataApi.upiLink(partyId);
      await Share.share({ message: `${res.note}\n${res.upiUri}` });
    }),
    shareStatementLink: (partyId: string) => run('link', async () => {
      const res = await khataApi.shareStatement(partyId, 7);
      await Share.share({ message: t('khata.statementLinkMessage', { url: res.url }) });
    }),
    revokeLinks: (partyId: string) => run('revoke', async () => {
      await khataApi.revokeStatement(partyId);
      onMessage(t('khata.linksRevoked'));
    }),
    shareStatementPdf: (partyId: string, name: string) => run('pdf', async () => {
      const bytes = await khataApi.statementPdfBytes(partyId);
      const safe = name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'statement';
      const file = new File(Paths.cache, `${safe}-${Date.now()}.pdf`);
      file.write(bytes);
      if (!(await Sharing.isAvailableAsync())) throw new Error(t('reports.share.sharingUnavailable'));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: t('khata.statementPdf') });
    }),
  };
}
