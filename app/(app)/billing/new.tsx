import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useColorScheme, View,
} from 'react-native';
import {
  ActivityIndicator, Button, Chip, Divider, IconButton, Modal, Portal, SegmentedButtons, Snackbar, Surface, Switch, Text, TextInput,
} from 'react-native-paper';
import { FitSegments } from '../../../src/components/FitSegments'; // >>> WEB-UI
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, usePathname, useLocalSearchParams, type Href } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { settingsApi } from '../../../src/api/settings.api';
import { DateField } from '../../../src/components/DateField';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { formatPaise } from '../../../src/lib/money';
import { BarcodeScannerView, ProductScanOutcome } from '../../../src/features/scanner';
import { partiesApi } from '../../../src/api/parties.api';
import { catalogApi } from '../../../src/features/catalog/api';
import type { Product } from '../../../src/features/catalog/types';
import { canStepDown, stepQty } from '../../../src/lib/qtyStep';
import { useOfflineDrafts } from '../../../src/features/billing/useOfflineDrafts';
import { useDebouncedValue } from '../../../src/features/billing/useDebouncedValue';
import { previewDocumentTax } from '../../../src/features/billing/taxPreview';
import { UsageMeter } from '../../../src/features/billing/components/UsageMeter';
import { LineEditorSheet } from '../../../src/features/billing/components/LineEditorSheet';
import {
  BillingScreenDocumentType, DOCUMENT_TYPE_LABEL_KEY, DocumentDirection, DraftLineInput, documentTypeLabelKey,
  GST_STATES, InvoiceDraft, PartnerPartyRecord, SALES_DOCUMENT_TYPES, CREATABLE_PURCHASE_DOCUMENT_TYPES, behaviourOf,
  TRANSPORT_REASONS, TRANSPORT_REASON_LABEL_KEY, TransportReason, statesTransportReason, statesDeliveryDate,
} from '../../../src/features/billing/types';
import { checkRoleLimits, earliestAllowedDay, mayOverrideCredit } from '../../../src/features/p1/access';
import { warningText } from '../../../src/features/p1/warnings';
import { PurchaseBillFields, takesSupplierBillFields } from '../../../src/features/purchases/components/PurchaseBillFields';
import { toHref } from '../../../src/features/billing/routeHref';
// Reached only when this screen was opened FROM a booking or an order — see
// the note at the call site on why the job is settled here rather than left
// for a second tap.
import { bookingApi } from '../../../src/features/bookings/booking.api';
import { ordersApi } from '../../../src/features/orders/api';
// P2 PHARMACY — inert unless the business switched Pharmacy on (see the hook).
import { usePharmacyBilling } from '../../../src/features/p2/billing/usePharmacyBilling';
import { PharmacyLineChip } from '../../../src/features/p2/billing/PharmacyLineChip';
import { BatchPickSheet } from '../../../src/features/pharmacy/components/BatchPickSheet';
import { RxDetailsForm, RxDetails } from '../../../src/features/pharmacy/components/RxDetailsForm';
import { EMPTY_RX, expiryLabel, rxBody, rxProblem } from '../../../src/features/pharmacy/logic';
// Commerce C3/C6 at the counter — inert unless the shop switched a feature on.
import { apiErrorMessage } from '../../../src/api/axios';
import { documentsApi, type CreateDocumentPayload } from '../../../src/features/billing/documents.api';
import type { AddDraftInput } from '../../../src/features/billing/types';
import { useCommerceAccess } from '../../../src/features/commerce/access';
import { useCommerceSettings, useHolds, useQuickKeys } from '../../../src/features/commerce/hooks';
import { defaultHoldLabel, holdLinesOf, tillLinesFromResumed } from '../../../src/features/commerce/logic';
// >>> GAP-C-SHOP
import { quickKeyProduct } from '../../../src/features/commerce/logic';
// <<< GAP-C-SHOP
import type { QuickKey, ResumeResult } from '../../../src/features/commerce/types';
import { QuickKeysGrid } from '../../../src/features/commerce/components/QuickKeysGrid';
import { VariantPickerSheet, type VariantChoice } from '../../../src/features/commerce/components/VariantPickerSheet';
import { HoldNameSheet, HoldTraySheet } from '../../../src/features/commerce/components/HoldSheets';
import { CounterCheckoutSheet, type CheckoutFeatures } from '../../../src/features/commerce/components/CounterCheckoutSheet';
// >>> MP1-COMPLETE — P2: "Refund as" (Commerce C4) on a credit note / sales return; + the "?" help.
import { HelpButton } from '../../../src/features/help/HelpButton';
import { RefundToChoice, useRefundTo } from '../../../src/features/billing/components/RefundToChoice';
import { asksRefundTo, refundToBody } from '../../../src/features/billing/refundTo';
// <<< MP1-COMPLETE
import { PillButton } from '../../../src/features/p1/ui';

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

/**
 * `catalogRatePaise` is the product's shelf price when the line came from the
 * catalogue — held so a role that must bill at catalogue price
 * (`limits.mayEditPrice === false`) is told on the line, not after a round trip.
 * Stripped before the draft is written, with `key`.
 */
type EditableLine = DraftLineInput & {
  key: string; catalogRatePaise?: number; batchLabel?: string;
  /** P2 PHARMACY: the drug facts when the product lookup carried them (never sent). */
  drugSchedule?: 'H' | 'H1' | 'X'; batchTracking?: boolean;
};
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
  drugSchedule?: 'H' | 'H1' | 'X'; batchTracking?: boolean;
}): EditableLine {
  return {
    key: nextLineKey(),
    itemId: product._id,
    itemName: product.name,
    hsn: product.hsnCode,
    unit: product.unit,
    qty: 1,
    ratePaise: product.sellPaise,
    catalogRatePaise: product.sellPaise,
    discountPaise: 0,
    taxRatePercent: product.taxRatePercent,
    taxInclusive: product.taxInclusive,
    // P2 PHARMACY: carried only when the lookup sent them (a newer server).
    ...(product.drugSchedule ? { drugSchedule: product.drugSchedule } : {}),
    ...(typeof product.batchTracking === 'boolean' ? { batchTracking: product.batchTracking } : {}),
  };
}

