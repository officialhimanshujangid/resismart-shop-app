import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import {
  Button, Dialog, Divider, IconButton, Menu, Portal, RadioButton, SegmentedButtons, Snackbar, Surface, Text, TextInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { formatPaise, parseRupeesToPaise, paiseToInput } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { documentsApi } from '../../../src/features/billing/documents.api';
import { shareDocumentPdf } from '../../../src/features/billing/pdf';
import { getThermalPrinter } from '../../../src/features/printing';
import { CONVERSION_TARGETS, DOCUMENT_TYPE_LABEL_KEY, PartnerDocumentType, behaviourOf } from '../../../src/features/billing/types';
import { DocumentStatusChip } from '../../../src/features/billing/components/StatusChip';
import { toHref } from '../../../src/features/billing/routeHref';
import { paymentsApi } from '../../../src/features/payments/payments.api';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { PAYMENT_MODES, PAYMENT_MODE_LABEL_KEY, PaymentMode } from '../../../src/features/payments/types';
import { Loading } from '../../../src/features/more/ui';
import { formatI18nDate } from '../../../src/i18n';

/**
 * The channels `sendDocumentSchema` accepts server-side — `documentsApi.send`
 * already spoke this shape (see that file's own header on why: a dialog that
 * posted a list against a route validating one channel would 400 every time).
 * What was missing was a caller offering the choice at all — the only send
 * path on this screen fired `WHATSAPP` unconditionally as a side effect of
 * "Share". This dialog is the mobile twin of web `SendDialog.tsx`.
 *
 * `key` is the WIRE value and stays an English literal — it is what is POSTed
 * and what `sendDocumentSchema`'s enum validates. `labelKey` is the display
 * side and is translated, the same split `DOCUMENT_TYPE_LABEL_KEY` and
 * `GST_STATES` are the worked example of in `features/billing/types.ts`.
 */
const SEND_CHANNELS = [
  { key: 'WHATSAPP', labelKey: 'billing.detail.channel.WHATSAPP' },
  { key: 'EMAIL', labelKey: 'billing.detail.channel.EMAIL' },
  { key: 'SMS', labelKey: 'billing.detail.channel.SMS' },
] as const;
type SendChannel = typeof SEND_CHANNELS[number]['key'];

/**
 * A document's own page: what it says, and the three things this screen does
 * with a real, issued bill — share it (spec §4's "one-tap WhatsApp"), print
 * it (spec §4's printer question, via `getThermalPrinter()`), or cancel it.
 *
 * DRAFT documents seen here are the one edge case worth naming: normally a
 * bill never reaches the server as a DRAFT the partner has to look at — `New
 * Invoice` issues it in the same tap it creates it (via `draftStore`). A
 * lingering DRAFT means either a sync was interrupted between `create` and
 * `issue` on a previous app run (closed correctly — see `draftStore.ts`'s
 * header, `serverDraftId` makes the NEXT sync attempt call `issue`, never
 * `create`, on it) or, rarely, the one ambiguous-`create` gap that same file
 * documents. Either way this screen shows it rather than hiding it, and offers
 * BOTH ways out — "Issue now" and "Discard".
 *
 * The second one is new, and its absence was a genuine one-way door: "Issue
 * now" used to be the only button, so the only way to be rid of a draft the
 * partner did not want was to turn it into a numbered, immutable document and
 * then cancel that with a reason on the record. Editing a draft is still not
 * offered — see `handleDiscardDraft` and this phase's report for why delete and
 * edit are not the same size of job.
 */
export default function DocumentDetailScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { can } = usePartnerEntitlements();
  const canManage = can('INVOICING_MANAGE', 'FULL');

  const query = useQuery({
    queryKey: qk.billing.document(String(id)),
    queryFn: () => documentsApi.get(String(id)),
    enabled: !!id,
  });

  const [busy, setBusy] = useState<'share' | 'print' | 'issue' | 'cancel' | 'convert' | 'pay' | 'send' | 'discard' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // ---- send via channel (C7) ----
  const [sendOpen, setSendOpen] = useState(false);
  const [sendChannel, setSendChannel] = useState<SendChannel>('WHATSAPP');

  // ---- convert (C4) ----
  const [convertMenuOpen, setConvertMenuOpen] = useState(false);

  // ---- record payment (C1) ----
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<PaymentMode>('CASH');
  const [payReference, setPayReference] = useState('');

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.billing.all() });
    void queryClient.invalidateQueries({ queryKey: qk.usage() });
  }, [queryClient]);

  const doc = query.data;
  /**
   * What this document is CALLED on screen — its number once issued, and a
   * translated "<type> draft" placeholder while it has none.
   *
   * The translated half only ever reaches the screen. Everything that puts
   * `label` in a FILE — `shareDocumentPdf`, `getThermalPrinter().print` — is
   * reachable only when `canShareOrPrint` is true, i.e. never on a DRAFT, so the
   * value those see is always `doc.number`. (`pdf.ts#safeFileName` strips
   * anything outside `[a-zA-Z0-9-_ ]` and falls back to "document", so a
   * Devanagari label there would silently lose the name rather than break.)
   */
  const label = doc
    ? (doc.number ?? t('billing.detail.draftLabel', { type: t(DOCUMENT_TYPE_LABEL_KEY[doc.type]) }))
    : '';

  const handleShare = useCallback(async () => {
    if (!doc) return;
    setBusy('share');
    try {
      await shareDocumentPdf(doc._id, label);
      // Best-effort — the share sheet itself already succeeded from the
      // partner's point of view; a failure here just leaves `sentVia` stale,
      // which `partner-document.controller.ts`'s own comment calls the honest
      // trade for not blocking on it.
      documentsApi.send(doc._id, 'WHATSAPP').catch(() => undefined);
    } catch (e: unknown) {
      setToast(apiErrorMessage(e, t('billing.detail.shareFailed')));
    } finally {
      setBusy(null);
    }
  }, [doc, label, t]);

  const handlePrint = useCallback(async () => {
    if (!doc) return;
    setBusy('print');
    try {
      await getThermalPrinter().print({ documentId: doc._id, label });
    } catch (e: unknown) {
      setToast(apiErrorMessage(e, t('billing.detail.printFailed')));
    } finally {
      setBusy(null);
    }
  }, [doc, label, t]);

  /**
   * The key for issuing THIS document, held across retries of that one intent.
   *
   * Same shape as `payIntent` below, and for the same reason — but with less
   * to freeze, because `issue` sends an empty body: the whole request is the
   * document id, so nothing about it can drift between attempts and the only
   * job left is not minting a new key per tap. Reset when the screen moves to a
   * different document; there is nothing else that could make this a genuinely
   * new request, since a document can only be issued once.
   */
  const issueIntentKey = useRef<string | null>(null);
  useEffect(() => {
    issueIntentKey.current = null;
  }, [doc?._id]);

  const handleIssue = useCallback(async () => {
    if (!doc) return;
    setBusy('issue');
    if (!issueIntentKey.current) issueIntentKey.current = newIdempotencyKey('issue');
    try {
      const { document } = await documentsApi.issue(doc._id, issueIntentKey.current);
      queryClient.setQueryData(qk.billing.document(doc._id), document);
      invalidate();
    } catch (e: unknown) {
      setToast(apiErrorMessage(e, t('billing.detail.issueFailed')));
    } finally {
      setBusy(null);
    }
  }, [doc, queryClient, invalidate, t]);

  /**
   * Throw a DRAFT away.
   *
   * `DELETE /partners/me/documents/:id` has existed since the vertical was
   * built and was called by nothing, so a server-side draft could be ISSUED and
   * nothing else: a partner who found one of these — an interrupted sync, or the
   * one ambiguous-`create` gap `draftStore.ts` documents — had exactly one
   * button, and it turned a bill they did not want into a numbered, immutable
   * legal document that then had to be CANCELLED with a reason. Issuing a
   * mistake to get rid of it is a worse audit trail than never issuing it.
   *
   * The server refuses this on anything already issued (409), which is why the
   * button only appears for a DRAFT and why nothing legal can be lost here — a
   * DRAFT has no number and has never been given to a customer.
   *
   * `Alert` rather than the cancel dialog: cancelling asks for a reason that is
   * recorded against a real document, and this has nothing to record.
   */
  const handleDiscardDraft = useCallback(() => {
    if (!doc) return;
    Alert.alert(
      t('billing.detail.discardTitle'),
      t('billing.detail.discardBody'),
      [
        { text: t('billing.detail.discardKeep'), style: 'cancel' },
        {
          text: t('billing.detail.discardConfirm'),
          style: 'destructive',
          onPress: async () => {
            setBusy('discard');
            try {
              await documentsApi.remove(doc._id);
              // Dropped from the cache as well as invalidated: the detail query
              // for a deleted id would otherwise refetch into a 404 while this
              // screen is still unwinding.
              queryClient.removeQueries({ queryKey: qk.billing.document(doc._id) });
              invalidate();
              if (router.canGoBack()) router.back();
              else router.replace('/(app)/(tabs)/billing');
            } catch (e: unknown) {
              setToast(apiErrorMessage(e, t('billing.detail.discardFailed')));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }, [doc, queryClient, invalidate, t]);

  const handleCancel = useCallback(async () => {
    if (!doc) return;
    setBusy('cancel');
    try {
      const result = await documentsApi.cancel(doc._id, cancelReason.trim() || undefined);
      queryClient.setQueryData(qk.billing.document(doc._id), result.data.cancelled);
      invalidate();
      setCancelOpen(false);
      setCancelReason('');
    } catch (e: unknown) {
      setToast(apiErrorMessage(e, t('billing.detail.cancelFailed')));
    } finally {
      setBusy(null);
    }
  }, [doc, cancelReason, queryClient, invalidate, t]);

  /**
   * Turn this document into its target type — C4, mirroring web
   * `ConvertDialog.tsx`. One server transaction writes both documents; the
   * new one is a DRAFT (its own `documentDate` is set to "now" here, exactly
   * as the web dialog does), so this navigates straight to it rather than
   * back to this screen — there is nothing further to do on the source.
   */
  const handleConvert = useCallback(
    async (to: PartnerDocumentType) => {
      if (!doc) return;
      setConvertMenuOpen(false);
      setBusy('convert');
      try {
        const { created } = await documentsApi.convert(doc._id, { to, documentDate: new Date().toISOString() });
        invalidate();
        router.replace(toHref(`/(app)/billing/${created._id}`));
      } catch (e: unknown) {
        setToast(apiErrorMessage(e, t('billing.detail.convertFailed')));
      } finally {
        setBusy(null);
      }
    },
    [doc, invalidate, t],
  );

  /**
   * Send this document on a chosen channel — C7. `handleShare` above already
   * fires a best-effort `WHATSAPP` send as a side effect of the native share
   * sheet; this is the explicit path for a partner who wants Email or SMS
   * instead, or who wants to send WITHOUT opening the share sheet at all.
   */
  const handleSend = useCallback(async () => {
    if (!doc) return;
    setBusy('send');
    try {
      await documentsApi.send(doc._id, sendChannel);
      setSendOpen(false);
      setToast(t('billing.detail.sent', { party: doc.partySnapshot.name }));
    } catch (e: unknown) {
      setToast(apiErrorMessage(e, t('billing.detail.sendFailed')));
    } finally {
      setBusy(null);
    }
  }, [doc, sendChannel, t]);

  /**
   * Record what came in (or went out) against exactly this document — C1.
   * `direction` is never a choice here: it comes straight off the document
   * type's `settlement` column, the same rule `RecordPaymentDialog.tsx` uses
   * on web. Requires `doc.partyId` — `createPaymentSchema` on the server
   * requires a party, and a walk-in document (no party selected when it was
   * raised) genuinely has nobody to attribute the payment to; `canRecordPayment`
   * below gates the button on that so this handler is never reached without one.
   */
  /**
   * The key AND the timestamp for the payment currently being entered.
   *
   * Both, because both have to be stable across a retry. `receivedAt` used to be
   * `new Date().toISOString()` evaluated inside the request — which means a
   * second attempt sends a different body, and the server's idempotency check
   * hashes the body: a moving timestamp would turn every retry into a 422
   * instead of a replay, and the key would be worse than useless. Frozen at the
   * first attempt, dropped whenever the partner changes what they are recording.
   *
   * See `payments.api.ts#create` for why this is the caller's job and not the
   * API helper's.
   */
  const payIntent = useRef<{ key: string; receivedAt: string } | null>(null);
  useEffect(() => {
    payIntent.current = null;
  }, [doc?._id, payAmount, payMode, payReference, payOpen]);

  const handleRecordPayment = useCallback(async () => {
    if (!doc || !doc.partyId) return;
    const outstandingPaise = Math.max(0, doc.totals.grandPaise - doc.paidPaise);
    const amountPaise = parseRupeesToPaise(payAmount) ?? 0;
    if (amountPaise <= 0) {
      setToast(t('billing.detail.amountRequired'));
      return;
    }
    if (amountPaise > outstandingPaise) {
      setToast(t('billing.detail.amountTooLarge', { amount: formatPaise(outstandingPaise) }));
      return;
    }
    const behaviour = behaviourOf(doc.type);
    const direction = behaviour.settlement === 'NONE' ? 'IN' : behaviour.settlement;
    setBusy('pay');
    if (!payIntent.current) {
      payIntent.current = { key: newIdempotencyKey('pay'), receivedAt: new Date().toISOString() };
    }
    try {
      await paymentsApi.create(
        {
          partyId: doc.partyId,
          direction,
          mode: payMode,
          amountPaise,
          allocations: [{ documentId: doc._id, amountPaise }],
          reference: payReference.trim() || undefined,
          receivedAt: payIntent.current.receivedAt,
        },
        payIntent.current.key,
      );
      const fresh = await documentsApi.get(doc._id);
      queryClient.setQueryData(qk.billing.document(doc._id), fresh);
      invalidate();
      setPayOpen(false);
      setPayAmount('');
      setPayReference('');
      setToast(t(direction === 'IN' ? 'billing.detail.paymentInRecorded' : 'billing.detail.paymentOutRecorded'));
    } catch (e: unknown) {
      setToast(apiErrorMessage(e, t('billing.detail.paymentFailed')));
    } finally {
      setBusy(null);
    }
  }, [doc, payAmount, payMode, payReference, queryClient, invalidate, t]);

  /*
    `Loading` rather than a bare `ActivityIndicator`, for the reason
    `(tabs)/billing.tsx` spells out on its own `isPaused` branch: with no signal
    `onlineManager` HOLDS this query instead of firing it, so `isPending` stays
    true and the spinner spins forever with nothing anywhere saying the phone is
    off the network. The shared component reads the same flag the cache is acting
    on and says "No connection — waiting for the network…" instead.
  */
  if (query.isPending) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.topBar}>
          <IconButton icon="arrow-left" onPress={() => router.back()} />
        </View>
        <Loading c={c} label={t('billing.detail.loading')} />
      </SafeAreaView>
    );
  }

  if (!doc) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.topBar}>
          <IconButton icon="arrow-left" onPress={() => router.back()} />
        </View>
        <View style={styles.centerBox}>
          <Text style={{ color: c.textSecondary }}>{apiErrorMessage(query.error, t('billing.detail.notFound'))}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isDraft = doc.status === 'DRAFT';
  const canShareOrPrint = !isDraft;
  const canCancel = canManage && doc.status === 'ISSUED';
  // C7 — mirrors web `canSend`: issued (or later) and not cancelled. Sending a
  // DRAFT makes no sense (it has no number yet); sending a CANCELLED document
  // is nothing the party should receive.
  const canSend = canManage && !isDraft && doc.status !== 'CANCELLED';

  const outstandingPaise = Math.max(0, doc.totals.grandPaise - doc.paidPaise);
  /**
   * Summed off the stored lines, not recomputed — see the note at the totals
   * card. Plain `reduce` rather than `useMemo` because the early returns above
   * (`isPending`, `isError`) mean a hook here would be conditional, and four
   * additions over at most 200 lines is not the cost a memo would save.
   */
  const taxSplit = doc.lines.reduce(
    (acc, l) => ({
      cgstPaise: acc.cgstPaise + l.cgstPaise,
      sgstPaise: acc.sgstPaise + l.sgstPaise,
      igstPaise: acc.igstPaise + l.igstPaise,
      cessPaise: acc.cessPaise + l.cessPaise,
    }),
    { cgstPaise: 0, sgstPaise: 0, igstPaise: 0, cessPaise: 0 },
  );
  /**
   * Which pricing basis this document was written in, so the card can say it
   * once instead of leaving the reader to guess.
   *
   * Only lines that actually carry tax get a vote: on a nil-rated or
   * unregistered bill `taxInclusive` is set but means nothing, and a sentence
   * about tax that is not on the bill is noise on a legal document. Mirrors
   * web `documents/[id]/page.tsx`, which derives the same three cases.
   */
  const taxedLines = doc.totals.taxPaise > 0 ? doc.lines : [];
  const anyInclusiveRate = taxedLines.some((l) => l.taxInclusive);
  const mixedRateBasis = anyInclusiveRate && taxedLines.some((l) => !l.taxInclusive);
  const rateBasisNote = !taxedLines.length
    ? ''
    : mixedRateBasis
      ? t('billing.detail.rateBasisMixed')
      : anyInclusiveRate
        ? t('billing.detail.rateBasisInclusive')
        : t('billing.detail.rateBasisExclusive');
  const behaviour = behaviourOf(doc.type);
  const conversionTargets = CONVERSION_TARGETS[doc.type];
  const settledStatus = doc.status === 'ISSUED' || doc.status === 'PARTIALLY_PAID' || doc.status === 'PAID';
  // C4 — mirrors web's `canConvert`: not already converted, in a status the
  // server will accept, and the type actually has somewhere to go.
  const canConvert = canManage && !doc.convertedToId && settledStatus && conversionTargets.length > 0;
  // C1 — mirrors web's `canRecordPayment`, plus one check the web dialog skips:
  // `createPaymentSchema` requires a `partyId`, so a walk-in document (no party
  // on file) has nobody to record the payment against.
  const paymentEligible = canManage && behaviour.settlement !== 'NONE'
    && (doc.status === 'ISSUED' || doc.status === 'PARTIALLY_PAID') && outstandingPaise > 0;
  const canRecordPayment = paymentEligible && !!doc.partyId;
  const missingPartyForPayment = paymentEligible && !doc.partyId;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-left" onPress={() => router.back()} accessibilityLabel={t('common.back')} />
        <Text style={[styles.topBarTitle, { color: c.textPrimary }]} numberOfLines={1}>
          {label}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.docType, { color: c.textSecondary }]}>{t(DOCUMENT_TYPE_LABEL_KEY[doc.type])}</Text>
              <Text style={[styles.docNumber, { color: c.textPrimary }]}>{label}</Text>
            </View>
            <DocumentStatusChip status={doc.status} c={c} />
          </View>
          {/* `formatI18nDate`, not `toLocaleDateString('en-IN')` — the month is
              a WORD, and this app runs on Hermes where Android's ICU coverage
              cannot be relied on. See that function's own header. */}
          <Text style={[styles.docDate, { color: c.textSecondary }]}>
            {formatI18nDate(doc.documentDate, t)}
          </Text>
        </Surface>

        <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{doc.partySnapshot.name}</Text>
          {!!doc.partySnapshot.phone && <Text style={[styles.cardBody, { color: c.textSecondary }]}>{doc.partySnapshot.phone}</Text>}
          {!!doc.partySnapshot.address && <Text style={[styles.cardBody, { color: c.textSecondary }]}>{doc.partySnapshot.address}</Text>}
          {!!doc.partySnapshot.gstin && <Text style={[styles.cardBody, { color: c.textSecondary }]}>{t('billing.detail.gstin', { gstin: doc.partySnapshot.gstin })}</Text>}
        </Surface>

        <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
          {/*
            The column is CAPTIONED because the number in it changed meaning.

            It used to print `totalPaise` — tax INSIDE — above a "Subtotal" that
            is the sum of the taxable values and CGST/SGST rows that then appear
            to add the same tax a second time. Three true figures reconciling to
            nothing: Σ rows ≠ Subtotal, and no line on the card showed the base.
            A shopkeeper reads that as an arithmetic error on their own invoice
            (`mobile-society`'s invoice card was fixed for exactly this, and the
            web detail page a column at a time).

            An unlabelled money column on the right of an item is read as "what
            this item costs", so switching it to the base without saying so would
            just move the confusion. The caption says which of the two it is, and
            the per-line caption below carries the other one.
          */}
          <View style={styles.itemsHeaderRow}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('billing.detail.items')}</Text>
            <Text style={[styles.columnCaption, { color: c.textSecondary }]}>{t('billing.detail.taxableValue')}</Text>
          </View>
          {doc.lines.map((line, idx) => {
            const lineTaxPaise = line.cgstPaise + line.sgstPaise + line.igstPaise + line.cessPaise;
            return (
              <View key={idx} style={styles.lineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.lineName, { color: c.textPrimary }]}>{line.itemName}</Text>
                  <Text style={[styles.lineMeta, { color: c.textSecondary }]}>
                    {/* `unit` is the stored unit as the partner typed or picked
                        it — server data, not a label, so it is not translated. */}
                    {t('billing.detail.lineQty', { qty: line.qty, unit: line.unit, rate: formatPaise(line.ratePaise) })}
                    {line.discountPaise > 0 ? t('billing.detail.lineDiscount', { amount: formatPaise(line.discountPaise) }) : ''}
                    {/*
                      The rate and how it was treated, together. `ratePaise` alone
                      is ambiguous — ₹118 at 18% is the same line whether the tax
                      was inside it or added to it, and the two produce different
                      money. This is read off the STORED line, which is what
                      `computeDocumentTax` was actually given.
                    */}
                    {line.taxRatePercent > 0
                      ? t('billing.detail.lineTaxSuffix', {
                        rate: line.taxRatePercent,
                        mode: t(line.taxInclusive ? 'billing.detail.lineTaxInclusive' : 'billing.detail.lineTaxExtra'),
                      })
                      : t('billing.detail.lineNoTax')}
                    {line.hsn ? t('billing.detail.lineHsn', { hsn: line.hsn }) : ''}
                  </Text>
                  {/*
                    base → tax → amount, on one line, which is the phone's answer
                    to the web's extra `Taxable` COLUMN and the same order the
                    `LineEditorSheet` preview walks the partner through when they
                    type the line (Taxable value → CGST/SGST → Line total). A
                    fourth column does not fit at 360dp; a caption does, and it
                    keeps what the customer pays for this item on the card rather
                    than making a reader who wants it do the addition.
                  */}
                  {lineTaxPaise > 0 && (
                    <Text style={[styles.lineMeta, { color: c.textSecondary }]}>
                      {t('billing.detail.lineTaxLine', { tax: formatPaise(lineTaxPaise), total: formatPaise(line.totalPaise) })}
                    </Text>
                  )}
                </View>
                <Text style={[styles.lineAmount, { color: c.textPrimary }]}>{formatPaise(line.taxablePaise)}</Text>
              </View>
            );
          })}
          {!!rateBasisNote && <Text style={[styles.cardNote, { color: c.textSecondary }]}>{rateBasisNote}</Text>}

          <Divider style={{ marginVertical: 8 }} />
          {/* "Taxable value", the word `new.tsx` and `LineEditorSheet` already
              use for this number, rather than "Subtotal" — a shopkeeper billing
              on the composer and reading the result here should not have to
              learn that the two screens mean the same thing. */}
          <TotalRow label={t('billing.detail.taxableValue')} value={doc.totals.subPaise} c={c} />
          {/*
            A caption, NOT a row. `subPaise` is already post-discount
            (`partner-tax.util.ts`: `taxablePaise` is computed from
            `gross − discount`, and `totals.discountPaise` is documented as
            "already reflected in subPaise"), so the signed "Discount" row that
            used to sit here invited the reader to subtract it a second time and
            land below the printed total. Web drops the row for the same reason;
            the figure stays because "how much did I give away" is worth knowing,
            just not as an operation.
          */}
          {doc.totals.discountPaise > 0 && (
            <Text style={[styles.cardNote, { color: c.textSecondary }]}>
              {t('billing.detail.afterDiscounts', { amount: formatPaise(doc.totals.discountPaise) })}
            </Text>
          )}
          {/*
            The tax, split the way it is filed, summed from the STORED lines —
            never recomputed. `partner-document.model.ts` is explicit that an
            issued document's numbers are what `computeDocumentTax()` returned
            and must not be re-derived, and `partner-document-render.service.ts`
            builds the printed footer from the same stored lines for the same
            reason. `doc.totals` carries only the single `taxPaise`, so the
            split has to come off the lines; the two always agree because both
            were written in one pass.

            One aggregate "Tax" row was what a partner saw before, and it is the
            row a customer disputes: a GST invoice states CGST and SGST (or
            IGST) separately, and a screen that will not show what the paper
            shows is a screen the shopkeeper stops trusting.
          */}
          {taxSplit.igstPaise > 0 && <TotalRow label={t('billing.detail.igst')} value={taxSplit.igstPaise} c={c} />}
          {taxSplit.cgstPaise > 0 && <TotalRow label={t('billing.detail.cgst')} value={taxSplit.cgstPaise} c={c} />}
          {taxSplit.sgstPaise > 0 && <TotalRow label={t('billing.detail.sgst')} value={taxSplit.sgstPaise} c={c} />}
          {taxSplit.cessPaise > 0 && <TotalRow label={t('billing.detail.cess')} value={taxSplit.cessPaise} c={c} />}
          {doc.totals.taxPaise === 0 && <TotalRow label={t('billing.detail.tax')} value={0} c={c} />}
          {/*
            The other row on this card that could not be added up, and the only
            one where NOT adding it is correct: under reverse charge
            `computeDocumentTax` leaves the tax out of `grandPaise` on purpose
            (the recipient pays it to the government direct), so the split above
            is stated — a tax document must state it — but the Total below is
            `taxable + round off` alone. Said here, between the tax and the
            total, because that is where a reader adding downwards needs it, not
            in a footnote they reach after the number has already surprised them.
          */}
          {doc.reverseCharge && doc.totals.taxPaise > 0 && (
            <Text style={[styles.cardNote, { color: c.textSecondary }]}>
              {t('billing.detail.reverseCharge')}
            </Text>
          )}
          {doc.totals.roundOffPaise !== 0 && <TotalRow label={t('billing.detail.roundOff')} value={doc.totals.roundOffPaise} c={c} />}
          <TotalRow label={t('billing.detail.total')} value={doc.totals.grandPaise} c={c} bold />
          {doc.paidPaise > 0 && <TotalRow label={t('billing.detail.paid')} value={doc.paidPaise} c={c} />}
          {doc.status !== 'DRAFT' && doc.paidPaise < doc.totals.grandPaise && (
            <TotalRow label={t('billing.detail.outstanding')} value={doc.totals.grandPaise - doc.paidPaise} c={c} bold tone={c.error} />
          )}
        </Surface>

        {doc.status === 'CANCELLED' && !!doc.cancelledReason && (
          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('billing.detail.cancelledTitle')}</Text>
            <Text style={[styles.cardBody, { color: c.textSecondary }]}>{doc.cancelledReason}</Text>
          </Surface>
        )}

        {!!doc.convertedToId && (
          <Surface style={[styles.card, { backgroundColor: c.surfaceVariant }]} elevation={0}>
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              {t('billing.detail.convertedInto')}
            </Text>
            <Button
              mode="text"
              compact
              onPress={() => router.push(toHref(`/(app)/billing/${doc.convertedToId}`))}
              style={{ alignSelf: 'flex-start' }}
            >
              {t('billing.detail.viewIt')}
            </Button>
          </Surface>
        )}

        {missingPartyForPayment && (
          <Surface style={[styles.card, { backgroundColor: c.surfaceVariant }]} elevation={0}>
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              {t('billing.detail.noPartyForPayment')}
            </Text>
          </Surface>
        )}

        {isDraft && (
          <Surface style={[styles.card, { backgroundColor: c.surfaceVariant }]} elevation={0}>
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              {t('billing.detail.draftNotice')}
            </Text>
          </Surface>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
        {isDraft && canManage ? (
          /* Two ways out of a draft, not one. "Issue now" used to be the only
             button on this bar, which made issuing the only way to make an
             unwanted draft go away — and an issued document is numbered,
             immutable and can then only be CANCELLED with a reason on the
             record. See `handleDiscardDraft`. */
          <View style={styles.actionRow}>
            <Button
              mode="outlined"
              icon="delete-outline"
              disabled={!!busy}
              loading={busy === 'discard'}
              onPress={handleDiscardDraft}
              textColor={c.error}
              style={[styles.actionButton, { flex: 1 }]}
            >
              {t('billing.detail.discard')}
            </Button>
            <Button
              mode="contained"
              loading={busy === 'issue'}
              disabled={!!busy}
              onPress={handleIssue}
              style={[styles.actionButton, { flex: 1 }]}
            >
              {t('billing.detail.issueNow')}
            </Button>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <Button
              mode="contained"
              icon="whatsapp"
              loading={busy === 'share'}
              disabled={!!busy || !canShareOrPrint}
              onPress={handleShare}
              style={[styles.actionButton, { flex: 1 }]}
            >
              {t('billing.detail.share')}
            </Button>
            <Button
              mode="contained-tonal"
              icon="printer-outline"
              loading={busy === 'print'}
              disabled={!!busy || !canShareOrPrint}
              onPress={handlePrint}
              style={[styles.actionButton, { flex: 1 }]}
            >
              {t('billing.detail.print')}
            </Button>
          </View>
        )}
        {(canRecordPayment || canConvert) && (
          <View style={[styles.actionRow, { marginTop: 8 }]}>
            {canRecordPayment && (
              <Button
                mode="contained-tonal"
                icon="cash-plus"
                disabled={!!busy}
                onPress={() => { setPayAmount(paiseToInput(outstandingPaise)); setPayReference(''); setPayMode('CASH'); setPayOpen(true); }}
                style={[styles.actionButton, { flex: 1 }]}
              >
                {t('billing.detail.recordPayment')}
              </Button>
            )}
            {canConvert && (
              <Menu
                visible={convertMenuOpen}
                onDismiss={() => setConvertMenuOpen(false)}
                anchor={
                  <Button
                    mode="outlined"
                    icon="swap-horizontal"
                    loading={busy === 'convert'}
                    disabled={!!busy}
                    onPress={() => setConvertMenuOpen(true)}
                    style={[styles.actionButton, { flex: 1 }]}
                  >
                    {t('billing.detail.convert')}
                  </Button>
                }
              >
                {/* `target`, not `t` — the callback used to shadow the translator. */}
                {conversionTargets.map((target) => (
                  <Menu.Item
                    key={target}
                    onPress={() => handleConvert(target)}
                    title={t('billing.detail.convertTo', { type: t(DOCUMENT_TYPE_LABEL_KEY[target]).toLowerCase() })}
                  />
                ))}
              </Menu>
            )}
          </View>
        )}
        {canSend && (
          <Button
            mode="outlined"
            icon="send"
            disabled={!!busy}
            onPress={() => { setSendChannel('WHATSAPP'); setSendOpen(true); }}
            style={{ marginTop: 8, borderRadius: radii.field }}
          >
            {t('billing.detail.send')}
          </Button>
        )}
        {canCancel && (
          /* A partner with `INVOICING_MANAGE` may void an ISSUED document — this
             is the destructive action, not the dialog's "Not now". */
          <Button mode="text" textColor={c.error} disabled={!!busy} onPress={() => setCancelOpen(true)} style={{ marginTop: 4 }}>
            {t('billing.detail.cancelDocument')}
          </Button>
        )}
      </View>

      <Portal>
        <Dialog visible={cancelOpen} onDismiss={() => setCancelOpen(false)}>
          <Dialog.Title>{t('billing.detail.cancelTitle', { label })}</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 10 }}>{t('billing.detail.cancelBody')}</Text>
            <TextInput
              mode="outlined"
              label={t('billing.detail.cancelReason')}
              value={cancelReason}
              onChangeText={setCancelReason}
              outlineStyle={{ borderRadius: radii.field }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCancelOpen(false)} disabled={busy === 'cancel'}>{t('common.notNow')}</Button>
            {/* A7: `disabled` used to be implied by `loading` alone, which
                react-native-paper does NOT do on its own — a fast double-tap
                here could fire `handleCancel` twice before the first request
                settled. */}
            <Button loading={busy === 'cancel'} disabled={busy === 'cancel'} onPress={handleCancel} textColor={c.error}>
              {t('billing.detail.cancelDocument')}
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={payOpen} onDismiss={() => setPayOpen(false)}>
          <Dialog.Title>
            {t(behaviour.settlement === 'OUT' ? 'billing.detail.payTitleOut' : 'billing.detail.payTitleIn')}
          </Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>
              {t('billing.detail.payAgainst', {
                label,
                outstanding: formatPaise(outstandingPaise),
                total: formatPaise(doc.totals.grandPaise),
              })}
            </Text>
            <TextInput
              mode="outlined"
              label={t('billing.detail.payAmount')}
              keyboardType="decimal-pad"
              value={payAmount}
              onChangeText={setPayAmount}
              outlineStyle={{ borderRadius: radii.field }}
            />
            <SegmentedButtons
              value={payMode}
              onValueChange={(v) => setPayMode(v as PaymentMode)}
              density="small"
              buttons={PAYMENT_MODES.map((m) => ({ value: m, label: t(PAYMENT_MODE_LABEL_KEY[m]) }))}
            />
            <TextInput
              mode="outlined"
              label={t('billing.detail.payReference')}
              placeholder={t('billing.detail.payReferencePlaceholder')}
              value={payReference}
              onChangeText={setPayReference}
              outlineStyle={{ borderRadius: radii.field }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPayOpen(false)}>{t('common.cancel')}</Button>
            <Button loading={busy === 'pay'} disabled={busy === 'pay'} onPress={handleRecordPayment}>
              {t('common.save')}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* C7 — send channel picker, mirroring web `SendDialog.tsx`. One
            channel per request, matching `sendDocumentSchema`'s enum. */}
        <Dialog visible={sendOpen} onDismiss={() => setSendOpen(false)}>
          <Dialog.Title>{t('billing.detail.sendTitle', { label })}</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 8 }}>
              {t('billing.detail.sendTo', { party: doc.partySnapshot.name })}
            </Text>
            <RadioButton.Group value={sendChannel} onValueChange={(v) => setSendChannel(v as SendChannel)}>
              {SEND_CHANNELS.map((ch) => (
                <RadioButton.Item key={ch.key} label={t(ch.labelKey)} value={ch.key} labelStyle={{ color: c.textPrimary }} />
              ))}
            </RadioButton.Group>
            {!!doc.sentVia?.length && (
              <Text style={{ color: c.textDisabled, fontSize: 11, marginTop: 4 }}>
                {/* `sentVia` holds the server's own channel names — data on the
                    record, listed back verbatim rather than re-labelled here. */}
                {t('billing.detail.alreadySentVia', { channels: doc.sentVia.join(', ') })}
              </Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSendOpen(false)} disabled={busy === 'send'}>{t('common.cancel')}</Button>
            <Button loading={busy === 'send'} disabled={busy === 'send'} onPress={handleSend}>
              {t('billing.detail.send')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>
        {toast}
      </Snackbar>
    </SafeAreaView>
  );
}

