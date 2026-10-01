import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { STATUS_LABEL_KEY, type PartnerDocumentStatus } from '../../billing/types';
import { STATUS_LABEL_KEYS } from '../../bookings/format';
import type { PartnerBookingView } from '../../bookings/booking.types';
import { PillButton } from '../../p1/ui';
import { Pill } from '../../p2/ui';
import { dayTimeLabel, istDayOf, shortDay } from '../../p2/dates';
import { quoteTone, stageTone } from '../logic';
import type { JobInvoiceSummary, JobQuoteView, JobView } from '../types';

/** Code, stage, customer (+ flat), service — and the close reason once closed. */
export function JobHeaderCard({ c, job }: { c: ColorScheme; job: JobView }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]} testID="job-header">
      <View style={styles.rowWrap}>
        <Text style={[styles.code, { color: c.textPrimary }]} numberOfLines={1}>{job.code}</Text>
        <Pill c={c} label={t(`p2.jobs.stage.${job.stage}`)} tone={stageTone(job.stage)} testID="job-stage" />
      </View>
      <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>
        {[job.customerName, job.flatLabel].filter(Boolean).join(' · ')}
      </Text>
      <Text style={{ color: c.textSecondary }} numberOfLines={2}>{job.serviceName}</Text>
      {job.stage === 'CLOSED' && job.closeReason ? (
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.jobs.detail.closedWhy', { reason: job.closeReason })}</Text>
      ) : null}
    </View>
  );
}

/** Every quote, newest first; tap one to see its lines. */
export function QuotesCard({ c, quotes }: { c: ColorScheme; quotes: JobQuoteView[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const list = [...quotes].reverse();
  if (!list.length) {
    return <Text style={{ color: c.textSecondary }}>{t('p2.jobs.detail.noQuotes')}</Text>;
  }
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider, paddingVertical: 4 }]}>
      {list.map((q, i) => {
        const expanded = open === q.id;
        return (
          <View key={q.id} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider } : undefined}>
            <Pressable
              onPress={() => setOpen(expanded ? null : q.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              style={styles.quoteRow}
              testID={`job-quote-${q.id}`}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={styles.rowWrap}>
                  <Text style={{ color: c.textPrimary, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>{q.number}</Text>
                  <Pill c={c} label={t(`p2.jobs.quoteStatus.${q.status}`)} tone={quoteTone(q.status)} />
                </View>
                <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={2}>
                  {t('p2.jobs.detail.quoteMeta', {
                    until: shortDay(istDayOf(q.validUntil), t), by: q.sentByName,
                  })}
                </Text>
                {q.declineReason ? (
                  <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.jobs.detail.declinedWhy', { reason: q.declineReason })}</Text>
                ) : null}
              </View>
              <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{formatPaise(q.totalPaise)}</Text>
              <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={c.textSecondary} />
            </Pressable>
            {expanded ? (
              <View style={styles.lines}>
                {q.lines.map((l, j) => (
                  <View key={`${q.id}-${j}`} style={styles.lineRow}>
                    <Text style={{ color: c.textPrimary, flex: 1, minWidth: 0, fontSize: 12.5 }} numberOfLines={2}>
                      {`${l.itemName} · ${l.qty} × ${formatPaise(l.ratePaise)}`}
                    </Text>
                    <Text style={{ color: c.textPrimary, fontSize: 12.5 }}>{formatPaise(l.totalPaise)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** The visits (bookings) of the job; a tap opens the booking in Bookings. */
export function VisitsCard({ c, visits }: { c: ColorScheme; visits: PartnerBookingView[] }) {
  const { t } = useTranslation();
  if (!visits.length) return <Text style={{ color: c.textSecondary }}>{t('p2.jobs.detail.noVisits')}</Text>;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider, paddingVertical: 4 }]}>
      {visits.map((v, i) => (
        <Pressable
          key={v.id}
          onPress={() => router.push(`/(app)/(tabs)/bookings?id=${v.id}` as Href)}
          accessibilityRole="button"
          style={[styles.visitRow, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider } : null]}
          testID={`job-visit-${v.id}`}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>{dayTimeLabel(v.slotStart, t)}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
              {`${v.code} · ${t(STATUS_LABEL_KEYS[v.status] ?? v.status)}`}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={c.textDisabled} />
        </Pressable>
      ))}
    </View>
  );
}

/** The job's bill, once raised. */
export function InvoiceCard({ c, invoice }: { c: ColorScheme; invoice: JobInvoiceSummary }) {
  const { t } = useTranslation();
  const statusKey = STATUS_LABEL_KEY[invoice.status as PartnerDocumentStatus];
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]} testID="job-invoice">
      <View style={styles.rowWrap}>
        <Text style={{ color: c.textPrimary, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
          {invoice.number ?? t('p2.jobs.detail.draftBill')}
        </Text>
        <Pill c={c} label={statusKey ? t(statusKey) : invoice.status} tone={invoice.status === 'PAID' ? 'good' : 'info'} />
      </View>
      <Text style={{ color: c.textPrimary, fontSize: 18, fontWeight: '700' }}>{formatPaise(invoice.grandPaise)}</Text>
      <View style={styles.rowWrap}>
        <PillButton c={c} tone="outline" icon="file-document-outline" label={t('p2.jobs.detail.viewBill')} onPress={() => router.push(`/(app)/billing/${invoice.documentId}` as Href)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  code: { fontSize: 18, fontWeight: '800', flexShrink: 1 },
  quoteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingVertical: 8 },
  lines: { paddingBottom: 8, gap: 4 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingVertical: 8 },
});