export default function NewInvoiceScreen() {
  const { t } = useTranslation();
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
    /** P1: Purchases home opens this screen on the purchase side with a type chosen. */
    direction?: string; docType?: string;
  }>();
  const sourceType = jobParams.sourceType === 'BOOKING' || jobParams.sourceType === 'ORDER'
    ? jobParams.sourceType
    : undefined;
  const sourceId = sourceType ? jobParams.sourceId : undefined;
  const { can, entitlements, roleLimits: rawRoleLimits } = usePartnerEntitlements();
  const roleLimits = rawRoleLimits ?? {};
  const { capacity } = usePlanUsage();
  const { addDraft, retryDraft, confirmDuplicateAndRetry, overrideCreditAndRetry } = useOfflineDrafts();
  /**
   * P1 split the permission by side (§4.4): purchase documents are
   * PURCHASES_MANAGE, sales INVOICING_MANAGE. Derived defaults make them equal
   * for every existing role; a role that holds only one side sees only it.
   */
  const canSales = can('INVOICING_MANAGE', 'FULL');
  const canPurchases = can('PURCHASES_MANAGE', 'FULL');
  const canManage = canSales || canPurchases;
  const invoiceCapacity = capacity('max_invoices_month');

  // ---- direction + type (C5) ----
  const askedPurchase = jobParams.direction === 'PURCHASE';
  const askedType = CREATABLE_PURCHASE_DOCUMENT_TYPES.find((ty) => ty === jobParams.docType);
  const [direction, setDirection] = useState<DocumentDirection>(
    (askedPurchase && canPurchases) || (!canSales && canPurchases) ? 'PURCHASE' : 'SALES',
  );
  const [docType, setDocType] = useState<BillingScreenDocumentType>(
    direction === 'PURCHASE' ? (askedType ?? 'PURCHASE_INVOICE') : 'TAX_INVOICE',
  );
  // GOODS_RECEIPT is never offered here (§4.4) — goods are received against a PO.
  const typesForDirection = direction === 'SALES' ? SALES_DOCUMENT_TYPES : CREATABLE_PURCHASE_DOCUMENT_TYPES;
  const behaviour = behaviourOf(docType);

  // ---- P1 purchase bill fields (§4.4) ----
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState('');
  /** `null` = leave it to the server's default (REGULAR partner and a taxed bill → eligible). */
  const [itcEligible, setItcEligible] = useState<boolean | null>(null);

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
  /** Delivery challan (CGST Rule 55): why the goods move. `null` = not chosen yet. */
  const [transportReason, setTransportReason] = useState<TransportReason | null>(null);
  const [transportReasonNote, setTransportReasonNote] = useState('');
  /** Purchase order: when the goods are wanted — optional, "YYYY-MM-DD". */
  const [deliveryDate, setDeliveryDate] = useState('');

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
  const firstDirection = useRef(true);
  useEffect(() => {
    // On the first run the type is already what the screen was opened for
    // (P1: Purchases home can ask for a PO); only a real toggle resets it.
    if (!firstDirection.current) setDocType(direction === 'SALES' ? 'TAX_INVOICE' : 'PURCHASE_INVOICE');
    firstDirection.current = false;
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
    if (!statesTransportReason(docType)) { setTransportReason(null); setTransportReasonNote(''); }
    if (!statesDeliveryDate(docType)) setDeliveryDate('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType]);

  // ---- line items ----
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const debouncedProductQuery = useDebouncedValue(productQuery, 300);
  const [productResults, setProductResults] = useState<Product[]>([]);
  /**
   * The line the editor sheet is open on: a `key` for an existing line, `'NEW'`
   * for the one-off item being typed, `null` for closed. One piece of state
   * rather than two booleans, because "editing row 3" and "adding a new row"
   * are the same sheet and cannot both be true.
   */
  const [editingKey, setEditingKey] = useState<string | 'NEW' | null>(null);
  /** C6: "which size?" for a scanned / searched / quick-key PARENT. */
  const [variantPick, setVariantPick] = useState<{ parentName: string; parentId?: string; variants?: VariantChoice[] } | null>(null);

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
        // NOT translated. This becomes `lines[].itemName` on a real document
        // and is printed on the bill and read back by reports and search — a
        // line whose name depends on the phone's UI language would make the
        // same job appear under two different item names.
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
    catalogApi
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
      if (outcome.status === 'found' && outcome.product.isVariantParent) {
        // C6 (D-8): a parent is not sold — the cashier picks the size. The camera
        // closes for the question and is one tap away again after it.
        setScannerOpen(false);
        setVariantPick({ parentName: outcome.product.name, variants: (outcome.product.variants ?? []) as VariantChoice[] });
        return;
      }
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
        // >>> SCANNER — no longer jumps straight to the create form. A batch
        // label or a smudged read used to yank the cashier out of the bill on
        // every unknown read; now the scanner strip says "Not in your
        // catalogue: <code>" and offers ONE "Add new product" button
        // (`addNewFromScan` below), and the camera stays on the bill.
        setScanError(null);
        return;
        // <<< SCANNER
      }
      setScanError(outcome.message);
    },
    [addOrBumpLine],
  );

  // >>> SCANNER — the one "Add new product with this barcode" offer. Exactly the
  // hand-off documented in `src/features/scanner/index.ts` (create form, then back here).
  const addNewFromScan = useCallback((barcode: string) => {
    setScannerOpen(false);
    router.push(toHref(`/catalog/create?barcode=${encodeURIComponent(barcode)}&returnTo=${encodeURIComponent(pathname)}`));
  }, [pathname]);
  // <<< SCANNER

  // ---- Commerce at the counter (CONTRACT-commerce §8, §11): holds, quick keys, checkout ----
  const queryClient = useQueryClient();
  const commerce = useCommerceAccess();
  const commerceSettings = useCommerceSettings(commerce.settings.canView && commerce.anyOn);
  // >>> MP1-COMPLETE — P2: "Refund as" on a credit note / sales return for a named customer (WALLET on).
  const refundChoice = useRefundTo();
  const refundAsked = asksRefundTo({
    walletOn: refundChoice.walletOn, type: docType, partyId: selectedParty?._id ?? jobParams.partyId,
  });
  // <<< MP1-COMPLETE
  const cs = commerceSettings.data?.settings;
  const salesSide = direction === 'SALES';
  const holdsOn = salesSide && commerce.has('COUNTER_HOLD') && commerce.counter.canSell;
  const holdsQuery = useHolds(holdsOn);
  const heldCount = holdsQuery.data?.length ?? 0;
  const quickKeysQuery = useQuickKeys(salesSide && commerce.has('QUICK_KEYS') && commerce.counter.canReadQuickKeys);
  /**
   * What the checkout may offer. A setting this person cannot read (no ORDERS
   * read) is taken as ON and left to the server, which refuses with its own
   * coded sentence (COUPONS_OFF, WALLET_OFF) — never silently skipped.
   */
  const checkoutFeatures: CheckoutFeatures = {
    offers: commerce.has('OFFERS') && (cs?.offers.allowAtCounter ?? true),
    coupons: commerce.has('OFFERS') && (cs?.offers.allowAtCounter ?? true) && (cs?.offers.couponsEnabled ?? true),
    points: commerce.has('LOYALTY'),
    split: commerce.has('SPLIT_TENDER'),
    credit: commerce.has('WALLET') && (cs?.wallet.allowAtCounter ?? true),
  };
  const checkoutOn = salesSide && docType === 'TAX_INVOICE' && commerce.counter.canSell
    && (checkoutFeatures.offers || checkoutFeatures.points || checkoutFeatures.split);
  const [holdOpen, setHoldOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [checkoutPayload, setCheckoutPayload] = useState<CreateDocumentPayload | null>(null);
  /** The server draft the checkout made; re-used (updated) on the next open, removed when the bill goes another way. */
  const [serverDraftId, setServerDraftId] = useState<string | null>(null);
  const serverDraftRef = useRef<string | null>(null);
  serverDraftRef.current = serverDraftId;
  const [resumedCoupon, setResumedCoupon] = useState<string | undefined>(undefined);
  const [quickBusy, setQuickBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Forget (and delete) a checkout draft the till no longer stands behind. Best-effort. */
  const dropServerDraft = useCallback(() => {
    const id = serverDraftRef.current;
    if (id) void documentsApi.remove(id).catch(() => undefined);
    serverDraftRef.current = null;
    setServerDraftId(null);
  }, []);

  /** One tap on a quick key = one unit. Tax facts come from the product (cached), like a search pick. */
  const onQuickKey = useCallback(async (k: QuickKey) => {
    // >>> GAP-C-SHOP — the key carries the line's price, tax rate, "price includes tax" and HSN:
    // one tap, one line, no product read. (Keys are never a sizes parent — the server drops those.)
    const direct = quickKeyProduct(k);
    if (direct) { addOrBumpLine(lineFromProduct(direct)); return; }
    // <<< GAP-C-SHOP
    // An older server's key has no tax facts: read the product as before.
    setQuickBusy(k.productId);
    try {
      const p = await queryClient.fetchQuery({
        queryKey: qk.catalog.product(k.productId),
        queryFn: () => catalogApi.getOne(k.productId),
        staleTime: 5 * 60 * 1000,
      });
      if (p.isVariantParent) setVariantPick({ parentName: p.name, parentId: p._id });
      else addOrBumpLine(lineFromProduct(p));
    } catch (e) {
      setScanError(apiErrorMessage(e));
    } finally {
      setQuickBusy(null);
    }
  }, [queryClient, addOrBumpLine]);

  /** A held bill back on the till, priced at today's catalogue. Lines that cannot be sold are named, not kept. */
  const onResumed = useCallback((r: ResumeResult) => {
    dropServerDraft();
    const { lines: back, dropped, short } = tillLinesFromResumed(r.lines);
    setLines(back.map((l) => ({
      key: nextLineKey(),
      itemId: l.itemId,
      itemName: l.itemName,
      hsn: l.hsn,
      unit: l.unit,
      qty: l.qty,
      ratePaise: l.ratePaise,
      ...(l.catalogRatePaise !== undefined ? { catalogRatePaise: l.catalogRatePaise } : {}),
      discountPaise: l.discountPaise ?? 0,
      taxRatePercent: l.taxRatePercent ?? 0,
      taxInclusive: l.taxInclusive ?? true,
    })));
    setResumedCoupon(r.hold.couponCode);
    if (r.hold.partyId) {
      partiesApi.getOne(r.hold.partyId)
        .then((p) => { setPartyMode('SEARCH'); setSelectedParty(p as unknown as PartnerPartyRecord); })
        .catch(() => undefined);
    }
    const notes = [
      dropped.length ? t('commerce.counter.resumedDropped', { names: dropped.join(', ') }) : '',
      short.length ? t('commerce.counter.resumedShort', { names: short.join(', ') }) : '',
    ].filter(Boolean);
    if (notes.length) Alert.alert(t('commerce.counter.resumedTitle', { label: r.hold.label }), notes.join('\n\n'));
    else setNotice(t('commerce.counter.resumedToast', { label: r.hold.label }));
  }, [dropServerDraft, t]);

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
        // Never below 1 — removing a line is the bin button's job (`stepQty`).
        .map((l) => (l.key === key ? { ...l, qty: stepQty(l.qty, delta) } : l)),
    );
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  // ---- P2 PHARMACY: batch pick + prescription (nothing here for any other business) ----
  const pharmacy = usePharmacyBilling(direction, docType, lines);
  const [rx, setRx] = useState<RxDetails>(EMPTY_RX);
  /** The line whose batch is being picked. */
  const [batchKey, setBatchKey] = useState<string | null>(null);
  const batchLine = batchKey ? lines.find((l) => l.key === batchKey) : undefined;
  const pickBatch = useCallback((key: string, pick: { batchId: string; batchNo: string; expiryDate: string } | null) => {
    setLines((prev) => prev.map((l) => (l.key === key
      ? { ...l, batchId: pick?.batchId, batchLabel: pick ? `${pick.batchNo} · ${expiryLabel(pick.expiryDate)}` : undefined }
      : l)));
    setBatchKey(null);
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
  /**
   * P1 (§4.1): a COMPOSITION partner's SALES carry no GST — the server's
   * `salesGstApplicable` — so the preview must not add any either, and the
   * tax invoice reads as a bill of supply on the type picker.
   */
  const isComposition = businessQuery.data?.registrationType === 'COMPOSITION';
  const gstApplicable = (businessQuery.data?.isGstRegistered ?? true) && !(direction === 'SALES' && isComposition);

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

  /**
   * The role's limits, checked as the partner types (§4.4 / P1.12) — the same
   * rules and order as the server's `checkRoleLimits`, so the refusal is said
   * ON the line before the round trip. Sales documents only; the proprietor has
   * `{}` and is never limited.
   */
  const limitViolation = useMemo(() => {
    if (direction !== 'SALES') return null;
    const priceOf = new Map(lines.filter((l) => l.itemId && l.catalogRatePaise !== undefined)
      .map((l) => [l.itemId as string, l.catalogRatePaise as number]));
    return checkRoleLimits({
      limits: roleLimits,
      lines,
      documentDay: documentDate || undefined,
      catalogPricePaise: (itemId) => priceOf.get(itemId),
    });
  }, [direction, lines, roleLimits, documentDate]);
  const limitMessage = limitViolation ? t(`errors.${limitViolation.code}`, limitViolation.params) : null;
  const earliestDay = direction === 'SALES' ? earliestAllowedDay(roleLimits) : undefined;

  // ---- issue ----
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Where a finished attempt goes next. Split out of `handleIssue` because the
   * two P1 follow-ups (confirm a duplicate supplier bill, override a credit
   * limit) end in exactly the same places as the first attempt.
   */
  const finishSettled = useCallback(async (settled: InvoiceDraft | undefined): Promise<void> => {
    if (settled?.status === 'SYNCED' && settled.syncedDocumentId) {
      /**
       * The job (booking or order) is marked invoiced here rather than left for
       * a second tap: `POST /bookings/:id/invoice` and the order's `invoice`
       * verb are READS of the billing engine that find the document just issued.
       * Best-effort — the document exists either way, and the job's own
       * "Raise the bill" button settles it later if this call fails.
       */
      if (sourceType === 'BOOKING' && sourceId) {
        await bookingApi.invoice(sourceId).catch(() => {});
      }
      if (sourceType === 'ORDER' && sourceId) {
        await ordersApi.transition(sourceId, 'invoice').catch(() => {});
      }
      const go = () => router.replace(toHref(`/(app)/billing/${settled.syncedDocumentId}`));
      // §4.4 WARN: the bill IS issued; the partner is told once, then lands on it.
      const warnings = (settled.issueWarnings ?? []).map((w) => warningText(w, t)).filter(Boolean);
      if (warnings.length) {
        Alert.alert(t('billing.new.issuedWithWarningTitle'), warnings.join('\n\n'), [{ text: t('common.ok'), onPress: go }]);
        return;
      }
      go();
      return;
    }
    if (settled?.status === 'BLOCKED_UPGRADE') {
      setErrorMessage(settled.lastError ?? t('billing.new.planLimit'));
      return;
    }
    if (settled?.status === 'FAILED') {
      const reason = settled.lastError ?? t('billing.new.createFailedFallback');
      if (settled.lastErrorCode === 'PURCHASE_BILL_DUPLICATE_SUPPLIER_NO') {
        Alert.alert(t('billing.new.duplicateSupplierTitle'), reason, [
          { text: t('common.cancel'), style: 'cancel', onPress: () => setErrorMessage(reason) },
          {
            text: t('billing.new.duplicateSupplierConfirm'),
            onPress: () => {
              setSubmitting(true);
              void confirmDuplicateAndRetry(settled.id).then(async (next) => {
                setSubmitting(false);
                await finishSettled(next);
              });
            },
          },
        ]);
        return;
      }
      if (settled.lastErrorCode === 'PARTY_CREDIT_LIMIT_EXCEEDED') {
        if (mayOverrideCredit(entitlements.isAdmin, roleLimits)) {
          Alert.alert(t('billing.new.creditBlockTitle'), reason, [
            { text: t('common.cancel'), style: 'cancel', onPress: () => setErrorMessage(reason) },
            {
              text: t('billing.new.creditOverride'),
              style: 'destructive',
              onPress: () => {
                setSubmitting(true);
                void overrideCreditAndRetry(settled.id).then(async (next) => {
                  setSubmitting(false);
                  await finishSettled(next);
                });
              },
            },
          ]);
          return;
        }
        setErrorMessage(`${reason}\n${t('billing.new.creditAskOwner')}`);
        return;
      }
      setErrorMessage(t('billing.new.createFailed', { reason }));
      return;
    }
    // Still PENDING — genuinely offline. The bill is safe on-device; sync
    // happens automatically the moment the connection returns.
    router.replace('/(app)/billing/drafts');
  }, [sourceType, sourceId, t, confirmDuplicateAndRetry, overrideCreditAndRetry, entitlements.isAdmin, roleLimits]);

  /**
   * The checks every way of finishing this bill shares (Issue, and the commerce
   * Checkout) — said here, before anything is queued or sent that can only fail.
   */
  const billProblem = useCallback((): string | null => {
    if (lines.length === 0) return t('billing.new.needItem');
    if (limitMessage) return limitMessage;
    if (takesSupplierBillFields(docType) && supplierInvoiceDate && documentDate && supplierInvoiceDate > documentDate) {
      return t('purchases.bill.supplierDateAfter');
    }
    if (behaviour.requiresParty && !selectedParty) {
      return t('billing.new.needSupplier', { type: t(DOCUMENT_TYPE_LABEL_KEY[docType]).toLowerCase() });
    }
    // This screen always ISSUES, and the server refuses to number a challan with
    // no Rule 55 reason — said here, before a draft is queued that can only fail.
    if (statesTransportReason(docType)) {
      if (!transportReason) return t('billing.new.transportReasonRequired');
      if (transportReason === 'OTHER' && !transportReasonNote.trim()) return t('billing.new.transportReasonNoteRequired');
    }
    if (statesDeliveryDate(docType) && deliveryDate && documentDate && deliveryDate < documentDate) {
      return t('billing.new.deliveryBeforeDocument');
    }
    // P2 PHARMACY: said here, before a draft is queued that can only be refused.
    if (pharmacy.scheduleXNames.length) {
      return t('errors.RX_SCHEDULE_X_NOT_ALLOWED', { itemName: pharmacy.scheduleXNames[0] });
    }
    if (pharmacy.rxDrugs.length > 0) {
      const problem = rxProblem(rx);
      if (problem) return t(problem);
    }
    return null;
  }, [lines.length, limitMessage, docType, supplierInvoiceDate, documentDate, behaviour.requiresParty, selectedParty,
    transportReason, transportReasonNote, deliveryDate, pharmacy.scheduleXNames, pharmacy.rxDrugs.length, rx, t]);

  /** The bill as a draft body — the one shape both Issue (offline queue) and Checkout send. */
  const buildDraftInput = useCallback((): AddDraftInput => {
    const rxNeeded = pharmacy.rxDrugs.length > 0;
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
          // NOT translated, for the same reason as the seeded line name above:
          // this is written to `partySnapshot.name` on the document, printed on
          // the bill, and matched by parties search and the outstanding report.
          name: walkinName.trim() || 'Walk-in customer',
          phone: walkinPhone.trim() || undefined,
          // Left off entirely when unset rather than sent as '': the server
          // reads a blank as intra-state anyway, and an empty string on the
          // document is a stated answer where there was only a default.
          placeOfSupply: walkinState || undefined,
        };

    const plainLines: DraftLineInput[] = lines.map(({ key, catalogRatePaise, batchLabel, batchId, drugSchedule, batchTracking, ...rest }) => {
      void key; void catalogRatePaise; void batchLabel; void drugSchedule; void batchTracking;
      // A chosen batch goes only on a pharmacy sale — any other bill is unchanged.
      return pharmacy.active && batchId ? { ...rest, batchId } : rest;
    });
    const billFields = takesSupplierBillFields(docType);

    // "YYYY-MM-DD" (DateField's `date` output) → ISO, at local midnight —
    // never sent as a bare date string, the server's `dateInput` schema wants
    // a `Date`-coercible value like everything else on the wire.
    const isoOf = (d: string): string | undefined => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);

    return {
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
      transportReason: statesTransportReason(docType) ? transportReason ?? undefined : undefined,
      transportReasonNote: statesTransportReason(docType) && transportReason === 'OTHER'
        ? transportReasonNote.trim()
        : undefined,
      deliveryDate: statesDeliveryDate(docType) ? isoOf(deliveryDate) : undefined,
      sourceType,
      sourceId,
      supplierInvoiceNo: billFields && supplierInvoiceNo.trim() ? supplierInvoiceNo.trim() : undefined,
      supplierInvoiceDate: billFields ? isoOf(supplierInvoiceDate) : undefined,
      itcEligible: docType === 'PURCHASE_INVOICE' && itcEligible !== null ? itcEligible : undefined,
      ...(rxNeeded ? { rx: rxBody(rx) } : {}),
      // MP1-COMPLETE — P2: only when asked AND chosen; otherwise the draft is exactly as before.
      ...refundToBody({
        walletOn: refundChoice.walletOn, type: docType, partyId: selectedParty?._id ?? jobParams.partyId, refundTo: refundChoice.value,
      }),
    };
  }, [lines, selectedParty, walkinName, walkinPhone, walkinState, docType, behaviour, sourceType, sourceId,
    jobParams.partyId, documentDate, dueDate, validUntil, goodsReturned, transportReason, transportReasonNote,
    deliveryDate, supplierInvoiceNo, supplierInvoiceDate, itcEligible, pharmacy.active, pharmacy.rxDrugs.length, rx,
    refundChoice.walletOn, refundChoice.value]);

  const handleIssue = useCallback(async () => {
    const problem = billProblem();
    if (problem) {
      setErrorMessage(problem);
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    // The plain path: a checkout draft opened earlier is not this bill any more.
    dropServerDraft();
    const draft = await addDraft(buildDraftInput());
    const settled = await retryDraft(draft.id);
    setSubmitting(false);
    await finishSettled(settled);
  }, [billProblem, buildDraftInput, addDraft, retryDraft, finishSettled, dropServerDraft]);

  /** Commerce Checkout: the same bill, priced by the server (offers), paid in parts / with points. */
  const openCheckout = useCallback(() => {
    const problem = billProblem();
    if (problem) {
      setErrorMessage(problem);
      return;
    }
    setErrorMessage(null);
    const input = buildDraftInput();
    setCheckoutPayload({ ...input, sourceType: input.sourceType ?? 'MANUAL' });
  }, [billProblem, buildDraftInput]);

  /** A checkout finished: settle the job it was raised for (as Issue does), then open the bill. */
  const onCheckoutDone = useCallback(async (documentId: string) => {
    if (sourceType === 'BOOKING' && sourceId) await bookingApi.invoice(sourceId).catch(() => {});
    if (sourceType === 'ORDER' && sourceId) await ordersApi.transition(sourceId, 'invoice').catch(() => {});
    void queryClient.invalidateQueries({ queryKey: qk.billing.all() });
    router.replace(toHref(`/(app)/billing/${documentId}`));
  }, [sourceType, sourceId, queryClient]);

  /** Hold: the bill is saved off the till (no number, no stock) and the till is cleared for the next customer. */
  const afterHeld = useCallback(() => {
    dropServerDraft();
    setLines([]);
    setSelectedParty(null);
    setWalkinName('');
    setWalkinPhone('');
    setResumedCoupon(undefined);
    setNotice(t('commerce.counter.heldToast'));
  }, [dropServerDraft, t]);

  if (!canManage) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.deniedBox}>
          <Text style={[styles.deniedTitle, { color: c.textPrimary }]}>{t('billing.new.deniedTitle')}</Text>
          <Text style={[styles.deniedBody, { color: c.textSecondary }]}>
            {t('billing.new.deniedBody')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton icon="close" onPress={() => router.back()} accessibilityLabel={t('billing.new.close')} />
        <Text style={[styles.topBarTitle, { color: c.textPrimary }]}>{t('billing.new.title')}</Text>
        {/* MP1-COMPLETE — tray (when on) + the "?" help for this screen, side by side on the right. */}
        <View style={styles.topBarRight}>
          {holdsOn ? (
            // C6: the held-bills tray, with how many are waiting.
            <View>
              <IconButton
                icon={heldCount > 0 ? 'tray-full' : 'tray'}
                onPress={() => setTrayOpen(true)}
                accessibilityLabel={t('commerce.counter.trayA11y', { count: heldCount })}
                testID="hold-tray-open"
              />
              {heldCount > 0 ? (
                <View pointerEvents="none" style={[styles.trayBadge, { backgroundColor: c.secondary }]}>
                  <Text style={{ color: c.textInverse, fontSize: 10, fontWeight: '700' }}>{heldCount > 20 ? '20' : String(heldCount)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <HelpButton c={c} />
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SegmentedButtons
            value={direction}
            onValueChange={(v) => setDirection(v as DocumentDirection)}
            density="small"
            buttons={[
              { value: 'SALES', label: t('billing.new.dirSales'), disabled: !canSales },
              { value: 'PURCHASE', label: t('billing.new.dirPurchase'), disabled: !canPurchases },
            ]}
          />

          {/* >>> WEB-UI — was a sideways ScrollView around equal-width segments,
              which still cut long type names short; FitSegments sizes each
              segment to its words and scrolls when they do not fit. */}
            <FitSegments
              value={docType}
              onValueChange={(v) => setDocType(v as BillingScreenDocumentType)}
              density="small"
              buttons={typesForDirection.map((type) => ({
                value: type,
                // An unregistered shop's TAX_INVOICE is issued untaxed — a bill of supply.
                label: t(documentTypeLabelKey(type, businessQuery.data?.isGstRegistered, undefined, isComposition ? 'BILL_OF_SUPPLY_COMPOSITION' : undefined)),
              }))}
            />
          {/* <<< WEB-UI */}

          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
              {direction === 'PURCHASE' ? t('billing.new.supplier') : t('billing.new.customer')}
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
                  { value: 'WALKIN', label: t('billing.new.walkIn') },
                  { value: 'SEARCH', label: t('billing.new.existingParty') },
                ]}
              />
            )}
            {partyMode === 'WALKIN' ? (
              <>
                <View style={styles.walkinRow}>
                  <TextInput
                    mode="outlined"
                    label={t('billing.new.nameOptional')}
                    value={walkinName}
                    onChangeText={setWalkinName}
                    placeholder={t('billing.new.walkInPlaceholder')}
                    style={styles.walkinInput}
                    outlineStyle={{ borderRadius: radii.field }}
                  />
                  <TextInput
                    mode="outlined"
                    label={t('billing.new.phoneOptional')}
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
                      label={t('billing.new.placeOfSupply')}
                      value={walkinState}
                      placeholder={t('billing.new.placeOfSupplyPlaceholder')}
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
                    ? t('billing.new.placeOfSupplySet', { state: walkinState })
                    : t('billing.new.placeOfSupplyHint')}
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
                  placeholder={t('billing.new.searchParty')}
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
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('billing.new.dates')}</Text>
            <DateField
              label={t('billing.new.documentDate')}
              value={documentDate}
              onChangeText={setDocumentDate}
              mode="date"
              // P1.12: a role may date a SALES bill at most `mayBackdateDays` back.
              minimumDate={earliestDay ? new Date(`${earliestDay}T00:00:00`) : undefined}
            />
            {takesSupplierBillFields(docType) && (
              <PurchaseBillFields
                c={c}
                showItc={docType === 'PURCHASE_INVOICE'}
                supplierInvoiceNo={supplierInvoiceNo}
                onSupplierInvoiceNo={setSupplierInvoiceNo}
                supplierInvoiceDate={supplierInvoiceDate}
                onSupplierInvoiceDate={setSupplierInvoiceDate}
                itcEligible={itcEligible}
                onItcEligible={setItcEligible}
                maxDate={documentDate}
              />
            )}
            {behaviour.dateField === 'dueDate' && (
              <DateField
                label={t('billing.new.dueDate')}
                value={dueDate}
                onChangeText={setDueDate}
                mode="date"
                minimumDate={documentDate ? new Date(`${documentDate}T00:00:00`) : undefined}
                placeholder={t('billing.new.dueDatePlaceholder')}
              />
            )}
            {behaviour.dateField === 'validUntil' && (
              <DateField
                label={t('billing.new.validUntil')}
                value={validUntil}
                onChangeText={setValidUntil}
                mode="date"
                minimumDate={documentDate ? new Date(`${documentDate}T00:00:00`) : undefined}
                placeholder={t('billing.new.validUntilPlaceholder')}
              />
            )}
            {statesDeliveryDate(docType) && (
              <DateField
                label={t('billing.new.deliveryDate')}
                value={deliveryDate}
                onChangeText={setDeliveryDate}
                mode="date"
                minimumDate={documentDate ? new Date(`${documentDate}T00:00:00`) : undefined}
                placeholder={t('billing.new.deliveryDatePlaceholder')}
              />
            )}
            {statesTransportReason(docType) && (
              <View style={{ gap: 6 }}>
                <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>{t('billing.new.transportReason')}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 11 }}>{t('billing.new.transportReasonHint')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {TRANSPORT_REASONS.map((code) => (
                    <Chip
                      key={code}
                      compact
                      selected={transportReason === code}
                      showSelectedCheck
                      mode={transportReason === code ? 'flat' : 'outlined'}
                      onPress={() => setTransportReason(code)}
                      accessibilityState={{ selected: transportReason === code }}
                    >
                      {t(TRANSPORT_REASON_LABEL_KEY[code])}
                    </Chip>
                  ))}
                </View>
                {transportReason === 'OTHER' && (
                  <TextInput
                    mode="outlined"
                    label={t('billing.new.transportReasonNote')}
                    value={transportReasonNote}
                    onChangeText={setTransportReasonNote}
                    maxLength={200}
                    outlineStyle={{ borderRadius: radii.field }}
                  />
                )}
              </View>
            )}
            {behaviour.stockNeedsGoodsFlag && (
              <View style={styles.goodsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>{t('billing.new.goodsReturned')}</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2 }}>
                    {t('billing.new.goodsReturnedHint')}
                  </Text>
                </View>
                <Switch value={goodsReturned} onValueChange={setGoodsReturned} />
              </View>
            )}
            {/* >>> MP1-COMPLETE — P2 */}
            {refundAsked ? (
              <RefundToChoice c={c} value={refundChoice.value} onChange={refundChoice.choose} disabled={submitting} />
            ) : null}
            {/* <<< MP1-COMPLETE */}
          </Surface>

          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('billing.new.items')}</Text>
              <Button mode="contained-tonal" icon="barcode-scan" compact onPress={() => setScannerOpen(true)}>
                {t('billing.new.scan')}
              </Button>
            </View>

            {/* C6 quick keys: one tap = one unit. Only when the shop set some. */}
            {salesSide && (quickKeysQuery.data?.length ?? 0) > 0 ? (
              <View style={{ gap: 6 }}>
                <QuickKeysGrid c={c} keys={quickKeysQuery.data ?? []} onTap={(k) => void onQuickKey(k)} busyId={quickBusy} />
                {commerce.counter.canSell ? (
                  <Pressable onPress={() => router.push('/commerce/quick-keys' as Href)} accessibilityRole="link" hitSlop={8} style={{ alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center' }}>
                    <Text style={{ color: c.primary, fontSize: 12.5, fontWeight: '600' }}>{t('commerce.counter.editQuickKeys')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <TextInput
              mode="outlined"
              placeholder={t('billing.new.searchCatalogue')}
              value={productQuery}
              onChangeText={setProductQuery}
              style={styles.walkinInput}
              outlineStyle={{ borderRadius: radii.field }}
              left={<TextInput.Icon icon="magnify" />}
            />
            {productResults.map((p) => {
              // C6: a parent asks "which size?" instead of going on the bill (it is not sellable).
              const pick = () => (p.isVariantParent
                ? setVariantPick({ parentName: p.name, parentId: p._id })
                : addOrBumpLine(lineFromProduct(p)));
              return (
                <Pressable key={p._id} onPress={pick} style={styles.resultRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resultName, { color: c.textPrimary }]}>{p.name}</Text>
                    <Text style={[styles.resultMeta, { color: c.textSecondary }]}>
                      {p.isVariantParent
                        ? t('commerce.counter.sizesCount', { count: p.variantCount ?? 0 })
                        : t('billing.new.perUnit', { price: formatPaise(p.sellPaise), unit: p.unit })}
                    </Text>
                  </View>
                  <IconButton icon={p.isVariantParent ? 'chevron-right-circle-outline' : 'plus-circle-outline'} size={20} onPress={pick} />
                </Pressable>
              );
            })}

            {lines.length > 0 && (
              <>
                <Divider style={{ marginVertical: 8 }} />
                {/*
                  The column is CAPTIONED, because the number under it is the
                  taxable value and not what the customer pays for the item.

                  It used to print the priced `totalPaise` — tax INSIDE — above a
                  "Taxable value" row that is the sum of the BASES and CGST/SGST
                  rows that then appear to add the same tax a second time. Three
                  true figures reconciling to nothing, on the one screen that is
                  read out loud with the customer standing at the counter; the
                  invoice detail card was fixed for exactly this.

                  It also answers the objection that put `totalPaise` here in the
                  first place — an exclusive line reading "₹100" under a bill that
                  says "₹118" — with the two LABELS rather than with the wrong
                  number: this caption says which of the two amounts the column
                  is, and the per-line caption below carries the other one and
                  ends on the ₹118 the customer is actually asked for.
                */}
                <View style={styles.lineHeaderRow}>
                  <Text style={[styles.columnCaption, { color: c.textSecondary }]}>{t('billing.new.taxableValue')}</Text>
                  {/* Holds the caption over the amounts instead of over the trash
                      can. Paper draws an IconButton at `size + 2×8` padding with a
                      6px margin each side, so the pair at `size={16}` is
                      2 × (16 + 16 + 12), plus the row's two 4px gaps. */}
                  <View style={styles.lineHeaderSpacer} />
                </View>
              </>
            )}
            {/*
              `preview.lines` is positional against `lines` — the same contract
              `computeDocumentTax` keeps — so the index is the join.
            */}
            {lines.map((line, idx) => {
              const priced = preview.lines[idx];
              const lineTaxPaise = priced
                ? priced.cgstPaise + priced.sgstPaise + priced.igstPaise + priced.cessPaise
                : 0;
              return (
              <View key={line.key} style={styles.lineRow}>
                <Pressable style={{ flex: 1 }} onPress={() => setEditingKey(line.key)}>
                  <Text style={[styles.lineName, { color: c.textPrimary }]} numberOfLines={1}>
                    {line.itemName}
                  </Text>
                  <Text style={[styles.lineMeta, { color: c.textSecondary }]}>
                    {formatPaise(line.ratePaise)} × {line.qty} {line.unit ?? ''}
                    {(line.discountPaise ?? 0) > 0 ? t('billing.new.lineDiscount', { amount: formatPaise(line.discountPaise) }) : ''}
                    {gstApplicable
                      ? t('billing.new.lineTaxSuffix', {
                        rate: line.taxRatePercent ?? 0,
                        mode: (line.taxInclusive ?? true) ? t('billing.new.lineTaxInclusive') : t('billing.new.lineTaxExtra'),
                      })
                      : ''}
                  </Text>
                  {/*
                    base → tax → what this item costs, on one line, in the same
                    order `LineEditorSheet` walks the partner through when they
                    type the line. A fourth column does not fit at 360dp next to a
                    qty stepper and two buttons; this does, and it means nobody has
                    to do the addition to answer "so what is this one?".
                  */}
                  {lineTaxPaise > 0 && (
                    <Text style={[styles.lineMeta, { color: c.textSecondary }]}>
                      {t('billing.new.lineTaxLine', { tax: formatPaise(lineTaxPaise), total: formatPaise(priced.totalPaise) })}
                    </Text>
                  )}
                  {pharmacy.active ? (
                    <PharmacyLineChip
                      c={c}
                      info={pharmacy.infoFor(line.itemId)}
                      batchLabel={line.batchLabel}
                      onPickBatch={() => setBatchKey(line.key)}
                      testID={`line-batch-${idx}`}
                    />
                  ) : null}
                  {limitViolation?.lineIndex === idx && limitMessage ? (
                    <Text style={[styles.lineMeta, { color: c.error, fontWeight: '600' }]} testID="line-limit-error">
                      {limitMessage}
                    </Text>
                  ) : null}
                </Pressable>
                <View style={styles.qtyStepper}>
                  {/* hitSlop takes each button's touch area past 44dp without
                      widening the row, which has to fit at 320dp. */}
                  <IconButton icon="minus" size={18} hitSlop={7} disabled={!canStepDown(line.qty)} onPress={() => updateQty(line.key, -1)} accessibilityLabel={t('billing.new.qtyLess', { item: line.itemName })} />
                  <Text style={{ color: c.textPrimary, minWidth: 24, textAlign: 'center' }}>{line.qty}</Text>
                  <IconButton icon="plus" size={18} hitSlop={7} onPress={() => updateQty(line.key, 1)} accessibilityLabel={t('billing.new.qtyMore', { item: line.itemName })} />
                </View>
                <Text style={[styles.lineAmount, { color: c.textPrimary }]}>
                  {formatPaise(priced?.taxablePaise ?? 0)}
                </Text>
                {/* Both, deliberately: removing a mis-scanned line is the most
                    common correction at a counter and must stay one tap, and the
                    pencil is what says the tax fields are in there at all — a
                    tappable row with no affordance is a feature nobody finds. */}
                <IconButton icon="pencil-outline" size={16} onPress={() => setEditingKey(line.key)} accessibilityLabel={t('billing.new.editLine', { item: line.itemName })} />
                <IconButton icon="trash-can-outline" size={16} onPress={() => removeLine(line.key)} accessibilityLabel={t('billing.new.removeLine', { item: line.itemName })} />
              </View>
              );
            })}

            <Button mode="text" icon="pencil-plus-outline" compact onPress={() => setEditingKey('NEW')} style={{ alignSelf: 'flex-start' }}>
              {t('billing.new.addOneOff')}
            </Button>
          </Surface>

          {/* P2 PHARMACY: a Schedule H/H1 medicine on the bill → the prescription goes on it. */}
          {pharmacy.rxDrugs.length > 0 && (
            <RxDetailsForm c={c} value={rx} onChange={setRx} drugs={pharmacy.rxDrugs} testID="bill-rx" />
          )}
          {pharmacy.scheduleXNames.length > 0 && (
            <Surface style={[styles.errorCard, { backgroundColor: c.error + '18' }]} elevation={0}>
              <Text style={{ color: c.error, fontSize: 13 }}>
                {t('errors.RX_SCHEDULE_X_NOT_ALLOWED', { itemName: pharmacy.scheduleXNames[0] })}
              </Text>
            </Surface>
          )}

          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            {/*
              A real breakup, priced by the mirror of the server's own function.

              This card used to show one "Estimated total" that was the PRE-TAX
              sum and said so in small print. That was honest, and it was also
              the thing the partner was complaining about: the number under their
              thumb on the Issue button was not the number the customer would be
              asked for, and on an exclusive-priced line it was not even close.
            */}
            <TotalLine label={t('billing.new.taxableValue')} value={totals.subPaise} c={c} />
            {/*
              A caption, NOT a signed row. `previewDocumentTax` derives each
              line's `taxablePaise` from `gross − discount`, so `subPaise` above
              is ALREADY net of every line discount — a "− ₹50" row under it
              invited the partner to take the same ₹50 off a second time and land
              below the Total printed on the button they are about to press.
              The invoice detail card and the web both dropped the row for this
              reason; the figure stays, because "how much did I knock off" is
              worth knowing — just not as an operation.
            */}
            {totals.discountPaise > 0 && (
              <Text style={[styles.totalHint, { color: c.textSecondary }]}>
                {t('billing.new.afterDiscounts', { amount: formatPaise(totals.discountPaise) })}
              </Text>
            )}
            {gstApplicable && preview.interState && <TotalLine label={t('billing.new.igst')} value={totals.igstPaise} c={c} />}
            {gstApplicable && !preview.interState && (
              <>
                <TotalLine label={t('billing.new.cgst')} value={totals.cgstPaise} c={c} />
                <TotalLine label={t('billing.new.sgst')} value={totals.sgstPaise} c={c} />
              </>
            )}
            {totals.cessPaise > 0 && <TotalLine label={t('billing.new.cess')} value={totals.cessPaise} c={c} />}
            {totals.roundOffPaise !== 0 && <TotalLine label={t('billing.new.roundOff')} value={totals.roundOffPaise} c={c} />}
            <Divider style={{ marginVertical: 6 }} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: c.textSecondary }]}>{t('billing.new.total')}</Text>
              <Text style={[styles.totalAmount, { color: c.textPrimary }]}>{formatPaise(totals.grandPaise)}</Text>
            </View>
            <Text style={[styles.totalHint, { color: c.textSecondary }]}>
              {/* Two whole sentences rather than one with an optional clause
                  spliced in: "to <state>" sits mid-sentence in English and
                  takes a postposition after the state in Hindi, so the frame
                  has to belong to each language. */}
              {!gstApplicable
                ? t('billing.new.noGstHint')
                : preview.interState
                  ? (placeOfSupply
                    ? t('billing.new.interStateHint', { state: placeOfSupply })
                    : t('billing.new.interStateHintNoState'))
                  : t('billing.new.intraStateHint')}
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
              <Text style={[styles.totalHint, { color: c.textSecondary }]}>{t('billing.new.checkingGst')}</Text>
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
                {/* One key per plural form. The English was assembled from four
                    fragments whose agreement ("has"/"have", "it"/"them") is a
                    fact about English, not about the count. */}
                {t('billing.new.untaxed', { count: untaxedLineCount })}
              </Text>
            )}
          </Surface>

          {limitMessage && limitViolation?.lineIndex === undefined && (
            <Surface style={[styles.errorCard, { backgroundColor: c.error + '18' }]} elevation={0}>
              <Text style={{ color: c.error, fontSize: 13 }} testID="bill-limit-error">{limitMessage}</Text>
            </Surface>
          )}
          {errorMessage && (
            <Surface style={[styles.errorCard, { backgroundColor: c.error + '18' }]} elevation={0}>
              <Text style={{ color: c.error, fontSize: 13 }}>{errorMessage}</Text>
            </Surface>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.bottomBar, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
        <UsageMeter capacity={invoiceCapacity} c={c} />
        {/*
          C6 / C3 at the counter: Hold (park this customer) and, when the shop has
          offers / points / split payment on, Checkout is the main action and the
          plain Issue (which also works offline) stays one tap away. Pills size to
          their label and wrap — nothing is stretched at 320dp.
        */}
        {lines.length > 0 && (holdsOn || checkoutOn) ? (
          <View style={styles.counterActions}>
            {holdsOn ? (
              <PillButton c={c} tone="outline" icon="pause-circle-outline" label={t('commerce.counter.hold')} onPress={() => setHoldOpen(true)} disabled={submitting} testID="hold-open" />
            ) : null}
            {checkoutOn ? (
              <PillButton
                c={c}
                tone="outline"
                icon="file-check-outline"
                label={t('commerce.counter.issueOnly')}
                onPress={() => void handleIssue()}
                disabled={submitting || invoiceCapacity.atLimit || !!limitMessage}
                testID="issue-plain"
              />
            ) : null}
          </View>
        ) : null}
        <Button
          mode="contained"
          onPress={checkoutOn ? openCheckout : handleIssue}
          loading={submitting}
          disabled={submitting || lines.length === 0 || invoiceCapacity.atLimit || !!limitMessage}
          style={{ borderRadius: radii.field, marginTop: 8 }}
          testID="bill-primary"
        >
          {checkoutOn
            ? t('commerce.counter.checkoutAmount', { amount: formatPaise(totals.grandPaise) })
            : docType === 'TAX_INVOICE'
              ? t('billing.new.issueInvoice', { amount: formatPaise(totals.grandPaise) })
              : t('billing.new.saveAndIssue')}
        </Button>
      </View>

      {/* ── Commerce at the counter (sheets render nothing until opened) */}
      {variantPick ? (
        <VariantPickerSheet
          visible={!!variantPick}
          parentName={variantPick.parentName}
          parentId={variantPick.parentId}
          variants={variantPick.variants}
          onPick={(v) => addOrBumpLine(lineFromProduct(v))}
          onDismiss={() => setVariantPick(null)}
        />
      ) : null}
      {holdsOn ? (
        <>
          <HoldNameSheet
            visible={holdOpen}
            defaultLabel={defaultHoldLabel(selectedParty?.name ?? (walkinName.trim() || undefined), new Date(), t)}
            build={() => {
              const partyId = selectedParty?._id ?? jobParams.partyId;
              return { lines: holdLinesOf(lines), ...(partyId ? { partyId } : {}), ...(resumedCoupon ? { couponCode: resumedCoupon } : {}) };
            }}
            onDismiss={() => setHoldOpen(false)}
            onHeld={afterHeld}
          />
          <HoldTraySheet
            visible={trayOpen}
            onDismiss={() => setTrayOpen(false)}
            onResumed={onResumed}
            warning={lines.length ? t('commerce.counter.trayReplaces') : undefined}
          />
        </>
      ) : null}
      {checkoutPayload ? (
        <CounterCheckoutSheet
          visible={!!checkoutPayload}
          onDismiss={() => setCheckoutPayload(null)}
          payload={checkoutPayload}
          draftId={serverDraftId}
          onDraftId={setServerDraftId}
          partyId={checkoutPayload.partyId}
          initialCoupon={resumedCoupon}
          features={checkoutFeatures}
          canViewWallet={commerce.wallet.canView}
          onDone={(documentId) => {
            setCheckoutPayload(null);
            setServerDraftId(null);
            void onCheckoutDone(documentId);
          }}
        />
      ) : null}
      <Snackbar visible={!!notice} onDismiss={() => setNotice(null)} duration={2500}>
        {notice}
      </Snackbar>

      <Portal>
        <Modal
          visible={scannerOpen}
          onDismiss={() => setScannerOpen(false)}
          contentContainerStyle={[styles.scannerModal, { backgroundColor: c.background }]}
        >
          <View style={styles.scannerHeader}>
            <Text style={[styles.topBarTitle, { color: c.textPrimary }]}>{t('billing.new.scanItems')}</Text>
            <IconButton icon="close" onPress={() => setScannerOpen(false)} accessibilityLabel={t('billing.new.doneScanning')} />
          </View>
          {/* The hint now names the ONE physical gesture the latch depends on.
              A held pack is one line, not a climbing count, so a cashier
              wanting two of something has to lift the phone away and come
              back — which is what they already do, but they should not have to
              discover it by finding out the second tin did not register. */}
          <BarcodeScannerView
            active={scannerOpen}
            onResult={handleScanResult}
            onAddNew={addNewFromScan /* >>> SCANNER */}
            hint={t('billing.new.scanHint')}
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
        // P1.12 role limits, on SALES documents only.
        lockRate={direction === 'SALES' && roleLimits.mayEditPrice === false
          && !!(editingKey && editingKey !== 'NEW' && lines.find((l) => l.key === editingKey)?.itemId)}
        discountCapPercent={direction === 'SALES' ? roleLimits.maxDiscountPercent : undefined}
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
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('billing.new.placeOfSupplyTitle')}</Text>
            <IconButton icon="close" onPress={() => setStatePickerOpen(false)} accessibilityLabel={t('billing.new.close')} />
          </View>
          <ScrollView>
            <Pressable
              onPress={() => { setWalkinState(''); setStatePickerOpen(false); }}
              style={[styles.stateRow, { borderBottomColor: c.divider }]}
            >
              <Text style={{ color: !walkinState ? c.primary : c.textPrimary, fontWeight: !walkinState ? '700' : '400' }}>
                {t('billing.new.sameState')}
              </Text>
            </Pressable>
            {/*
              THE STATE NAMES STAY IN ENGLISH, on the row as well as on the
              wire. `s` is both what is rendered and what is stored as
              `placeOfSupply`, and the server resolves it to a GST state code by
              matching the NAME (`GST_STATE_CODES`) — an unrecognised name is
              read as no answer, which means intra-state, which means the wrong
              CGST/SGST-vs-IGST split on a real invoice. Showing a Hindi label
              here would require a second table mapping it back, i.e. a second
              answer to a tax question inside the client. See the header on
              `GST_STATES` in `features/billing/types.ts`.
            */}
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

      {pharmacy.active && (
        <BatchPickSheet
          visible={!!batchLine}
          productId={batchLine?.itemId ?? null}
          productName={batchLine?.itemName ?? ''}
          qty={batchLine?.qty ?? 1}
          selectedBatchId={batchLine?.batchId}
          onPick={(pick) => batchKey && pickBatch(batchKey, pick)}
          onDismiss={() => setBatchKey(null)}
        />
      )}

      <Snackbar visible={!!scanError} onDismiss={() => setScanError(null)} duration={3000}>
        {scanError}
      </Snackbar>
    </SafeAreaView>
  );
}

/** One line of the totals breakup. Negative values (a downward round-off) print with the sign `formatPaise` gives them. */
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
  topBarTitle: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  // MP1-COMPLETE — at least the close button's width, so the title stays centred.
  topBarRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minWidth: 48, paddingRight: 4 },
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
  // No `gap` here on purpose: the spacer's width is measured from the right edge
  // of the row, so a gap between it and the caption would push the caption off
  // the amount column by exactly that much.
  lineHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  lineHeaderSpacer: { width: 96 },
  columnCaption: { flex: 1, textAlign: 'right', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
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
  counterActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  trayBadge: { position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  scannerModal: { flex: 1, margin: 0 },
  scannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 8 },
  deniedBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  deniedTitle: { fontSize: 16, fontWeight: '600' },
  deniedBody: { fontSize: 13, textAlign: 'center' },
});