function TotalRow({
  label, value, c, bold, tone,
}: {
  label: string;
  value: number;
  c: ReturnType<typeof themeColors>;
  bold?: boolean;
  tone?: string;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={{ color: tone ?? c.textSecondary, fontSize: bold ? 15 : 13, fontWeight: bold ? '600' : '500' }}>
        {label}
      </Text>
      <Text style={{ color: tone ?? c.textPrimary, fontSize: bold ? 15 : 13, fontWeight: bold ? '600' : '500' }}>
        {formatPaise(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  topBarTitle: { fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  card: { borderRadius: radii.card, padding: 14, gap: 6 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  docType: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  docNumber: { fontSize: 18, fontWeight: '600', marginTop: 2 },
  docDate: { fontSize: 12, marginTop: 4 },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  cardBody: { fontSize: 13 },
  itemsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  columnCaption: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  // `flex-start`, not `center`: a taxed line now carries three lines of text on
  // the left, and an amount floating halfway down them reads as belonging to the
  // caption rather than to the item it prices.
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 6 },
  lineName: { fontSize: 13, fontWeight: '600' },
  lineMeta: { fontSize: 11, marginTop: 2 },
  lineAmount: { fontSize: 13, fontWeight: '600', marginLeft: 12 },
  cardNote: { fontSize: 11, lineHeight: 15, marginTop: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bottomBar: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionButton: { borderRadius: radii.field },
});
