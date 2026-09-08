import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useColorScheme, View,
} from 'react-native';
import {
  ActivityIndicator, Button, Divider, IconButton, Modal, Portal, SegmentedButtons, Snackbar, Surface, Switch, Text, TextInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, usePathname, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { themeColors, radii } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { settingsApi } from '../../../src/api/settings.api';
import { DateField } from '../../../src/components/DateField';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { formatPaise } from '../../../src/lib/money';
import { BarcodeScannerView, ProductScanOutcome } from '../../../src/features/scanner';
import { partiesApi } from '../../../src/features/billing/parties.api';
import { productsApi, BillableProduct } from '../../../src/features/billing/products.api';
import { useOfflineDrafts } from '../../../src/features/billing/useOfflineDrafts';
import { useDebouncedValue } from '../../../src/features/billing/useDebouncedValue';
import { previewDocumentTax } from '../../../src/features/billing/taxPreview';
import { UsageMeter } from '../../../src/features/billing/components/UsageMeter';
import { LineEditorSheet } from '../../../src/features/billing/components/LineEditorSheet';
import {
  BillingScreenDocumentType, DOCUMENT_TYPE_LABEL, DocumentDirection, DraftLineInput,
  GST_STATES, PartnerPartyRecord, SALES_DOCUMENT_TYPES, PURCHASE_DOCUMENT_TYPES, behaviourOf,
} from '../../../src/features/billing/types';
import { toHref } from '../../../src/features/billing/routeHref';
// Reached only when this screen was opened FROM a booking or an order — see
// the note at the call site on why the job is settled here rather than left
// for a second tap.
import { bookingApi } from '../../../src/features/bookings/booking.api';
import { ordersApi } from '../../../src/features/orders/api';

/**
 * The two-tap invoice (build spec §4 / PARTNERS_PLAN §12.5): pick a party,
 * add line items — scan, search, or type — tap Issue. Everything else on
 * this screen is secondary to those three things, per the spec's own framing.
 *
 * "Issue" always goes through `useOfflineDrafts().addDraft()` +
 * `retryDraft()`, NEVER a direct `documentsApi.create`/`issue` call from
 * here. That is deliberate, not a missed shortcut: it means there is exactly
 * ONE idempotency key minted per tap (inside `addDraft`) and exactly ONE
 * place that decides "online now vs. queued for later" (`draftStore`'s own
 * network-error handling) — a screen-local fast path would mint a SECOND key
 * for the same intent the moment it fell back to the queue on a dropped
 * connection, which is the exact drift `src/lib/idempotency.ts` warns against.
 * When the device is online the whole round trip normally finishes in under a
 * second, so in practice this still reads as "tap Issue, see the invoice".
 */

type EditableLine = DraftLineInput & { key: string };
let lineKeySeq = 0;
const nextLineKey = () => `line-${(lineKeySeq += 1)}`;

/**
 * A catalogue product as a billable line.
 *
 * `taxRatePercent` AND `taxInclusive` both ride across, and that pairing is the
 * whole game: `sellPaise` means one of two different amounts of money depending
 * on the flag the partner set on the product ("Price includes tax" in
 * `catalog/create.tsx`), and `computeDocumentTax` reads the flag off the LINE,
 * not off the product. Carrying the rate without the flag — or the flag without
 * the rate — is how a ₹118 shelf price becomes a ₹139 bill.
 *
 * `hsn` comes across too. It was dropped here, so every line billed from this
 * phone reached the invoice with no HSN code, and the PDF's HSN column
 * (`partner-document-render.service.ts`, `settings.showHsn`) printed blank on a
 * document that is legally required to carry it.
 */
function lineFromProduct(product: {
  _id: string; name: string; unit: string; hsnCode?: string;
  sellPaise: number; taxRatePercent: number; taxInclusive: boolean;
}): EditableLine {
  return {
    key: nextLineKey(),
    itemId: product._id,
    itemName: product.name,
    hsn: product.hsnCode,
    unit: product.unit,
    qty: 1,
    ratePaise: product.sellPaise,
    discountPaise: 0,
    taxRatePercent: product.taxRatePercent,
    taxInclusive: product.taxInclusive,
  };
}

export default function NewInvoiceScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const pathname = usePathname();

  /**
   * The job this bill is being raised FOR, when Bookings sent us here.
   *
   * `POST /bookings/:id/invoice` does not raise a bill — it looks for a live
   * document whose `sourceType` is BOOKING and whose `sourceId` is the booking,
   * and refuses otherwise. Nothing in this app ever set those, so a service job
   * finished on a phone could never be invoiced. These params are the link, and
   * they are passed straight through to the draft: this screen does not
   * interpret them, because what a source means belongs to the document engine.
   */
  const jobParams = useLocalSearchParams<{
    sourceType?: string; sourceId?: string;
    partyId?: string; partyName?: string; partyPhone?: string;
    itemName?: string; ratePaise?: string;
  }>();
  const sourceType = jobParams.sourceType === 'BOOKING' || jobParams.sourceType === 'ORDER'
    ? jobParams.sourceType
    : undefined;
  const sourceId = sourceType ? jobParams.sourceId : undefined;
  const { can } = usePartnerEntitlements();
  const { capacity } = usePlanUsage();
  const { addDraft, retryDraft } = useOfflineDrafts();
  const canManage = can('INVOICING_MANAGE', 'FULL');
  const invoiceCapacity = capacity('max_invoices_month');

  // ---- direction + type (C5) ----
  const [direction, setDirection] = useState<DocumentDirection>('SALES');
  const [docType, setDocType] = useState<BillingScreenDocumentType>('TAX_INVOICE');
  const typesForDirection = direction === 'SALES' ? SALES_DOCUMENT_TYPES : PURCHASE_DOCUMENT_TYPES;
  const behaviour = behaviourOf(docType);

  // ---- dates (C6) ----
  const today = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);
  const [documentDate, setDocumentDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [goodsReturned, setGoodsReturned] = useState(false);

  // ---- party ----
  // A purchase document always names a supplier (`requiresParty: true` for
  // every PURCHASE type) — there is no walk-in equivalent for "who did we buy
  // this from", so the direction toggle forces search mode and never offers it.
  const [partyMode, setPartyMode] = useState<'WALKIN' | 'SEARCH'>('WALKIN');
  const [walkinName, setWalkinName] = useState('');
  const [walkinPhone, setWalkinPhone] = useState('');
  /**
   * Place of supply for a walk-in, and the reason it is a field rather than an
   * assumption.
   *
   * `isInterStateSupply` reads a blank as INTRA-state, so every walk-in bill
   * raised on this phone was CGST+SGST whatever the customer said — right for
   * the counter sale it was built for, wrong and unfixable for anybody from
   * another state. Empty is still the default, because the counter sale is
   * still the common case; what changed is that it is now a choice.
   */
  const [walkinState, setWalkinState] = useState('');
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [selectedParty, setSelectedParty] = useState<PartnerPartyRecord | null>(null);
  const [partyQuery, setPartyQuery] = useState('');
  const debouncedPartyQuery = useDebouncedValue(partyQuery, 300);
  const [partyResults, setPartyResults] = useState<PartnerPartyRecord[]>([]);
  const [partySearching, setPartySearching] = useState(false);

  useEffect(() => {
    if (partyMode !== 'SEARCH' || !debouncedPartyQuery.trim()) {
      setPartyResults([]);
      return;
    }
    let cancelled = false;
    setPartySearching(true);
    partiesApi
      .search(debouncedPartyQuery.trim(), direction === 'PURCHASE' ? 'SUPPLIER' : 'CUSTOMER')
      .then((rows) => {
        if (!cancelled) setPartyResults(rows);
      })
      .catch(() => {
        if (!cancelled) setPartyResults([]);
      })
      .finally(() => {
        if (!cancelled) setPartySearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [partyMode, debouncedPartyQuery, direction]);

  /**
   * Switching Sales ↔ Purchase (C5) invalidates the type (each side has its
   * own list), the party (a customer picked for a sale is not a supplier for
   * a purchase) and forces search mode — every PURCHASE type requires a named
   * party, so "walk-in" is not offered on that side.
   */
  useEffect(() => {
    setDocType(direction === 'SALES' ? 'TAX_INVOICE' : 'PURCHASE_INVOICE');
    setPartyMode(direction === 'PURCHASE' ? 'SEARCH' : 'WALKIN');
    setSelectedParty(null);
    setPartyQuery('');
    setPartyResults([]);
  }, [direction]);

  // A type change can leave a date field or the goods-returned flag pointing
  // at a value the NEW type does not carry — e.g. `validUntil` typed for a
  // quotation, then switching to a proforma, which has no date field at all.
  useEffect(() => {
    if (behaviour.dateField !== 'dueDate') setDueDate('');
    if (behaviour.dateField !== 'validUntil') setValidUntil('');
    if (!behaviour.stockNeedsGoodsFlag) setGoodsReturned(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType]);

  // ---- line items ----
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const debouncedProductQuery = useDebouncedValue(productQuery, 300);
  const [productResults, setProductResults] = useState<BillableProduct[]>([]);
  /**
   * The line the editor sheet is open on: a `key` for an existing line, `'NEW'`
   * for the one-off item being typed, `null` for closed. One piece of state
   * rather than two booleans, because "editing row 3" and "adding a new row"
   * are the same sheet and cannot both be true.
   */
  const [editingKey, setEditingKey] = useState<string | 'NEW' | null>(null);

  /**
   * Seed the form from the job, once.
   *
   * Once, because after this the partner owns the form: re-running on every
   * render would overwrite a rate they had just corrected, and a form that
   * fights back is worse than one that starts empty.
   *
   * The customer is filled in as a WALK-IN with the name we were handed, and the
   * party id rides along separately on the draft — the booking already created a
   * `PartnerParty` (`createResidentParty`), so matching on a typed name here
   * would make a SECOND one and split the customer's balance across two ledgers.
   * `partyId` is what prevents that; the name is only what the partner reads.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    const { partyName, partyPhone, itemName, ratePaise } = jobParams;
    if (!partyName && !itemName && !ratePaise) return;
    seeded.current = true;

    if (partyName) setWalkinName(partyName);
    if (partyPhone) setWalkinPhone(partyPhone);
    if (itemName || ratePaise) {
      setLines([{
        key: nextLineKey(),
        itemName: itemName || 'Service',
        unit: 'JOB',
        qty: 1,
        // Paise on the wire, paise in the draft. The only place this becomes
        // rupees is the label a person reads.
        ratePaise: Number(ratePaise) || 0,
        taxRatePercent: 0,
        taxInclusive: true,
      }]);
    }
  }, [jobParams]);

  useEffect(() => {
    if (!debouncedProductQuery.trim()) {
      setProductResults([]);
      return;
    }
    let cancelled = false;
    productsApi
      .search(debouncedProductQuery.trim())
      .then((rows) => {
        if (!cancelled) setProductResults(rows);
      })
      .catch(() => {
        if (!cancelled) setProductResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedProductQuery]);

  const addOrBumpLine = useCallback((line: EditableLine) => {
    setLines((prev) => {
      // A repeat scan/search of the same catalog item bumps qty rather than
      // adding a second row — spec §12.1's "each hit adds a line and bumps
      // qty on a repeat". Custom, off-catalog lines (`itemId` absent) never
      // merge — two different "misc item"s typed by hand are not the same
      // thing just because they share a name.
      if (line.itemId) {
        const idx = prev.findIndex((l) => l.itemId === line.itemId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], qty: next[idx].qty + line.qty };
          return next;
        }
      }
      return [...prev, line];
    });
  }, []);

  const handleScanResult = useCallback(
    (outcome: ProductScanOutcome) => {
      if (outcome.status === 'found') {
        // No de-duplication here, on purpose. The scanner's latch has already
        // decided that this `onResult` is a genuinely separate presentation of
        // an item — one held in frame never gets this far a second time — so a
        // repeat arriving here IS the cashier scanning a second tin, and
        // `addOrBumpLine` is right to bump qty. Guarding again on the product
        // id or a timestamp would break exactly that.
        addOrBumpLine(lineFromProduct(outcome.product));
        setScanError(null);
        return; // camera stays open — continuous multi-scan, per spec
      }
      if (outcome.status === 'unknown') {
        setScannerOpen(false);
        // Exactly the call documented in `src/features/scanner/index.ts`'s own
        // header — not `/(app)/catalog/create`, to match the contract the
        // catalog agent wrote for this hand-off byte for byte.
        router.push(toHref(`/catalog/create?barcode=${outcome.barcode}&returnTo=${encodeURIComponent(pathname)}`));
        return;
      }
      setScanError(outcome.message);
    },
    [addOrBumpLine, pathname],
  );

  /**
   * Save out of the editor sheet — a new one-off line, or an edit to an
   * existing one.
   *
   * A new line goes through `addOrBumpLine` for the same merge rule scans and
   * searches get; an edit replaces in place and never merges, because two rows
   * the partner has deliberately given different rates or tax treatments must
   * not collapse into one just because they now share a name.
   */
  const saveEditedLine = useCallback((patch: DraftLineInput) => {
    setLines((prev) => {
      if (editingKey === 'NEW' || editingKey === null) return prev;
      return prev.map((l) => (l.key === editingKey ? { ...l, ...patch, key: l.key } : l));
    });
    if (editingKey === 'NEW') addOrBumpLine({ ...patch, key: nextLineKey() });
    setEditingKey(null);
  }, [editingKey, addOrBumpLine]);

  const updateQty = useCallback((key: string, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: Math.max(0, Math.round((l.qty + delta) * 100) / 100) } : l))
        .filter((l) => l.qty > 0),
    );
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  /**
   * The shop's own state and whether it is GST registered — the two inputs
   * `resolveDocumentTaxContext` (partner-billing-settings.controller.ts:333)
   * feeds into the server's tax engine. Read here so the preview below asks the
   * same question of the same facts.
   *
   * `isGstRegistered: false` is not a display detail: the server passes it as
   * `gstApplicable`, and `computeLine` then forces EVERY rate to zero. A shop
   * that has never opened Settings → Business has no settings row at all and
   * the controller answers `false` — which is the honest answer, and is also
   * the most likely reason a partner reports "tax is not being calculated".
   * Hence the banner further down rather than a silently untaxed bill.
   */
  const businessQuery = useQuery({
    queryKey: qk.businessSettings(),
    queryFn: settingsApi.business.get,
    staleTime: 5 * 60 * 1000,
  });
  const supplierState = businessQuery.data?.state;
  const gstApplicable = businessQuery.data?.isGstRegistered ?? true;

  /**
   * Place of supply, exactly as `handleIssue` will send it — a named party's
   * billing state, or the walk-in state picker. The preview has to read the
   * SAME value the document will carry or it splits the tax the other way.
   */
  const placeOfSupply = selectedParty ? selectedParty.billingAddress?.state : (walkinState || undefined);

  /**
   * A real tax preview, not an estimate.
   *
   * The screen used to sum `qty × rate − discount` and say "tax is added when
   * the invoice is issued", on the reasoning that a client-side approximation
   * that disagrees with the issued invoice is worse than no preview. That
   * reasoning is right and this does not violate it: `previewDocumentTax` is a
   * line-for-line COPY of `computeDocumentTax`, not an approximation of it, and
   * it is fed the same supplier state, place of supply and `gstApplicable` the
   * server will resolve for itself. Nothing computed here is ever sent — the
   * validator refuses tax fields from a client — so the server remains the only
   * thing that taxes a document.
   *
   * `roundOff` is left at its default `true`, matching `resolveDocumentTaxContext`.
   * `reverseCharge` is false because this screen has no RCM toggle; if one is
   * ever added it must be passed here too or the preview will over-state the
   * total by exactly the tax.
   */
  const preview = useMemo(
    () => previewDocumentTax(lines, supplierState, placeOfSupply, { gstApplicable }),
    [lines, supplierState, placeOfSupply, gstApplicable],
  );
  const totals = preview.totals;
  const untaxedLineCount = lines.filter((l) => !(l.taxRatePercent ?? 0)).length;

  // ---- issue ----
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleIssue = useCallback(async () => {
    if (lines.length === 0) {
      setErrorMessage('Add at least one item first.');
      return;
    }
    if (behaviour.requiresParty && !selectedParty) {
      setErrorMessage(`Pick a supplier first — a ${DOCUMENT_TYPE_LABEL[docType].toLowerCase()} always names one.`);
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);

    const partySnapshot = selectedParty
      ? {
          name: selectedParty.name,
          phone: selectedParty.phone,
          gstin: selectedParty.gstin,
          address: selectedParty.billingAddress
            ? [selectedParty.billingAddress.line1, selectedParty.billingAddress.city].filter(Boolean).join(', ')
            : undefined,
          placeOfSupply: selectedParty.billingAddress?.state,
        }
      : {
          // The document schema requires a name even for a counter sale —
          // "The party needs a name on the document" — so an empty walk-in
          // field still produces a legal document rather than a 400 the
          // partner cannot see the reason for.
          name: walkinName.trim() || 'Walk-in customer',
          phone: walkinPhone.trim() || undefined,
          // Left off entirely when unset rather than sent as '': the server
          // reads a blank as intra-state anyway, and an empty string on the
          // document is a stated answer where there was only a default.
          placeOfSupply: walkinState || undefined,
        };

    const plainLines: DraftLineInput[] = lines.map(({ key, ...rest }) => rest);

    // "YYYY-MM-DD" (DateField's `date` output) → ISO, at local midnight —
    // never sent as a bare date string, the server's `dateInput` schema wants
    // a `Date`-coercible value like everything else on the wire.
    const isoOf = (d: string): string | undefined => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);

    const draft = await addDraft({
      type: docType,
      // The job's own party wins when the screen was opened from one: it is the
      // record the booking already created, and billing against anything else
      // gives the customer a second balance.
      partyId: selectedParty?._id ?? jobParams.partyId,
      partySnapshot,
      lines: plainLines,
      documentDate: isoOf(documentDate),
      dueDate: behaviour.dateField === 'dueDate' ? isoOf(dueDate) : undefined,
      validUntil: behaviour.dateField === 'validUntil' ? isoOf(validUntil) : undefined,
      goodsReturned: behaviour.stockNeedsGoodsFlag ? goodsReturned : undefined,
      sourceType,
      sourceId,
    });
    const settled = await retryDraft(draft.id);
    setSubmitting(false);

    if (settled?.status === 'SYNCED' && settled.syncedDocumentId) {
      /**
       * The job is marked invoiced here rather than left for a second tap.
       *
       * `POST /bookings/:id/invoice` is a READ of the billing engine — it looks
       * for the document we have just issued and records that it covers the
       * job. Making the partner go back to Bookings and press the same button
       * again, to tell the app something it can already see, is the kind of step
       * that gets skipped and leaves a bill raised against a job that still says
       * it was never invoiced.
       *
       * Best-effort on purpose: the DOCUMENT is the thing that matters and it
       * exists either way. If this call fails — offline, or a race with another
       * device — the booking simply stays COMPLETED and its own "Raise the bill"
       * button will settle it, now that a live document names it.
       */
      if (sourceType === 'BOOKING' && sourceId) {
        await bookingApi.invoice(sourceId).catch(() => {});
      }
      /**
       * The order mirror of the booking case just above: `POST
       * /partners/me/orders/:id/invoice` is the same kind of READ — it looks
       * for the document just issued and flips DELIVERED → INVOICED. Without
       * this the order board's own "Raise the bill" flow
       * ((tabs)/orders.tsx#openBillFor) would land here, issue the bill, and
       * still leave the order sitting at DELIVERED until the partner noticed
       * and pressed `invoice` a second time by hand. Best-effort for the same
       * reason as the booking branch: the document exists either way, and a
       * failed settle here just leaves the order's own `invoice` verb to
       * finish the job once a live document names it.
       */
      if (sourceType === 'ORDER' && sourceId) {
        await ordersApi.transition(sourceId, 'invoice').catch(() => {});
      }
      router.replace(toHref(`/(app)/billing/${settled.syncedDocumentId}`));
      return;
    }
    if (settled?.status === 'BLOCKED_UPGRADE') {
      setErrorMessage(settled.lastError ?? 'Your plan has reached its invoice limit for this month.');
      return;
    }
    if (settled?.status === 'FAILED') {
      setErrorMessage(
        `${settled.lastError ?? 'Could not create this bill.'} It has been saved — retry it from Billing → Drafts.`,
      );
      return;
    }
    // Still PENDING — genuinely offline. The bill is safe on-device; sync
    // happens automatically the moment the connection returns.
    router.replace('/(app)/billing/drafts');
  }, [lines, selectedParty, walkinName, walkinPhone, walkinState, docType, behaviour, addDraft, retryDraft,
    sourceType, sourceId, jobParams.partyId, documentDate, dueDate, validUntil, goodsReturned]);

  if (!canManage) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.deniedBox}>
          <Text style={[styles.deniedTitle, { color: c.textPrimary }]}>You can view billing, not raise it</Text>
          <Text style={[styles.deniedBody, { color: c.textSecondary }]}>
            Ask an admin to grant Billing at Full access to create invoices.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />
        <Text style={[styles.topBarTitle, { color: c.textPrimary }]}>New invoice</Text>
        <View style={{ width: 48 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SegmentedButtons
            value={direction}
            onValueChange={(v) => setDirection(v as DocumentDirection)}
            density="small"
            buttons={[
              { value: 'SALES', label: 'Sales' },
              { value: 'PURCHASE', label: 'Purchase' },
            ]}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
            <SegmentedButtons
              value={docType}
              onValueChange={(v) => setDocType(v as BillingScreenDocumentType)}
              density="small"
              style={{ minWidth: '100%' }}
              buttons={typesForDirection.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABEL[t] }))}
            />
          </ScrollView>

          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
              {direction === 'PURCHASE' ? 'Supplier' : 'Customer'}
            </Text>
            {direction === 'SALES' && (
              <SegmentedButtons
                value={partyMode}
                onValueChange={(v) => {
                  setPartyMode(v as 'WALKIN' | 'SEARCH');
                  setSelectedParty(null);
                }}
                density="small"
                buttons={[
                  { value: 'WALKIN', label: 'Walk-in' },
                  { value: 'SEARCH', label: 'Existing party' },
                ]}
              />
            )}
            {partyMode === 'WALKIN' ? (
              <>
                <View style={styles.walkinRow}>
                  <TextInput
                    mode="outlined"
                    label="Name (optional)"
                    value={walkinName}
                    onChangeText={setWalkinName}
                    placeholder="Walk-in customer"
                    style={styles.walkinInput}
                    outlineStyle={{ borderRadius: radii.field }}
                  />
                  <TextInput
                    mode="outlined"
                    label="Phone (optional)"
                    value={walkinPhone}
                    onChangeText={setWalkinPhone}
                    keyboardType="phone-pad"
                    style={styles.walkinInput}
                    outlineStyle={{ borderRadius: radii.field }}
                  />
                </View>
                {/*
                  The field that decides CGST+SGST versus IGST. Read-only and
                  tapped rather than typed: the server matches the NAME against
                  `GST_STATE_CODES`, and a typo that misses it is silently
                  treated as no answer at all — which is the intra-state default
                  this field exists to be able to overrule.
                */}
                <Pressable onPress={() => setStatePickerOpen(true)} accessibilityRole="button">
                  <View pointerEvents="none">
                    <TextInput
                      mode="outlined"
                      label="Place of supply (state)"
                      value={walkinState}
                      placeholder="Same state — CGST + SGST"
                      editable={false}
                      // Not `walkinInput`: that carries `flex: 1` for the
                      // name/phone row, and this is a full-width block of its own.
                      style={styles.stateInput}
                      outlineStyle={{ borderRadius: radii.field }}
                      right={<TextInput.Icon icon="chevron-down" />}
                    />
                  </View>
                </Pressable>
                <Text style={[styles.stateHint, { color: c.textSecondary }]}>
                  {walkinState
                    ? `Taxed for ${walkinState}. Out-of-state customers are charged IGST.`
                    : 'Leave it blank for a counter sale in your own state. Set it when the customer is from elsewhere — it decides whether the bill charges CGST + SGST or IGST.'}
                </Text>
              </>
            ) : selectedParty ? (
              <View style={styles.selectedPartyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.selectedPartyName, { color: c.textPrimary }]}>{selectedParty.name}</Text>
                  {!!selectedParty.phone && (
                    <Text style={[styles.selectedPartyMeta, { color: c.textSecondary }]}>{selectedParty.phone}</Text>
                  )}
                </View>
                <IconButton icon="close-circle" size={20} onPress={() => setSelectedParty(null)} />
              </View>
            ) : (
              <View>
                <TextInput
                  mode="outlined"
                  placeholder="Search by name or phone"
                  value={partyQuery}
                  onChangeText={setPartyQuery}
                  style={styles.walkinInput}
                  outlineStyle={{ borderRadius: radii.field }}
                  right={partySearching ? <TextInput.Icon icon={() => <ActivityIndicator size={16} />} /> : undefined}
                />
                {partyResults.map((p) => (
                  <Pressable key={p._id} onPress={() => setSelectedParty(p)} style={styles.resultRow}>
                    <Text style={[styles.resultName, { color: c.textPrimary }]}>{p.name}</Text>
                    {!!p.phone && <Text style={[styles.resultMeta, { color: c.textSecondary }]}>{p.phone}</Text>}
                  </Pressable>
                ))}
              </View>
            )}
          </Surface>

          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Dates</Text>
            <DateField label="Document date" value={documentDate} onChangeText={setDocumentDate} mode="date" />
            {behaviour.dateField === 'dueDate' && (
              <DateField
                label="Due date"
                value={dueDate}
                onChangeText={setDueDate}
                mode="date"
                minimumDate={documentDate ? new Date(`${documentDate}T00:00:00`) : undefined}
                placeholder="When payment is due"
              />
            )}
            {behaviour.dateField === 'validUntil' && (
              <DateField
                label="Valid until"
                value={validUntil}
                onChangeText={setValidUntil}
                mode="date"
                minimumDate={documentDate ? new Date(`${documentDate}T00:00:00`) : undefined}
                placeholder="How long this quote holds"
              />
            )}
            {behaviour.stockNeedsGoodsFlag && (
              <View style={styles.goodsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>Goods actually returned?</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2 }}>
                    On for a returned item, off for a price correction — this decides whether it goes back on the shelf.
                  </Text>
                </View>
                <Switch value={goodsReturned} onValueChange={setGoodsReturned} />
              </View>
            )}
          </Surface>

          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Items</Text>
              <Button mode="contained-tonal" icon="barcode-scan" compact onPress={() => setScannerOpen(true)}>
                Scan
              </Button>
            </View>

            <TextInput
              mode="outlined"
              placeholder="Search your catalogue"
              value={productQuery}
              onChangeText={setProductQuery}
              style={styles.walkinInput}
              outlineStyle={{ borderRadius: radii.field }}
              left={<TextInput.Icon icon="magnify" />}
            />
            {productResults.map((p) => (
              <Pressable key={p._id} onPress={() => addOrBumpLine(lineFromProduct(p))} style={styles.resultRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultName, { color: c.textPrimary }]}>{p.name}</Text>
                  <Text style={[styles.resultMeta, { color: c.textSecondary }]}>{formatPaise(p.sellPaise)} / {p.unit}</Text>
                </View>
                <IconButton icon="plus-circle-outline" size={20} onPress={() => addOrBumpLine(lineFromProduct(p))} />
              </Pressable>
            ))}

            {lines.length > 0 && <Divider style={{ marginVertical: 8 }} />}
            {/*
              The row shows the PRICED total from the preview, not `qty × rate`.
              On an exclusive line those are different numbers, and a row that
              says ₹100 under a bill that says ₹118 is the drift this whole
              change exists to remove. `preview.lines` is positional against
              `lines` — the same contract `computeDocumentTax` keeps — so the
              index is the join.
            */}
            {lines.map((line, idx) => (
              <View key={line.key} style={styles.lineRow}>
                <Pressable style={{ flex: 1 }} onPress={() => setEditingKey(line.key)}>
                  <Text style={[styles.lineName, { color: c.textPrimary }]} numberOfLines={1}>
                    {line.itemName}
                  </Text>
                  <Text style={[styles.lineMeta, { color: c.textSecondary }]}>
                    {formatPaise(line.ratePaise)} × {line.qty} {line.unit ?? ''}
                    {(line.discountPaise ?? 0) > 0 ? ` · −${formatPaise(line.discountPaise)}` : ''}
                    {gstApplicable
                      ? ` · ${line.taxRatePercent ?? 0}% ${(line.taxInclusive ?? true) ? 'incl.' : 'extra'}`
                      : ''}
                  </Text>
                </Pressable>
                <View style={styles.qtyStepper}>
                  <IconButton icon="minus" size={16} onPress={() => updateQty(line.key, -1)} />
                  <Text style={{ color: c.textPrimary, minWidth: 24, textAlign: 'center' }}>{line.qty}</Text>
                  <IconButton icon="plus" size={16} onPress={() => updateQty(line.key, 1)} />
                </View>
                <Text style={[styles.lineAmount, { color: c.textPrimary }]}>
                  {formatPaise(preview.lines[idx]?.totalPaise ?? 0)}
                </Text>
                {/* Both, deliberately: removing a mis-scanned line is the most
                    common correction at a counter and must stay one tap, and the
                    pencil is what says the tax fields are in there at all — a
                    tappable row with no affordance is a feature nobody finds. */}
                <IconButton icon="pencil-outline" size={16} onPress={() => setEditingKey(line.key)} accessibilityLabel={`Edit ${line.itemName}`} />
                <IconButton icon="trash-can-outline" size={16} onPress={() => removeLine(line.key)} accessibilityLabel={`Remove ${line.itemName}`} />
              </View>
            ))}

            <Button mode="text" icon="pencil-plus-outline" compact onPress={() => setEditingKey('NEW')} style={{ alignSelf: 'flex-start' }}>
              Add a one-off item
            </Button>
          </Surface>

          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            {/*
              A real breakup, priced by the mirror of the server's own function.

              This card used to show one "Estimated total" that was the PRE-TAX
              sum and said so in small print. That was honest, and it was also
              the thing the partner was complaining about: the number under their
              thumb on the Issue button was not the number the customer would be
              asked for, and on an exclusive-priced line it was not even close.
            */}
            <TotalLine label="Taxable value" value={totals.subPaise} c={c} />
            {totals.discountPaise > 0 && <TotalLine label="Discount" value={-totals.discountPaise} c={c} />}
            {gstApplicable && preview.interState && <TotalLine label="IGST" value={totals.igstPaise} c={c} />}
            {gstApplicable && !preview.interState && (
              <>
                <TotalLine label="CGST" value={totals.cgstPaise} c={c} />
                <TotalLine label="SGST" value={totals.sgstPaise} c={c} />
              </>
            )}
            {totals.cessPaise > 0 && <TotalLine label="Cess" value={totals.cessPaise} c={c} />}
            {totals.roundOffPaise !== 0 && <TotalLine label="Round off" value={totals.roundOffPaise} c={c} />}
            <Divider style={{ marginVertical: 6 }} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: c.textSecondary }]}>Total</Text>
              <Text style={[styles.totalAmount, { color: c.textPrimary }]}>{formatPaise(totals.grandPaise)}</Text>
            </View>
            <Text style={[styles.totalHint, { color: c.textSecondary }]}>
              {!gstApplicable
                ? 'No GST is charged — your business is saved as not GST registered (Settings → Business).'
                : preview.interState
                  ? `Inter-state supply${placeOfSupply ? ` to ${placeOfSupply}` : ''} — IGST. The server prices the invoice the same way.`
                  : 'Within your state — CGST + SGST. The server prices the invoice the same way.'}
            </Text>
            {/*
              `gstApplicable` falls back to TRUE while the settings are still
              loading or if they fail to load, which OVER-states the tax rather
              than under-stating it. That is the safer error for a preview: the
              server has the real answer, and an over-stated preview gets
              corrected downward on the issued bill instead of surprising the
              customer upward at the counter.
            */}
            {businessQuery.isPending && (
              <Text style={[styles.totalHint, { color: c.textSecondary }]}>Checking your GST registration…</Text>
            )}
            {/*
              The nudge that answers the original complaint.

              A one-off line typed at the counter, and a line seeded from a
              service booking, both start at 0% — this screen cannot know the
              SAC rate for "repaired the geyser", and guessing 18% onto a tax
              document is not a guess anybody should make on a partner's behalf.
              So the rate stays 0 and the screen SAYS SO, once, instead of
              issuing a silently untaxed invoice the way it used to.
            */}
            {gstApplicable && untaxedLineCount > 0 && (
              <Text style={[styles.totalHint, { color: c.warning }]}>
                {untaxedLineCount === 1 ? '1 item has' : `${untaxedLineCount} items have`} no GST rate set.
                Tap the pencil on {untaxedLineCount === 1 ? 'it' : 'them'} to pick one.
              </Text>
            )}
          </Surface>

          {errorMessage && (
            <Surface style={[styles.errorCard, { backgroundColor: c.error + '18' }]} elevation={0}>
              <Text style={{ color: c.error, fontSize: 13 }}>{errorMessage}</Text>
            </Surface>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.bottomBar, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
        <UsageMeter capacity={invoiceCapacity} c={c} />
        <Button
          mode="contained"
          onPress={handleIssue}
          loading={submitting}
          disabled={submitting || lines.length === 0 || invoiceCapacity.atLimit}
          style={{ borderRadius: radii.field, marginTop: 8 }}
        >
          {docType === 'TAX_INVOICE' ? `Issue invoice — ${formatPaise(totals.grandPaise)}` : 'Save & issue'}
        </Button>
      </View>

      <Portal>
        <Modal
          visible={scannerOpen}
          onDismiss={() => setScannerOpen(false)}
          contentContainerStyle={[styles.scannerModal, { backgroundColor: c.background }]}
        >
          <View style={styles.scannerHeader}>
            <Text style={[styles.topBarTitle, { color: c.textPrimary }]}>Scan items</Text>
            <IconButton icon="close" onPress={() => setScannerOpen(false)} accessibilityLabel="Done scanning" />
          </View>
          {/* The hint now names the ONE physical gesture the latch depends on.
              A held pack is one line, not a climbing count, so a cashier
              wanting two of something has to lift the phone away and come
              back — which is what they already do, but they should not have to
              discover it by finding out the second tin did not register. */}
          <BarcodeScannerView
            active={scannerOpen}
            onResult={handleScanResult}
            hint="Each item adds a line. For two of the same, lift the phone away and scan it again."
          />
        </Modal>
      </Portal>

      <LineEditorSheet
        visible={editingKey !== null}
        line={editingKey && editingKey !== 'NEW' ? (lines.find((l) => l.key === editingKey) ?? null) : null}
        supplierState={supplierState}
        placeOfSupply={placeOfSupply}
        gstApplicable={gstApplicable}
        onDismiss={() => setEditingKey(null)}
        onSave={saveEditedLine}
        onRemove={editingKey && editingKey !== 'NEW'
          ? () => { removeLine(editingKey); setEditingKey(null); }
          : undefined}
        c={c}
      />

      {/*
        The place-of-supply list. A plain scrolling list of the 37 names the
        server recognises, with "Same state" as the first row so clearing it is
        as easy as setting it — the web picker's "Not set" option, said in the
        words a shopkeeper would use.
      */}
      <Portal>
        <Modal
          visible={statePickerOpen}
          onDismiss={() => setStatePickerOpen(false)}
          contentContainerStyle={[styles.stateModal, { backgroundColor: c.surface }]}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Place of supply</Text>
            <IconButton icon="close" onPress={() => setStatePickerOpen(false)} accessibilityLabel="Close" />
          </View>
          <ScrollView>
            <Pressable
              onPress={() => { setWalkinState(''); setStatePickerOpen(false); }}
              style={[styles.stateRow, { borderBottomColor: c.divider }]}
            >
              <Text style={{ color: !walkinState ? c.primary : c.textPrimary, fontWeight: !walkinState ? '700' : '400' }}>
                Same state as my business
              </Text>
            </Pressable>
            {GST_STATES.map((s) => (
              <Pressable
                key={s}
                onPress={() => { setWalkinState(s); setStatePickerOpen(false); }}
                style={[styles.stateRow, { borderBottomColor: c.divider }]}
              >
                <Text style={{ color: walkinState === s ? c.primary : c.textPrimary, fontWeight: walkinState === s ? '700' : '400' }}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Modal>
      </Portal>

      <Snackbar visible={!!scanError} onDismiss={() => setScanError(null)} duration={3000}>
        {scanError}
      </Snackbar>
    </SafeAreaView>
  );
}

/** One line of the totals breakup. Negative values (a discount) print with the sign `formatPaise` gives them. */
function TotalLine({ label, value, c }: { label: string; value: number; c: ReturnType<typeof themeColors> }) {
  return (
    <View style={styles.breakupRow}>
      <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>{label}</Text>
      <Text style={{ color: c.textPrimary, fontSize: 12.5, fontWeight: '500' }}>{formatPaise(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  topBarTitle: { fontSize: 16, fontWeight: '600' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  card: { borderRadius: radii.card, padding: 14, gap: 10 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  walkinRow: { flexDirection: 'row', gap: 8 },
  stateInput: { backgroundColor: 'transparent' },
  stateHint: { fontSize: 11.5, lineHeight: 16 },
  stateModal: { margin: 20, borderRadius: radii.card, paddingHorizontal: 4, paddingBottom: 8, maxHeight: '75%' },
  stateRow: { paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  walkinInput: { flex: 1, backgroundColor: 'transparent' },
  selectedPartyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectedPartyName: { fontSize: 14, fontWeight: '600' },
  selectedPartyMeta: { fontSize: 12 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#0001',
  },
  resultName: { fontSize: 13, fontWeight: '600' },
  resultMeta: { fontSize: 12 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  lineName: { fontSize: 13, fontWeight: '600' },
  lineMeta: { fontSize: 11, marginTop: 2 },
  qtyStepper: { flexDirection: 'row', alignItems: 'center' },
  lineAmount: { fontSize: 13, fontWeight: '600', minWidth: 64, textAlign: 'right' },
  goodsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakupRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 13, fontWeight: '600' },
  totalAmount: { fontSize: 22, fontWeight: '600' },
  totalHint: { fontSize: 11 },
  errorCard: { borderRadius: radii.card, padding: 12 },
  bottomBar: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  scannerModal: { flex: 1, margin: 0 },
  scannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 8 },
  deniedBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  deniedTitle: { fontSize: 16, fontWeight: '600' },
  deniedBody: { fontSize: 13, textAlign: 'center' },
});
