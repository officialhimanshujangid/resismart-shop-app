import React, { useEffect, useRef, useState } from 'react';
import { Switch, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { newIdempotencyKey } from '../../../lib/idempotency';
import { formatPaise } from '../../../lib/money';
import { ActionRow, Banner, PillButton } from '../../p1/ui';
import { PartyPicker, PickedParty, Sheet } from '../../p2/ui';
import { appointmentsApi, apptKeys } from '../api';
import type { PackageRow, SellResult } from '../types';

/**
 * Sell package: pick the customer, issue the bill now (default) or keep it a
 * draft. It is a tax invoice, so it counts toward the month's invoices (a 402
 * reads as the plan sentence). One Idempotency-Key per customer + choice.
 */
export function SellSheet({
  c, pkg, onDismiss,
}: { c: ColorScheme; pkg: PackageRow | null; onDismiss: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [party, setParty] = useState<PickedParty | null>(null);
  const [issue, setIssue] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<SellResult | null>(null);
  const key = useRef<{ sig: string; key: string } | null>(null);
  useEffect(() => { setParty(null); setIssue(true); setProblem(null); setDone(null); key.current = null; }, [pkg?.id]);

  const sell = useMutation({
    mutationFn: async () => {
      if (!pkg) throw new Error(t('p2.common.saveFailed'));
      if (!party) throw new Error(t('p2.appointments.new.problem.needCustomer'));
      const body = { partyId: party.id, issue };
      const sig = `${pkg.id}:${JSON.stringify(body)}`;
      if (!key.current || key.current.sig !== sig) key.current = { sig, key: newIdempotencyKey('appt-pkg-sell') };
      return appointmentsApi.sellPackage(pkg.id, body, key.current.key);
    },
    onMutate: () => setProblem(null),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: apptKeys.all }); setDone(res); },
    onError: (e) => setProblem(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });

  const docId = done?.document?._id ?? done?.purchase?.documentId;
  return (
    <Sheet
      visible={!!pkg}
      onDismiss={onDismiss}
      title={pkg ? t('p2.appointments.packages.sellTitle', { name: pkg.name }) : ''}
      testID="sell-sheet"
      footer={done ? (
        <PillButton c={c} tone="outline" label={t('common.done')} onPress={onDismiss} />
      ) : (
        <PillButton c={c} label={t('p2.appointments.packages.sell')} onPress={() => sell.mutate()} disabled={sell.isPending || !party} testID="sell-confirm" />
      )}
    >
      {pkg ? (
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>
          {t('p2.appointments.packages.row', { sessions: pkg.sessions, price: formatPaise(pkg.pricePaise), days: pkg.validityDays })}
        </Text>
      ) : null}
      {done ? (
        <View style={{ gap: 10 }}>
          <Banner
            c={c}
            tone="info"
            body={done.document?.number
              ? t('p2.appointments.packages.sold', { number: done.document.number })
              : t('p2.appointments.packages.soldDraft')}
            testID="sell-done"
          />
          {docId ? (
            <ActionRow>
              <PillButton c={c} icon="file-document-outline" label={t('p2.appointments.packages.viewBill')} onPress={() => { onDismiss(); router.push(`/(app)/billing/${docId}` as Href); }} testID="sell-view-bill" />
            </ActionRow>
          ) : null}
        </View>
      ) : (
        <>
          <PartyPicker c={c} value={party} onChange={setParty} testID="sell-party" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{t('p2.appointments.packages.issue')}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.appointments.packages.issueHint')}</Text>
            </View>
            <Switch value={issue} onValueChange={setIssue} accessibilityLabel={t('p2.appointments.packages.issue')} testID="sell-issue" />
          </View>
          {problem ? <Banner c={c} tone="error" body={problem} testID="sell-problem" /> : null}
        </>
      )}
    </Sheet>
  );
}
