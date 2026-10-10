import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { formatPaise, parseRupeesToPaise } from '../../../src/lib/money';
import { purchasesApi, UnbilledGrn } from '../../../src/features/purchases/api';
import { canBillTogether, toggleGrn } from '../../../src/features/purchases/logic';
import { GrnPickRow } from '../../../src/features/purchases/components/GrnPickRow';
import { PurchaseBillFields } from '../../../src/features/purchases/components/PurchaseBillFields';
import { ExtraCharge, ExtraChargesEditor } from '../../../src/features/purchases/components/ExtraChargesEditor';
import { Card, EmptyBlock, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { ActionRow, Banner, PillButton, TwoPane } from '../../../src/features/p1/ui';
import { isoOfDay, todayYmd } from '../../../src/features/p1/dates';

/**
 * Bill goods-received notes (screen S5): pick the GRNs of ONE supplier, type
 * the supplier's bill number and date, add freight or packing if the bill has
 * it, save. Stock already came in on the GRNs, so the bill moves money only
 * (and trues up cost where the bill's rate differs — server side).
 *
 * A second bill with the same supplier number is refused once (409
 * PURCHASE_BILL_DUPLICATE_SUPPLIER_NO) and saved on "Save anyway".
 */
let chargeSeq = 0;

export default function BillFromGrnsScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const params = useLocalSearchParams<{ grnId?: string; partyId?: string }>();
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const canManage = can('PURCHASES_MANAGE', 'FULL');

  const list = useQuery({
    queryKey: qk.purchases.unbilled(params.partyId),
    queryFn: () => purchasesApi.unbilledGrns({ partyId: params.partyId, limit: 100 }),
  });
  const grns = useMemo(() => list.data?.data ?? [], [list.data]);

  const [selected, setSelected] = useState<UnbilledGrn[]>([]);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState(todayYmd());
  const [itcEligible, setItcEligible] = useState<boolean | null>(null);
  const [charges, setCharges] = useState<ExtraCharge[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Opened from "Receive → Make the bill": that GRN is ticked already.
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current || !params.grnId || !grns.length) return;
    const g = grns.find((x) => x.id === params.grnId);
    if (g) setSelected([g]);
    preselected.current = true;
  }, [grns, params.grnId]);

  const intentKey = useRef<string | null>(null);
  useEffect(() => { intentKey.current = null; }, [selected, supplierInvoiceNo, supplierInvoiceDate, itcEligible, charges]);

  const grnTotal = selected.reduce((s, g) => s + (g.totals?.grandPaise ?? 0), 0);

  const save = useMutation({
    mutationFn: (confirmDuplicate: boolean) => {
      if (!intentKey.current || confirmDuplicate) intentKey.current = newIdempotencyKey('bill');
      const extraLines = charges
        .filter((x) => x.name.trim() && (parseRupeesToPaise(x.amount) ?? 0) > 0)
        .map((x) => ({
          itemName: x.name.trim(), qty: 1, ratePaise: parseRupeesToPaise(x.amount) ?? 0,
          taxRatePercent: Number(x.taxRate), taxInclusive: false,
        }));
      return purchasesApi.billFromGrns({
        grnIds: selected.map((g) => g.id),
        supplierInvoiceNo: supplierInvoiceNo.trim(),
        supplierInvoiceDate: isoOfDay(supplierInvoiceDate) as string,
        extraLines: extraLines.length ? extraLines : undefined,
        itcEligible: itcEligible ?? undefined,
        issue: true,
        confirmDuplicateSupplierNo: confirmDuplicate || undefined,
      }, intentKey.current);
    },
    onSuccess: (doc) => {
      void queryClient.invalidateQueries({ queryKey: qk.billing.all() });
      void queryClient.invalidateQueries({ queryKey: qk.parties.all() });
      router.replace({ pathname: '/billing/[id]', params: { id: doc._id } });
    },
    onError: (e: unknown): void => {
      if (apiErrorCode(e) === 'PURCHASE_BILL_DUPLICATE_SUPPLIER_NO') {
        Alert.alert(t('billing.new.duplicateSupplierTitle'), apiErrorMessage(e), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('billing.new.duplicateSupplierConfirm'), onPress: () => save.mutate(true) },
        ]);
        return;
      }
      setToast(apiErrorMessage(e, t('purchases.bill.failed')));
    },
  });

  const submit = () => {
    if (!selected.length) { setFormError(t('purchases.bill.pickGrn')); return; }
    if (!canBillTogether(selected)) { setFormError(t('errors.GRN_SUPPLIER_MISMATCH')); return; }
    if (!supplierInvoiceNo.trim()) { setFormError(t('purchases.bill.needSupplierNo')); return; }
    if (!supplierInvoiceDate) { setFormError(t('purchases.bill.needSupplierDate')); return; }
    setFormError(null);
    save.mutate(false);
  };

  const title = t('purchases.bill.title');
  if (list.isPending) return <Screen c={c} rise title={title}><Loading c={c} skeleton={3} /></Screen>;
  if (list.isError) {
    return (
      <Screen c={c} rise title={title}>
        <ErrorBlock c={c} message={apiErrorMessage(list.error, t('purchases.loadFailed'))} onRetry={() => list.refetch()} />
      </Screen>
    );
  }

  const picker = (
    <View style={{ gap: 8 }}>
      <SectionLabel c={c}>{t('purchases.bill.pickSection')}</SectionLabel>
      {grns.length === 0 ? (
        <EmptyBlock c={c} icon="truck-check-outline" title={t('purchases.bill.noneTitle')} body={t('purchases.bill.noneBody')} />
      ) : (
        grns.map((g) => (
          <GrnPickRow key={g.id} c={c} grn={g} selected={selected.some((s) => s.id === g.id)} onToggle={() => setSelected((cur) => toggleGrn(cur, g))} />
        ))
      )}
    </View>
  );

  const form = (
    <View style={{ gap: 10 }}>
      {selected.length > 0 && (
        <Banner c={c} body={t('purchases.bill.selectedSummary', { count: selected.length, supplier: selected[0].partyName, amount: formatPaise(grnTotal) })} />
      )}
      <Card c={c}>
        <PurchaseBillFields
          c={c}
          showItc
          supplierInvoiceNo={supplierInvoiceNo}
          onSupplierInvoiceNo={setSupplierInvoiceNo}
          supplierInvoiceDate={supplierInvoiceDate}
          onSupplierInvoiceDate={setSupplierInvoiceDate}
          itcEligible={itcEligible}
          onItcEligible={setItcEligible}
          maxDate={todayYmd()}
        />
      </Card>
      <SectionLabel c={c}>{t('purchases.bill.chargesSection')}</SectionLabel>
      <ExtraChargesEditor c={c} value={charges} onChange={setCharges} />
      <ActionRow>
        <PillButton
          c={c}
          tone="outline"
          icon="plus"
          label={t('purchases.bill.addCharge')}
          disabled={charges.length >= 20}
          onPress={() => setCharges((cur) => [...cur, { key: `ch-${(chargeSeq += 1)}`, name: '', amount: '', taxRate: '0' }])}
        />
      </ActionRow>
      {formError ? <Text style={{ color: c.error, fontSize: 13 }} testID="bill-form-error">{formError}</Text> : null}
      {canManage && (
        <ActionRow>
          <PillButton c={c} icon="check" label={save.isPending ? t('p1.saving') : t('purchases.bill.save')} disabled={save.isPending} onPress={submit} testID="bill-save" />
        </ActionRow>
      )}
    </View>
  );

  return (
    <Screen
      rise
      c={c}
      title={title}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      <TwoPane left={picker} right={form} />
    </Screen>
  );
}
