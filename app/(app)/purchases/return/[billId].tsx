import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { Snackbar, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../../src/hooks';
import { qk } from '../../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../../src/api/axios';
import { newIdempotencyKey } from '../../../../src/lib/idempotency';
import { formatPaise } from '../../../../src/lib/money';
import { documentsApi } from '../../../../src/features/billing/documents.api';
import { purchasesApi } from '../../../../src/features/purchases/api';
import { returnableLines } from '../../../../src/features/purchases/logic';
import { Card, EmptyBlock, ErrorBlock, Loading, Screen, SectionLabel } from '../../../../src/features/more/ui';
import { ActionRow, Banner, PillButton, Stepper } from '../../../../src/features/p1/ui';

/**
 * Return goods to a supplier against an issued purchase bill (screen S6) —
 * a debit note with goods returned. Rates, tax and HSN come from the bill
 * (server side); the partner picks quantities and says why. The server knows
 * what was already returned and refuses more (409 RETURN_QTY_EXCEEDS_PURCHASED).
 */
export default function PurchaseReturnScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { billId } = useLocalSearchParams<{ billId: string }>();
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const canManage = can('PURCHASES_MANAGE', 'FULL');

  const bill = useQuery({ queryKey: qk.billing.document(String(billId)), queryFn: () => documentsApi.get(String(billId)), enabled: !!billId });
  const lines = useMemo(() => (bill.data ? returnableLines(bill.data.lines) : []), [bill.data]);

  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const intentKey = useRef<string | null>(null);
  useEffect(() => { intentKey.current = null; }, [qty, reason]);

  const chosen = lines.filter((l) => (qty[l.lineIndex] ?? 0) > 0);
  const value = chosen.reduce((s, l) => s + Math.round((l.line.totalPaise / l.line.qty) * (qty[l.lineIndex] ?? 0)), 0);

  const save = useMutation({
    mutationFn: () => {
      if (!intentKey.current) intentKey.current = newIdempotencyKey('pret');
      return purchasesApi.returnGoods(String(billId), {
        lines: chosen.map((l) => ({ lineIndex: l.lineIndex, qty: qty[l.lineIndex] })),
        reason: reason.trim(),
        issue: true,
      }, intentKey.current);
    },
    onSuccess: (doc) => {
      void queryClient.invalidateQueries({ queryKey: qk.billing.all() });
      void queryClient.invalidateQueries({ queryKey: qk.catalog.all() });
      router.replace({ pathname: '/billing/[id]', params: { id: doc._id } });
    },
    onError: (e) => setToast(apiErrorMessage(e, t('purchases.return.failed'))),
  });

  const title = t('purchases.return.title');
  if (bill.isPending) return <Screen c={c} rise title={title}><Loading c={c} skeleton={3} /></Screen>;
  if (bill.isError || !bill.data) {
    return <Screen c={c} rise title={title}><ErrorBlock c={c} message={apiErrorMessage(bill.error, t('purchases.loadFailed'))} onRetry={() => bill.refetch()} /></Screen>;
  }
  const b = bill.data;
  const valid = chosen.length > 0 && reason.trim().length >= 3;

  return (
    <Screen
      rise
      c={c}
      title={title}
      subtitle={`${b.number ?? ''} · ${b.partySnapshot.name}`}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      <Banner c={c} body={t('purchases.return.intro')} />
      {b.type !== 'PURCHASE_INVOICE' || b.status === 'CANCELLED' || b.status === 'DRAFT' ? (
        <Banner c={c} tone="error" body={t(b.status === 'CANCELLED' ? 'errors.RETURN_SOURCE_CANCELLED' : 'errors.RETURN_SOURCE_NOT_PURCHASE_BILL')} />
      ) : lines.length === 0 ? (
        <EmptyBlock c={c} title={t('purchases.return.nothing')} />
      ) : (
        <>
          <SectionLabel c={c}>{t('purchases.return.linesSection')}</SectionLabel>
          {lines.map(({ lineIndex, line }) => (
            <Card c={c} key={lineIndex}>
              <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 15 }} numberOfLines={2}>{line.itemName}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>
                {t('purchases.return.billed', { qty: line.qty, unit: line.unit, rate: formatPaise(line.ratePaise) })}
              </Text>
              <Stepper c={c} value={qty[lineIndex] ?? 0} max={line.qty} onChange={(n) => setQty((q) => ({ ...q, [lineIndex]: n }))} label={line.itemName} />
            </Card>
          ))}
          <TextInput
            mode="outlined"
            label={t('purchases.return.reason')}
            value={reason}
            onChangeText={(v) => setReason(v.slice(0, 300))}
            multiline
            outlineStyle={{ borderRadius: radii.field }}
          />
          {chosen.length > 0 && (
            <Text style={{ color: c.textSecondary }}>{t('purchases.return.value', { amount: formatPaise(value) })}</Text>
          )}
          {canManage && (
            <View>
              <ActionRow>
                <PillButton c={c} icon="truck-delivery-outline" label={save.isPending ? t('p1.saving') : t('purchases.return.save')} disabled={!valid || save.isPending} onPress={() => save.mutate()} testID="return-save" />
              </ActionRow>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
