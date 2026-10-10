import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import Animated from 'react-native-reanimated';
import { useToast } from '../../../src/components/ui'; // M22
import { useShake } from '../../../src/components/ui/Feedback'; // M22
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { formatPaise } from '../../../src/lib/money';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { Card, EmptyBlock, Screen, SectionLabel } from '../../../src/features/more/ui';
import { Banner, PillButton, Stepper } from '../../../src/features/p1/ui';
import { useModuleSettings } from '../../../src/features/p2/useCategoryModules';
import { dayTimeLabel } from '../../../src/features/p2/dates';
import { LineEditorSheet } from '../../../src/features/billing/components/LineEditorSheet';
import { bookingApi } from '../../../src/features/bookings/booking.api';
import { jobKeys, jobsApi } from '../../../src/features/jobs/api';
import { clampValidDays, mayQuote, prefillFromQuotes, wireLines } from '../../../src/features/jobs/logic';
import { lineFromProduct, nextLineKey, useLineList } from '../../../src/features/jobs/useLines';
import { CatalogueSearch } from '../../../src/features/jobs/components/CatalogueSearch';
import { LineRows, LineTotals } from '../../../src/features/jobs/components/LineRows';

/**
 * QUOTE ON THE PHONE (S-priority). `?bookingId=` (required) opens — or re-quotes —
 * the job on that booking; `&jobId=` prefills the lines from the job's latest
 * quote. Parts from the catalogue, one-off lines, qty, a live preview priced by
 * the mirror of the server's tax engine, "Valid for N days", notes, then ONE
 * full-width "Send quote" at the bottom. The key is minted on the first tap and
 * re-sent on a retry of the same quote.
 */
