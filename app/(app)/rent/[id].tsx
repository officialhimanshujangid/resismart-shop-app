import React, { useState } from 'react';
import { Alert, Linking, Share, StyleSheet, useColorScheme, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors, radii, ColorScheme } from '../../../src/constants/colors';
import { Card, ErrorBlock, Screen, SectionLabel } from '../../../src/features/more/ui';
import { SkeletonList } from '../../../src/components/ui';
import { Rise, tapHaptic, useCountUp } from '../../../src/theme/motion';
import { apiErrorMessage } from '../../../src/api/axios';
import { formatI18nDate } from '../../../src/i18n';
import { formatPaise } from '../../../src/lib/money';
import { usePartnerEntitlements } from '../../../src/hooks';
import { useRentBill } from '../../../src/features/rent/hooks';
import { BILL_STATUS_KEYS, isOpenBill, periodText, rentAccess } from '../../../src/features/rent/logic';
import { shareRentPdf } from '../../../src/features/rent/pdf';
import { IHavePaidDialog } from '../../../src/features/rent/components/IHavePaidDialog';

/**
 * One rent / deposit bill (CONTRACT-partner-P4 §10.8 `GET /:invoiceId`):
 * what is due and by when, where to pay (the society's UPI id, its bank
 * account MASKED), "Pay by UPI" (the phone's UPI apps, amount and bill number
 * filled in), the PDF, a share text, and "I have paid".
 * Verbs match the web partner dashboard: Pay by UPI · PDF · Share · I have paid.
 */
