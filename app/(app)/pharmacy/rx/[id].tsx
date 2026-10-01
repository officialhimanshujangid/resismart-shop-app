import React from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../../src/constants/colors';
import { apiErrorMessage } from '../../../../src/api/axios';
import { dayTimeLabel, shortDay } from '../../../../src/features/p2/dates';
import { Card, ErrorBlock, Loading, Screen, SectionLabel } from '../../../../src/features/more/ui';
import { Banner } from '../../../../src/features/p1/ui';
import { Pill } from '../../../../src/features/p2/ui';
import { pharmacyApi, pharmacyKeys } from '../../../../src/features/pharmacy/api';
import { expiryLabel, fmtQty, istDayOfIso } from '../../../../src/features/pharmacy/logic';

/**
 * One register entry, in full (the patient's phone unmasked for an
 * RX_REGISTER holder). Read-only: the register is never edited or deleted.
 */
export default function RxEntryScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = String(raw ?? '');
  const query = useQuery({ queryKey: pharmacyKeys.rxEntry(id), queryFn: () => pharmacyApi.rxEntry(id), enabled: !!id });
  const e = query.data;

  if (query.isPending) return <Screen c={c} title={t('p2.pharmacy.entry.titlePlain')}><Loading c={c} /></Screen>;
  if (query.isError || !e) {
    return (
      <Screen c={c} title={t('p2.pharmacy.entry.titlePlain')}>
        <ErrorBlock c={c} message={apiErrorMessage(query.error, t('p2.pharmacy.entry.loadFailed'))} onRetry={() => query.refetch()} />
      </Screen>
    );
  }
  const day = (iso?: string) => (iso ? shortDay(istDayOfIso(iso), t) : '');
  const cancelled = e.status === 'CANCELLED';

  return (
    <Screen c={c} title={t('p2.pharmacy.entry.title', { number: e.number })} subtitle={day(e.saleDate)}>
      {cancelled ? (
        <View testID="rx-cancelled">
          <Banner
            c={c}
            tone="error"
            title={t('p2.pharmacy.register.status.CANCELLED')}
            body={e.cancelledAt
              ? t('p2.pharmacy.entry.cancelledOn', { date: day(e.cancelledAt), reason: e.cancelledReason ?? '' })
              : t('p2.pharmacy.entry.cancelled')}
          />
        </View>
      ) : null}

      <SectionLabel c={c}>{t('p2.pharmacy.entry.patient')}</SectionLabel>
      <Card c={c}>
        <Text style={[styles.strong, { color: c.textPrimary }]} numberOfLines={2}>{e.patient.name}</Text>
        {e.patient.phone ? <Text style={{ color: c.textPrimary }} selectable>{e.patient.phone}</Text> : null}
        {e.patient.address ? <Text style={{ color: c.textSecondary }}>{e.patient.address}</Text> : null}
      </Card>

      <SectionLabel c={c}>{t('p2.pharmacy.entry.prescriber')}</SectionLabel>
      <Card c={c}>
        <Text style={[styles.strong, { color: c.textPrimary }]} numberOfLines={2}>{e.prescriber.name}</Text>
        {e.prescriber.regNo ? <Text style={{ color: c.textPrimary }}>{t('p2.pharmacy.entry.regNo', { regNo: e.prescriber.regNo })}</Text> : null}
        {e.prescriber.address ? <Text style={{ color: c.textSecondary }}>{e.prescriber.address}</Text> : null}
        {e.rxNo ? <Text style={{ color: c.textPrimary }}>{t('p2.pharmacy.register.rxNo', { rxNo: e.rxNo })}</Text> : null}
        {e.rxDate ? <Text style={{ color: c.textPrimary }}>{t('p2.pharmacy.entry.rxDate', { date: day(e.rxDate) })}</Text> : null}
      </Card>

      <SectionLabel c={c}>{t('p2.pharmacy.entry.items')}</SectionLabel>
      <Card c={c}>
        {(e.items ?? []).map((i, n) => (
          <View key={`${i.productId}-${n}`} style={styles.item}>
            <View style={styles.itemTop}>
              <Text style={{ flex: 1, minWidth: 0, color: c.textPrimary, fontWeight: '600' }} numberOfLines={2}>
                {t('p2.pharmacy.entry.itemLine', { qty: fmtQty(i.qty), name: i.name })}
              </Text>
              <Pill c={c} label={t('p2.pharmacy.rx.schedule', { schedule: i.schedule })} tone="warn" />
            </View>
            {i.batchNo ? (
              <Text style={{ color: c.textSecondary, fontSize: 12.5 }} numberOfLines={1}>
                {t('p2.pharmacy.row.batch', { batchNo: i.batchNo })}
                {i.expiryDate ? ` · ${t('p2.pharmacy.row.expiry', { expiry: expiryLabel(i.expiryDate) })}` : ''}
              </Text>
            ) : null}
          </View>
        ))}
      </Card>

      <Card c={c}>
        {e.source?.ref ? (
          <Text style={{ color: c.textPrimary }}>
            {t(e.source.kind === 'ORDER' ? 'p2.pharmacy.entry.sourceOrder' : 'p2.pharmacy.entry.sourceBill', { ref: e.source.ref })}
          </Text>
        ) : null}
        {e.createdByName ? (
          <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>
            {t('p2.pharmacy.entry.recordedBy', { name: e.createdByName, when: e.createdAt ? dayTimeLabel(e.createdAt, t) : '' })}
          </Text>
        ) : null}
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.pharmacy.register.readOnly')}</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strong: { fontSize: 15, fontWeight: '700' },
  item: { gap: 2, paddingVertical: 4 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
