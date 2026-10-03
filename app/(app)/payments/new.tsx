import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import {
  ActivityIndicator, Button, Checkbox, Divider, SegmentedButtons, Snackbar, Surface, Text, TextInput,
} from 'react-native-paper';
import { FitSegments } from '../../../src/components/FitSegments'; // >>> WEB-UI
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { formatI18nDate } from '../../../src/i18n';
import { DateField } from '../../../src/components/DateField';
import { usePartnerEntitlements } from '../../../src/hooks';
import { formatPaise, parseRupeesToPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { partiesApi } from '../../../src/api/parties.api';
import { documentsApi } from '../../../src/features/billing/documents.api';
import { PartnerDocumentRecord, PartnerPartyRecord } from '../../../src/features/billing/types';
import { paymentsApi } from '../../../src/features/payments/payments.api';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { toHref } from '../../../src/features/billing/routeHref';
import { AccountPicker } from '../../../src/features/money/components/AccountPicker';
import {
  PAYMENT_MODES, PAYMENT_MODE_LABEL_KEY, PaymentDirection, PaymentMode, SETTLEABLE_TYPES, outstandingOf,
} from '../../../src/features/payments/types';

/**
 * Record a payment, either direction, with allocation across open documents —
 * C1's full build, mirroring web `PaymentDialog.tsx`. Reached from the
 * Payments list's "+"; `billing/[id].tsx` has its own, narrower record-payment
 * action for settling exactly one document without leaving the bill.
 *
 * Allocation is per-document, not per-Rupee-locked: ticking a document fills
 * its whole outstanding by default, every box stays editable, and whatever the
 * amount does not cover is shown as on-account — the server stores that
 * explicitly rather than losing it to rounding (see `types.ts`'s header).
 */

const nowLocal = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** DateField's `datetime` value ("YYYY-MM-DD HH:MM") → ISO, for the wire. */
function toIso(value: string): string {
  const d = new Date(value.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export default function NewPaymentScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const params = useLocalSearchParams<{ direction?: string }>();
  const { can } = usePartnerEntitlements();
  const canManage = can('INVOICING_MANAGE', 'FULL');

  const [direction, setDirection] = useState<PaymentDirection>(params.direction === 'OUT' ? 'OUT' : 'IN');

  const [partyQuery, setPartyQuery] = useState('');
  const [partyResults, setPartyResults] = useState<PartnerPartyRecord[]>([]);
  const [partySearching, setPartySearching] = useState(false);
  const [party, setParty] = useState<PartnerPartyRecord | null>(null);

  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [amountRupees, setAmountRupees] = useState('');
  const [reference, setReference] = useState('');
  const [receivedAt, setReceivedAt] = useState(nowLocal());
  /** '' = the server's default account for the mode (P1 §8). */
  const [accountId, setAccountId] = useState('');

  const [docs, setDocs] = useState<PartnerDocumentRecord[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [alloc, setAlloc] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // A direction switch invalidates the party and everything downstream of it —
  // a customer picked for a receipt is not necessarily a supplier for a payment out.
  useEffect(() => {
    setParty(null);
    setPartyQuery('');
    setPartyResults([]);
    setDocs([]);
    setAlloc({});
  }, [direction]);

  useEffect(() => {
    // `handle`, not `t` — this file holds a translator now.
    const handle = setTimeout(async () => {
      if (!partyQuery.trim()) {
        setPartyResults([]);
        return;
      }
      setPartySearching(true);
      try {
        const side = direction === 'IN' ? 'CUSTOMER' : 'SUPPLIER';
        const rows = await partiesApi.search(partyQuery.trim(), side, 20);
        setPartyResults(rows);
      } catch {
        setPartyResults([]);
      } finally {
        setPartySearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [partyQuery, direction]);

  const loadDocs = useCallback(async (partyId: string) => {
    setLoadingDocs(true);
    try {
      const types = SETTLEABLE_TYPES[direction].join(',');
      const res = await documentsApi.list({ partyId, type: types, status: 'ISSUED,PARTIALLY_PAID', limit: 100 });
      setDocs(res.data.filter((d) => outstandingOf(d) > 0));
    } catch {
      setDocs([]);
    } finally {
      setLoadingDocs(false);
    }
  }, [direction]);

  useEffect(() => {
    if (party) void loadDocs(party._id);
    else { setDocs([]); setAlloc({}); }
  }, [party, loadDocs]);

  const amountPaise = parseRupeesToPaise(amountRupees) ?? 0;
  const allocatedPaise = useMemo(
    () => Object.values(alloc).reduce((s, v) => s + (parseRupeesToPaise(v) ?? 0), 0),
    [alloc],
  );
  const onAccountPaise = Math.max(0, amountPaise - allocatedPaise);
  const overAllocated = allocatedPaise > amountPaise;

  const toggleDoc = (d: PartnerDocumentRecord, checked: boolean) => {
    setAlloc((prev) => {
      const next = { ...prev };
      if (!checked) { delete next[d._id]; return next; }
      const remaining = Math.max(0, amountPaise - allocatedPaise);
      const fill = Math.min(outstandingOf(d), remaining || outstandingOf(d));
      next[d._id] = (fill / 100).toString();
      return next;
    });
  };

  const setDocAmount = (documentId: string, value: string) =>
    setAlloc((prev) => ({ ...prev, [documentId]: value }));

  const canSave = !!party && amountPaise > 0 && !overAllocated;

  /**
   * One `Idempotency-Key` per payment the partner is entering, held across
   * retries of THAT payment.
   *
   * Recording a payment twice records the money twice — two rows, the allocated
   * document's `paidPaise` moved twice, the party's balance knocked down twice —
   * and the double tap is not theoretical: Save disables itself while the
   * request is in flight, and the cold-start timeout window (up to a minute, see
   * `api/axios.ts`) re-enables it well before a sleeping server has answered.
   * `partner-payment.routes.ts` has carried `idempotent('partner.payment.create')`
   * all along and says in its own header that the client half is exactly this;
   * `payments.api.ts` was posting bare, so nothing was ever protected.
   *
   * A REF, not state — nothing renders from it and re-rendering on a key change
   * would be noise. Minted lazily at the first attempt rather than on mount, so
   * an abandoned form burns nothing.
   */
  const intentKey = useRef<string | null>(null);

  /**
   * A change to what is being paid is a DIFFERENT payment, so it gets a new key.
   *
   * Reusing a key across two genuinely different bodies is a 422 from the
   * server's request-hash check, not a silent replay — deliberately, so that a
   * client bug is loud. Dropping the key here is how this screen stays on the
   * right side of that: retrying the same figures replays, changing the figures
   * creates.
   *
   * `alloc` is included by its serialised form rather than by identity: it is a
   * new object on every keystroke in an allocation box, and the value is what
   * decides whether this is the same payment.
   */
  const allocSignature = JSON.stringify(alloc);
  useEffect(() => {
    intentKey.current = null;
  }, [party?._id, direction, mode, amountPaise, reference, receivedAt, allocSignature, accountId]);

  const handleSave = useCallback(async () => {
    if (!canSave || !party) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const allocations = Object.entries(alloc)
        .map(([documentId, v]) => ({ documentId, amountPaise: parseRupeesToPaise(v) ?? 0 }))
        .filter((a) => a.amountPaise > 0);
      if (!intentKey.current) intentKey.current = newIdempotencyKey('pay');
      await paymentsApi.create(
        {
          partyId: party._id,
          direction,
          mode,
          amountPaise,
          allocations,
          reference: reference.trim() || undefined,
          receivedAt: toIso(receivedAt),
          ...(accountId ? { accountId } : {}),
        },
        intentKey.current,
      );
      router.replace(toHref(`/(app)/payments?direction=${direction}`));
    } catch (e: unknown) {
      // The key is deliberately NOT cleared here. A failure is precisely when a
      // retry happens, and a retry of the same payment must carry the same key —
      // otherwise the second attempt after a timeout that actually landed is a
      // second payment.
      setErrorMessage(apiErrorMessage(e, t('payments.new.saveFailed')));
    } finally {
      setSaving(false);
    }
  }, [canSave, party, alloc, direction, mode, amountPaise, reference, receivedAt, accountId, t]);

  if (!canManage) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.deniedBox}>
          <Text style={[styles.deniedTitle, { color: c.textPrimary }]}>{t('payments.new.deniedTitle')}</Text>
          <Text style={[styles.deniedBody, { color: c.textSecondary }]}>
            {t('payments.new.deniedBody')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Button onPress={() => router.back()} compact>{t('common.close')}</Button>
        <Text style={[styles.topBarTitle, { color: c.textPrimary }]}>{t('payments.new.title')}</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SegmentedButtons
          value={direction}
          onValueChange={(v) => setDirection(v as PaymentDirection)}
          density="small"
          // `value` is the wire `direction` on `POST /partners/me/payments` and
          // never moves; only the label is translated.
          buttons={[
            { value: 'IN', label: t('payments.new.moneyIn') },
            { value: 'OUT', label: t('payments.new.moneyOut') },
          ]}
        />

        <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{direction === 'IN' ? t('payments.new.customer') : t('payments.new.supplier')}</Text>
          {party ? (
            <View style={styles.selectedPartyRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectedPartyName, { color: c.textPrimary }]}>{party.name}</Text>
                {!!party.phone && <Text style={[styles.selectedPartyMeta, { color: c.textSecondary }]}>{party.phone}</Text>}
              </View>
              <Button mode="text" compact onPress={() => setParty(null)}>{t('payments.new.change')}</Button>
            </View>
          ) : (
            <View>
              <TextInput
                mode="outlined"
                // The same catalogue entry `billing/new.tsx`'s party picker uses
                // — one search box, one sentence, in both places it appears.
                placeholder={t('billing.new.searchParty')}
                value={partyQuery}
                onChangeText={setPartyQuery}
                outlineStyle={{ borderRadius: radii.field }}
                style={{ backgroundColor: 'transparent' }}
                right={partySearching ? <TextInput.Icon icon={() => <ActivityIndicator size={16} />} /> : undefined}
              />
              {partyResults.map((p) => (
                <Pressable key={p._id} onPress={() => setParty(p)} style={styles.resultRow}>
                  <Text style={[styles.resultName, { color: c.textPrimary }]}>{p.name}</Text>
                  {!!p.phone && <Text style={[styles.resultMeta, { color: c.textSecondary }]}>{p.phone}</Text>}
                </Pressable>
              ))}
            </View>
          )}
        </Surface>

        <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
          <View style={styles.row2}>
            <TextInput
              mode="outlined"
              label={t('payments.new.amount')}
              keyboardType="decimal-pad"
              value={amountRupees}
              onChangeText={setAmountRupees}
              style={{ flex: 1, backgroundColor: 'transparent' }}
              outlineStyle={{ borderRadius: radii.field }}
            />
          </View>
          {/* >>> WEB-UI — five modes: each segment as wide as its word, row scrolls if needed. */}
          <FitSegments
            value={mode}
            onValueChange={(v) => setMode(v as PaymentMode)}
            density="small"
            buttons={PAYMENT_MODES.map((m) => ({ value: m, label: t(PAYMENT_MODE_LABEL_KEY[m]) }))}
          />
          {/* <<< WEB-UI */}
          <TextInput
            mode="outlined"
            label={t('payments.new.reference')}
            placeholder={t('payments.new.referencePlaceholder')}
            value={reference}
            onChangeText={setReference}
            outlineStyle={{ borderRadius: radii.field }}
            style={{ backgroundColor: 'transparent' }}
          />
          <DateField label={t('payments.new.receivedAt')} value={receivedAt} onChangeText={setReceivedAt} mode="datetime" />
          <AccountPicker c={c} value={accountId} onChange={setAccountId} />
        </Surface>

        <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
            {/* Two whole sentences rather than one with `their`/`your` slotted
                in: a possessive is not a substitutable word in Hindi, and a
                key that interpolates one cannot be translated correctly. */}
            {direction === 'IN' ? t('payments.new.applyAgainstIn') : t('payments.new.applyAgainstOut')}
          </Text>
          {!party ? (
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('payments.new.pickParty')}</Text>
          ) : loadingDocs ? (
            <ActivityIndicator style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
          ) : docs.length === 0 ? (
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('payments.new.nothingOutstanding')}</Text>
          ) : (
            docs.map((d) => {
              const checked = d._id in alloc;
              return (
                <View key={d._id} style={[styles.docRow, { borderColor: c.divider }]}>
                  <Checkbox status={checked ? 'checked' : 'unchecked'} onPress={() => toggleDoc(d, !checked)} />
                  <View style={{ flex: 1 }}>
                    {/* `d.number` is the server's own document number, verbatim;
                        `billing.status.DRAFT` is the same word the Billing list
                        already uses for a document that has not got one yet. */}
                    <Text style={[styles.docNumber, { color: c.textPrimary }]}>{d.number ?? t('billing.status.DRAFT')}</Text>
                    <Text style={[styles.docMeta, { color: c.textSecondary }]}>
                      {/* `formatI18nDate`, not `toLocaleDateString('en-IN')` —
                          see `src/i18n/index.ts#formatI18nDate`. */}
                      {t('payments.new.docMeta', {
                        date: formatI18nDate(d.documentDate, t),
                        amount: formatPaise(outstandingOf(d)),
                      })}
                    </Text>
                  </View>
                  {checked && (
                    <TextInput
                      mode="outlined"
                      dense
                      keyboardType="decimal-pad"
                      value={alloc[d._id]}
                      onChangeText={(v) => setDocAmount(d._id, v)}
                      style={styles.docAmountInput}
                      outlineStyle={{ borderRadius: radii.field }}
                    />
                  )}
                </View>
              );
            })
          )}
        </Surface>

        <Surface
          style={[
            styles.card,
            { backgroundColor: overAllocated ? c.error + '18' : c.surfaceVariant },
          ]}
          elevation={0}
        >
          <View style={styles.totalsRow}>
            <Text style={{ color: overAllocated ? c.error : c.textSecondary, fontWeight: '600', fontSize: 12 }}>
              {overAllocated ? t('payments.new.overAllocated') : t('payments.new.leftOnAccount')}
            </Text>
            <Text style={{ color: overAllocated ? c.error : c.textPrimary, fontWeight: '600', fontSize: 13 }}>
              {overAllocated ? formatPaise(allocatedPaise - amountPaise) : formatPaise(onAccountPaise)}
            </Text>
          </View>
        </Surface>

        {errorMessage && (
          <Surface style={[styles.errorCard, { backgroundColor: c.error + '18' }]} elevation={0}>
            <Text style={{ color: c.error, fontSize: 13 }}>{errorMessage}</Text>
          </Surface>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
        <Button
          mode="contained"
          loading={saving}
          disabled={saving || !canSave}
          onPress={handleSave}
          style={{ borderRadius: radii.field }}
        >
          {t('payments.new.save')}
        </Button>
      </View>

      <Snackbar visible={!!errorMessage} onDismiss={() => setErrorMessage(null)} duration={4000}>
        {errorMessage ?? ''}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  topBarTitle: { fontSize: 16, fontWeight: '600' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  card: { borderRadius: radii.card, padding: 14, gap: 10 },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  row2: { flexDirection: 'row', gap: 8 },
  selectedPartyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectedPartyName: { fontSize: 14, fontWeight: '600' },
  selectedPartyMeta: { fontSize: 12 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#0001',
  },
  resultName: { fontSize: 13, fontWeight: '600' },
  resultMeta: { fontSize: 12 },
  docRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 4 },
  docNumber: { fontSize: 13, fontWeight: '600' },
  docMeta: { fontSize: 11, marginTop: 2 },
  docAmountInput: { width: 96, height: 40 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  errorCard: { borderRadius: radii.card, padding: 12 },
  bottomBar: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  deniedBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  deniedTitle: { fontSize: 16, fontWeight: '600' },
  deniedBody: { fontSize: 13, textAlign: 'center' },
});