export default function RentBillScreen() {
  const { t, i18n } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useRentBill(id);
  const { can } = usePartnerEntitlements();
  const { canNote } = rentAccess(can);
  const [paidOpen, setPaidOpen] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);

  const d = query.data;
  if (query.isPending) {
    return <Screen c={c} title={t('rent.bill.title')}><SkeletonList rows={4} testID="rent-bill-loading" /></Screen>;
  }
  if (query.isError || !d) {
    return (
      <Screen c={c} title={t('rent.bill.title')}>
        <ErrorBlock c={c} message={apiErrorMessage(query.error, t('rent.bill.loadFailed'))} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  const bill = d.bill;
  const open = isOpenBill(bill);
  const overdue = bill.status === 'OVERDUE';
  const what = bill.kind === 'LEASE_DEPOSIT' ? t('rent.kind.LEASE_DEPOSIT') : t('rent.kind.RENTFor', { period: periodText(bill, i18n.language) });
  const statusKey = BILL_STATUS_KEYS[bill.status];

  const payByUpi = () => {
    if (!d.upi) return;
    Linking.openURL(d.upi.uri).catch(() => Alert.alert(t('rent.bill.noUpiAppTitle'), t('rent.bill.noUpiAppBody')));
  };
  const sharePdf = () => {
    setSharingPdf(true);
    shareRentPdf(bill.id, bill.invoiceNumber)
      .catch((e: unknown) => Alert.alert(t('rent.bill.pdfFailedTitle'), apiErrorMessage(e, t('rent.bill.pdfFailedBody'))))
      .finally(() => setSharingPdf(false));
  };
  const shareText = () => { void Share.share({ message: d.shareText }).catch(() => undefined); };

  return (
    <Screen c={c} title={what} subtitle={bill.invoiceNumber}>
      <Rise index={0}>
      <Card c={c}>
        <Text style={[styles.label, { color: c.textSecondary }]}>{open ? t('rent.bill.due') : t('rent.bill.total')}</Text>
        <CountUpPaise paise={open ? bill.outstandingPaise : bill.totalPaise} style={[styles.amount, { color: overdue ? c.error : c.textPrimary }]} />
        <View style={[styles.pill, { borderColor: overdue ? c.error : c.border }]}>
          <Text style={[styles.pillText, { color: overdue ? c.error : bill.status === 'PAID' ? c.success : c.textPrimary }]}>
            {overdue && bill.overdueDays > 0 ? t('rent.overdueDays', { count: bill.overdueDays }) : statusKey ? t(statusKey) : bill.status}
          </Text>
        </View>
        <Fact c={c} label={t('rent.bill.dueDate')} value={formatI18nDate(bill.dueDate, t)} />
        <Fact c={c} label={t('rent.bill.billDate')} value={formatI18nDate(bill.invoiceDate, t)} />
        {open && bill.outstandingPaise !== bill.totalPaise ? (
          <Fact c={c} label={t('rent.bill.billTotal')} value={formatPaise(bill.totalPaise)} />
        ) : null}
        {bill.gstPaise > 0 ? <Fact c={c} label={t('rent.bill.gstIncluded')} value={formatPaise(bill.gstPaise)} /> : null}
        <Fact c={c} label={t('rent.bill.unit')} value={t('rent.unitAt', { unit: d.lease.unitLabel, society: d.lease.societyName })} />
        <Fact c={c} label={t('rent.bill.lease')} value={d.lease.number} />
        {bill.reverseCharge ? <Text style={[styles.note, { color: c.textSecondary }]}>{t('rent.bill.reverseCharge')}</Text> : null}
        {bill.kind === 'LEASE_DEPOSIT' ? <Text style={[styles.note, { color: c.textSecondary }]}>{t('rent.bill.depositNote')}</Text> : null}
      </Card>
      </Rise>

      {open ? (
        <Rise index={1} style={{ gap: 12 }}>
          <SectionLabel c={c}>{t('rent.bill.payTo')}</SectionLabel>
          <Card c={c}>
            <Text style={[styles.payee, { color: c.textPrimary }]}>{d.payTo.payeeName}</Text>
            {d.payTo.upiVpa ? <Fact c={c} label={t('rent.bill.upiId')} value={d.payTo.upiVpa} selectable /> : null}
            {d.payTo.bank ? (
              <>
                {d.payTo.bank.bankName ? <Fact c={c} label={t('rent.bill.bank')} value={d.payTo.bank.bankName} /> : null}
                {d.payTo.bank.accountName ? <Fact c={c} label={t('rent.bill.accountName')} value={d.payTo.bank.accountName} /> : null}
                <Fact c={c} label={t('rent.bill.account')} value={d.payTo.bank.accountNumberMasked} />
                {d.payTo.bank.ifsc ? <Fact c={c} label={t('rent.bill.ifsc')} value={d.payTo.bank.ifsc} selectable /> : null}
                <Text style={[styles.note, { color: c.textSecondary }]}>{t('rent.bill.maskedNote')}</Text>
              </>
            ) : null}
            {!d.payTo.upiVpa && !d.payTo.bank ? (
              <Text style={[styles.note, { color: c.textSecondary }]}>{t('rent.bill.noPayDetails')}</Text>
            ) : null}
            {d.upi ? (
              <Button mode="contained" icon="cellphone-arrow-down" onPress={() => { tapHaptic(); payByUpi(); }} style={styles.primary} testID="rent-pay-upi">
                {t('rent.bill.payUpi')}
              </Button>
            ) : null}
          </Card>
        </Rise>
      ) : null}

      <View style={styles.actions}>
        <Button mode="outlined" icon="file-pdf-box" onPress={sharePdf} loading={sharingPdf} disabled={sharingPdf} testID="rent-pdf">
          {t('rent.bill.pdf')}
        </Button>
        <Button mode="outlined" icon="share-variant" onPress={shareText} testID="rent-share">
          {t('rent.bill.share')}
        </Button>
        {open && canNote ? (
          <Button mode="contained-tonal" icon="check-circle-outline" onPress={() => setPaidOpen(true)} testID="rent-i-have-paid">
            {t('rent.bill.iHavePaid')}
          </Button>
        ) : null}
      </View>
      {open && !canNote ? <Text style={[styles.note, { color: c.textSecondary }]}>{t('rent.bill.askOwner')}</Text> : null}
      {open && canNote ? <Text style={[styles.note, { color: c.textSecondary }]}>{t('rent.bill.iHavePaidHint')}</Text> : null}

      <IHavePaidDialog visible={paidOpen} billId={bill.id} outstandingPaise={bill.outstandingPaise} onClose={() => setPaidOpen(false)} />
    </Screen>
  );
}

/** M15 — the bill's headline amount counts up once (reduce-motion → lands at once; the label is the real figure). */
function CountUpPaise({ paise, style }: { paise: number; style: React.ComponentProps<typeof Text>['style'] }) {
  const shown = useCountUp(paise);
  return (
    <Text style={style} numberOfLines={1} adjustsFontSizeToFit testID="rent-bill-amount" accessibilityLabel={formatPaise(paise)}>
      {formatPaise(Math.round(shown))}
    </Text>
  );
}

function Fact({ c, label, value, selectable }: { c: ColorScheme; label: string; value: string; selectable?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: c.textSecondary }]}>{label}</Text>
      <Text style={[styles.factValue, { color: c.textPrimary }]} selectable={selectable}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600' },
  amount: { fontSize: 28, fontWeight: '700' },
  pill: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  pillText: { fontSize: 12, fontWeight: '600' },
  fact: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12 },
  factLabel: { fontSize: 13 },
  factValue: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  note: { fontSize: 12.5, lineHeight: 18 },
  payee: { fontSize: 15.5, fontWeight: '600' },
  primary: { alignSelf: 'flex-start', marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