export default function JobQuoteScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const qc = useQueryClient();
  const { bookingId, jobId } = useLocalSearchParams<{ bookingId?: string; jobId?: string }>();
  const { can, roleLimits } = usePartnerEntitlements();
  const allowed = mayQuote(can);
  const { settings } = useModuleSettings();
  const list = useLineList([], roleLimits);

  const booking = useQuery({
    queryKey: ['p2', 'jobs', 'booking', bookingId ?? ''],
    queryFn: () => bookingApi.get(String(bookingId)),
    enabled: !!bookingId,
  });
  const job = useQuery({
    queryKey: jobKeys.detail(String(jobId ?? '')),
    queryFn: () => jobsApi.get(String(jobId)),
    enabled: !!jobId,
  });

  // Prefill once from the latest quote — after that the shop owns the form.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !job.data) return;
    seeded.current = true;
    const lines = prefillFromQuotes(job.data.quotes);
    if (lines.length) list.setLines(lines.map((l) => ({ ...l, key: nextLineKey() })));
  }, [job.data, list]);

  // Validity: the module setting until the person touches the stepper.
  const [validDays, setValidDays] = useState(settings.jobs.quoteValidityDays);
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setValidDays(clampValidDays(settings.jobs.quoteValidityDays));
  }, [settings.jobs.quoteValidityDays]);

  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const { style: shakeStyle, shake } = useShake();

  const body = useMemo(() => ({
    lines: wireLines(list.lines),
    validDays: clampValidDays(validDays),
    ...(notes.trim() ? { notes: notes.trim().slice(0, 500) } : {}),
  }), [list.lines, validDays, notes]);
  // One key per decided quote: the same body retried keeps its key; a changed body is a new decision.
  const keyRef = useRef<{ sig: string; key: string } | null>(null);

  const send = async () => {
    if (!bookingId || busy) return;
    if (!body.lines.length) { setError(t('errors.JOB_QUOTE_EMPTY')); shake(); return; }
    if (list.violation) { setError(t(`errors.${list.violation.code}`, list.violation.params)); shake(); return; }
    const sig = JSON.stringify(body);
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: newIdempotencyKey('job-quote') };
    setBusy(true);
    setError(null);
    try {
      const out = await jobsApi.quote(String(bookingId), body, keyRef.current.key);
      await qc.invalidateQueries({ queryKey: jobKeys.all() });
      // M22 — success: one buzz and a line with the quote number, then the job.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      toast.show({ tone: 'success', message: t('p2.jobs.quote.sent', { number: out.quote?.number ?? '' }) });
      router.replace(`/jobs/${out.job.id}` as Href);
    } catch (e) {
      setError(apiErrorMessage(e, t('p2.jobs.quote.failed')));
      shake();
    } finally {
      setBusy(false);
    }
  };

  if (!bookingId || !allowed) {
    return (
      <Screen title={t('p2.jobs.quote.title')} c={c}>
        <EmptyBlock c={c} icon="lock-outline" title={!bookingId ? t('p2.jobs.quote.noBooking') : t('p2.jobs.quote.denied')} />
      </Screen>
    );
  }

  const b = booking.data;
  return (
    <Screen title={t('p2.jobs.quote.title')} subtitle={b ? `${b.code} · ${b.serviceSnapshot?.name ?? ''}` : undefined} c={c} scroll={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {b ? (
            <Card c={c}>
              <Text style={{ color: c.textPrimary, fontWeight: '700' }} numberOfLines={1}>
                {[b.customer?.name, b.customer?.flatLabel].filter(Boolean).join(' · ')}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
                {`${b.serviceSnapshot?.name ?? ''} · ${dayTimeLabel(b.slotStart, t)}`}
              </Text>
            </Card>
          ) : null}

          <SectionLabel c={c}>{t('p2.jobs.quote.items')}</SectionLabel>
          <Card c={c}>
            <CatalogueSearch c={c} onPick={(p) => list.addOrBump(lineFromProduct(p))} />
            {list.lines.length === 0 ? (
              <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 8 }}>{t('p2.jobs.quote.noLines')}</Text>
            ) : (
              <View style={{ marginTop: 8 }}><LineRows c={c} list={list} /></View>
            )}
            <View style={{ marginTop: 8, flexDirection: 'row' }}>
              <PillButton c={c} tone="outline" icon="pencil-plus-outline" label={t('p2.jobs.quote.addItem')} onPress={() => list.setEditing('NEW')} testID="job-quote-add-item" />
            </View>
          </Card>

          <Card c={c}>
            <LineTotals c={c} list={list} />
          </Card>

          <SectionLabel c={c}>{t('p2.jobs.quote.validity')}</SectionLabel>
          <Card c={c}>
            <View style={styles.validRow}>
              <Text style={{ color: c.textPrimary, flex: 1, minWidth: 0 }} numberOfLines={2}>
                {t('p2.jobs.quote.validFor', { count: clampValidDays(validDays) })}
              </Text>
              <Stepper
                c={c}
                value={validDays}
                min={1}
                max={30}
                onChange={(n) => { touched.current = true; setValidDays(clampValidDays(n)); }}
                label={t('p2.jobs.quote.validDays')}
                testID="job-quote-valid-days"
              />
            </View>
          </Card>

          <TextInput
            mode="outlined"
            label={t('p2.jobs.quote.notes')}
            value={notes}
            onChangeText={(v) => setNotes(v.slice(0, 500))}
            multiline
            outlineStyle={{ borderRadius: radii.field }}
            style={{ backgroundColor: 'transparent' }}
          />

          {error ? <Animated.View style={shakeStyle}><Banner c={c} tone="error" body={error} testID="job-quote-error" /></Animated.View> : null}
        </ScrollView>

        <View style={[styles.bottom, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
          <Button
            mode="contained"
            onPress={send}
            loading={busy}
            disabled={busy || list.lines.length === 0}
            style={{ borderRadius: radii.field }}
            testID="job-quote-send"
          >
            {t('p2.jobs.quote.send', { amount: formatPaise(list.preview.totals.grandPaise) })}
          </Button>
        </View>
      </KeyboardAvoidingView>

      <LineEditorSheet
        visible={list.editing !== null}
        line={list.editingLine}
        supplierState={list.tax.supplierState}
        gstApplicable={list.tax.gstApplicable}
        onDismiss={() => list.setEditing(null)}
        onSave={list.save}
        onRemove={list.editing && list.editing !== 'NEW'
          ? () => { list.remove(String(list.editing)); list.setEditing(null); }
          : undefined}
        c={c}
        lockRate={roleLimits?.mayEditPrice === false && !!list.editingLine?.itemId}
        discountCapPercent={roleLimits?.maxDiscountPercent}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  validRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  bottom: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
