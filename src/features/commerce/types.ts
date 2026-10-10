/**
 * Commerce C3–C6 wire shapes, read from the BUILT backend (not the contract
 * prose): `controllers/commerce-*.controller.ts`, `services/commerce/*` and
 * `validators/commerce.validator.ts` / `commerce-wallet.validator.ts`.
 *
 * Money = integer paise. Offer percentages = BASIS POINTS (1% = 100). Points =
 * whole points. Dates arrive as ISO strings.
 */
import type { CommerceFeature } from './features';

// ═══════════════════════════════════════════════════════════════ settings (§1.1)

export interface OffersSettings { enabled: boolean; couponsEnabled: boolean; maxOffersPerOrder: number; allowAtCounter: boolean }
export interface CatalogCommerceSettings { variantsEnabled: boolean; bundlesEnabled: boolean }
export interface WalletSettings { enabled: boolean; refundToCreditDefault: boolean; allowAtCounter: boolean }
export interface LoyaltySettings {
  enabled: boolean; pointsPer100Rupees: number; pointValuePaise: number; minRedeemPoints: number;
  maxRedeemPercent: number; expiryDays: number; earnAtCounter: boolean;
}
export interface ReferralSettings { enabled: boolean; referrerPoints: number; refereePoints: number; minQualifyingOrderPaise: number }
export interface GrowthSettings { broadcastEnabled: boolean; maxBroadcastsPerWeek: number; backInStockEnabled: boolean }
export interface CounterSettings { holdEnabled: boolean; quickKeys: string[]; splitTenderEnabled: boolean }

/**
 * The sections C3–C6 own. The storefront / delivery / fulfilment / share
 * sections (C1/C2) arrive too and are carried untouched — this app's C3–C6
 * screen never sends them.
 */
export interface CommerceSettings {
  offers: OffersSettings;
  catalog: CatalogCommerceSettings;
  wallet: WalletSettings;
  loyalty: LoyaltySettings;
  referral: ReferralSettings;
  growth: GrowthSettings;
  counter: CounterSettings;
  [section: string]: unknown;
}

/** `GET/PUT /partners/me/commerce/settings`. */
export interface CommerceSettingsPayload {
  settings: CommerceSettings;
  features: CommerceFeature[];
  explicit?: { acceptOrdersWhenClosed: boolean | null };
  openNow?: boolean;
  opensAt?: string;
  timezone?: string;
}

/** A section patch — `commerceSettingsUpdateSchema` (every key optional). */
export type CommerceSettingsPatch = {
  offers?: Partial<OffersSettings>;
  catalog?: Partial<CatalogCommerceSettings>;
  wallet?: Partial<WalletSettings>;
  loyalty?: Partial<LoyaltySettings>;
  referral?: Partial<ReferralSettings>;
  growth?: Partial<GrowthSettings>;
  counter?: Partial<Omit<CounterSettings, 'quickKeys'>>;
};

/** `COMMERCE_SETTINGS_BOUNDS` (model) — the editor's limits. */
export const COMMERCE_BOUNDS = {
  maxOffersPerOrder: 5,
  maxPointsPer100Rupees: 1000,
  maxPointValuePaise: 10_000,
  maxRedeemPercent: 100,
  maxExpiryDays: 3650,
  maxBroadcastsPerWeek: 14,
  maxQuickKeys: 24,
} as const;

// ═══════════════════════════════════════════════════════════════ offers (§8)

export const OFFER_KINDS = ['AUTO', 'COUPON'] as const;
export type OfferKind = typeof OFFER_KINDS[number];
export const OFFER_BENEFIT_TYPES = ['FLAT', 'PERCENT', 'BUY_X_GET_Y', 'FREE_DELIVERY'] as const;
export type OfferBenefitType = typeof OFFER_BENEFIT_TYPES[number];
export const OFFER_SCOPE_TYPES = ['ORDER', 'PRODUCTS', 'CATEGORIES'] as const;
export type OfferScopeType = typeof OFFER_SCOPE_TYPES[number];
export const OFFER_CHANNELS = ['ONLINE', 'COUNTER'] as const;
export type OfferChannel = typeof OFFER_CHANNELS[number];
export const OFFER_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export type OfferStatus = typeof OFFER_STATUSES[number];
/** `COUPON_CODE_PATTERN` (model). */
export const COUPON_CODE_PATTERN = /^[A-Z0-9]{3,16}$/;

export interface OfferBenefit {
  type: OfferBenefitType;
  valuePaise?: number;
  percentBp?: number;
  maxDiscountPaise?: number;
  buyQty?: number;
  getQty?: number;
  getProductId?: string;
}
export interface OfferConditions {
  minOrderPaise?: number;
  firstOrderOnly?: boolean;
  startsAt?: string;
  endsAt?: string;
  /** 0 = Sunday … 6 = Saturday. */
  daysOfWeek?: number[];
  timeWindows?: Array<{ from: string; to: string }>;
  partyTags?: string[];
}
export interface OfferScope { type: OfferScopeType; productIds?: string[]; categoryIds?: string[]; excludeProductIds?: string[] }
export interface OfferLimits { perCustomer?: number; total?: number }
export interface OfferStacking { stackable: boolean; priority: number }

/** `offerView()` — the stored offer + `id`, `stats`, `live`. */
export interface OfferView {
  id: string;
  _id?: string;
  name: string;
  description?: string;
  kind: OfferKind;
  code?: string;
  benefit: OfferBenefit;
  conditions?: OfferConditions;
  scope: OfferScope;
  channels: OfferChannel[];
  limits?: OfferLimits;
  stacking?: OfferStacking;
  status: OfferStatus;
  usedCount?: number;
  discountGivenPaise?: number;
  stats: { usedCount: number; discountGivenPaise: number };
  /** Running right now (status, dates, total limit). */
  live: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdByName?: string;
}

export interface OfferRedemption {
  id: string;
  sourceType: 'ORDER' | 'DOCUMENT';
  sourceId: string;
  sourceRef?: string;
  code?: string;
  /** Only for a reader holding CUSTOMERS. */
  partyName?: string;
  discountPaise: number;
  status: 'APPLIED' | 'REVERSED';
  reversedAt?: string;
  reverseReason?: string;
  createdAt: string;
}

export type OfferDetail = OfferView & { recentRedemptions: OfferRedemption[] };

/** `offerCreateSchema` body. `offerUpdateSchema` = the same minus `kind`. */
export interface OfferInput {
  name: string;
  description?: string;
  kind: OfferKind;
  code?: string;
  benefit: OfferBenefit;
  conditions: OfferConditions;
  scope: OfferScope;
  channels: OfferChannel[];
  limits: OfferLimits;
  stacking: OfferStacking;
}

export interface Paged<T> { data: T[]; page: number; limit: number; total: number }

// ═══════════════════════════════════════════════════════════════ wallet (§9)

export type WalletBucket = 'CREDIT' | 'POINTS';

export interface WalletListRow {
  partyId: string;
  name: string;
  creditPaise: number;
  points: number;
  expiringSoon?: { points: number; on: string };
}

export interface WalletDetail {
  partyId: string;
  name: string;
  creditPaise: number;
  points: number;
  usablePoints: number;
  expiring: Array<{ expiresAt: string; points: number }>;
  referralCode?: string;
  referrals: { rewarded: number; pending: number };
}

export interface WalletStatementRow {
  id: string;
  bucket: WalletBucket;
  type: string;
  kind?: 'TOPUP' | 'TOPUP_REFUND' | 'TOPUP_CANCEL' | 'TOPUP_REFUND_CANCEL';
  /** Signed: paise for CREDIT, points for POINTS. */
  amount: number;
  balanceAfter: number;
  sourceRef?: string;
  note?: string;
  expiresAt?: string;
  createdAt: string;
  createdByName?: string;
  // >>> GAP-C-SHOP — TOPUP / TOPUP_REFUND rows name their money leg: the receipt PDF's id.
  paymentId?: string;
  // <<< GAP-C-SHOP
}

// >>> GAP-C-SHOP — `POST /partners/me/wallet/:partyId/referral-code`.
export interface ReferralCodeResult { partyId: string; referralCode: string; referrals: { rewarded: number; pending: number } }
// <<< GAP-C-SHOP

/** `walletTopUpSchema` — top-up and pay-back share it. */
export const TOPUP_MODES = ['CASH', 'UPI', 'CARD', 'BANK'] as const;
export type TopUpMode = typeof TOPUP_MODES[number];
export interface TopUpBody { amountPaise: number; mode: TopUpMode; reference?: string; note?: string }

export interface TopUpResult {
  receiptNo: string;
  amountPaise: number;
  paymentId: string;
  creditPaymentId: string;
  creditPaise: number;
  entryId: string;
  duplicate: boolean;
  receiptUrl: string;
}

export interface AdjustBody { bucket: WalletBucket; amount: number; reason: string }
export interface AdjustResult { creditPaise: number; points: number; entry: WalletStatementRow }

// ═══════════════════════════════════════════════════════════════ growth (§10)

export const SPEND_TIERS = ['NEW', 'REGULAR', 'LOYAL', 'VIP'] as const;
export type SpendTier = typeof SPEND_TIERS[number];

export interface BroadcastSegment {
  tags?: string[];
  societyIds?: string[];
  blockNames?: string[];
  spendTiers?: SpendTier[];
  spendWindowDays?: number;
  lastOrderOlderThanDays?: number;
  hasOrdered?: boolean;
}

export type BroadcastStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED' | 'FAILED';

export interface Broadcast {
  id: string;
  title: string;
  body: string;
  offerId?: string;
  productId?: string;
  segment: BroadcastSegment;
  status: BroadcastStatus;
  scheduledAt?: string;
  sentAt?: string;
  audienceCount?: number;
  suppressedCount?: number;
  failureNote?: string;
  /** M23 — the reason as a code (SWITCHED_OFF | WEEKLY_LIMIT | NO_AUDIENCE | LINK_GONE | SEND_FAILED); old rows: note only. */
  failureCode?: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WeeklyAllowance { used: number; max: number; nextAllowedAt?: string }
export type BroadcastList = Paged<Broadcast> & { weekly: WeeklyAllowance };
export interface AudienceCount { count: number; suppressed: { optedOut: number; muted: number; tooSoon: number } }
export interface BroadcastInput {
  title: string;
  body: string;
  offerId?: string;
  productId?: string;
  segment: BroadcastSegment;
  scheduledAt?: string;
}
// >>> GAP-C-SHOP — an EDIT may send `scheduledAt: null`: the time is cleared and a SCHEDULED one is a DRAFT again.
export type BroadcastUpdate = Partial<Omit<BroadcastInput, 'scheduledAt'>> & { scheduledAt?: string | null };
/** What the label sheet answer's headers say: labels made, products left out (no barcode / sizes parent). */
export interface LabelCounts { labels: number; skipped: number }
// <<< GAP-C-SHOP
/** `MAX_SCHEDULE_AHEAD_DAYS` (broadcast.service). */
export const MAX_SCHEDULE_AHEAD_DAYS = 30;

export interface InsightsQuery { from?: string; to?: string; deadDays?: number; slowDays?: number; limit?: number }
export interface InsightsOverview {
  from: string; to: string;
  orders: number; bills: number; revenuePaise: number; aovPaise: number;
  basket: { linesPerOrder: number; unitsPerOrder: number };
  discountGivenPaise: number; deliveryFeesPaise: number; pointsRedeemedPaise: number; storeCreditUsedPaise: number;
}
export interface HeatCell { orders: number; salesPaise: number }
/** `grid[weekday 0=Sun][hour 0–23]` on the shop's clock. */
export interface InsightsHeatmap { grid: HeatCell[][]; timezone: string; from?: string; to?: string }
export interface TopCustomer {
  partyId: string; name: string; orders: number; spendPaise: number; aovPaise: number;
  avgGapDays: number | null; daysSinceLast: number | null;
}
export interface StaffSalesRow { userId: string; name: string; bills: number; billsPaise: number; ordersHandled: number; ordersDelivered: number }
export type StockClass = 'DEAD' | 'SLOW' | 'MOVING' | 'NEW';
export interface DeadStockRow { productId: string; name: string; stockQty: number; lastSoldAt?: string; class: StockClass; valuePaise?: number }
export interface StockAlertDemand { productId: string; name: string; waiting: number }

// ═══════════════════════════════════════════════════════════════ counter (§11)

export interface HoldLine { itemId?: string; itemName: string; qty: number; unit?: string; ratePaise?: number; discountPaise?: number }
export interface CounterHold {
  _id: string;
  label: string;
  partyId?: string;
  couponCode?: string;
  lines: HoldLine[];
  approxTotalPaise: number;
  status: 'HELD' | 'RESUMED' | 'DISCARDED' | 'EXPIRED';
  heldByName?: string;
  heldAt: string;
  expiresAt: string;
}
export interface HoldInput { label: string; partyId?: string; couponCode?: string; lines: HoldLine[] }

/** A held line, back at TODAY's catalogue (`ResumedLine`). */
export interface ResumedLine {
  itemId?: string;
  itemName: string;
  qty: number;
  unit: string;
  ratePaise: number;
  discountPaise?: number;
  hsn?: string;
  taxRatePercent?: number;
  taxInclusive?: boolean;
  catalogueRatePaise?: number;
  rateTyped?: boolean;
  issue?: 'GONE' | 'OFF_SALE' | 'PARENT' | 'OUT_OF_STOCK';
}
export interface ResumeResult { hold: CounterHold; lines: ResumedLine[] }

export interface QuickKey {
  productId: string; name: string; unit: string; sellPaise: number; image?: string; stockQty?: number;
  // >>> GAP-C-SHOP — what a counter line needs, so a tap bills with no product fetch
  // (catalogue names; the bill line calls `hsnCode` `hsn`). Absent on an older server.
  mrpPaise?: number;
  taxRatePercent?: number;
  taxInclusive?: boolean;
  hsnCode?: string;
  // <<< GAP-C-SHOP
}

export type UsePoints = number | 'MAX';
export interface PointsQuote {
  usablePoints: number;
  maxRedeemable: number;
  points: number;
  discountPaise: number;
  totalBeforePaise: number;
  totalAfterPaise: number;
}

/** `splitTenderSchema` modes: the five client modes + STORE_CREDIT. */
export const TENDER_MODES = ['CASH', 'UPI', 'CARD', 'BANK', 'ONLINE', 'STORE_CREDIT'] as const;
export type TenderMode = typeof TENDER_MODES[number];
export interface TenderPart { mode: TenderMode; amountPaise: number; reference?: string }
export const MAX_TENDER_PARTS = 5;

export interface CounterCheckoutResult {
  document: { _id: string; number?: string; status: string; totals: { grandPaise: number } };
  payments: Array<{ _id: string; mode: string; amountPaise: number }>;
  points?: { redeemed: number; discountPaise: number };
}

// ═══════════════════════════════════════════════════════════════ catalogue (§11, C3 bundles)

export const VARIANT_ATTRIBUTE_NAMES = ['SIZE', 'COLOUR', 'PACK', 'FLAVOUR', 'WEIGHT', 'OTHER'] as const;
export type VariantAttributeName = typeof VARIANT_ATTRIBUTE_NAMES[number];
export interface VariantAttribute { name: VariantAttributeName; value: string }
export const MAX_VARIANT_ATTRIBUTES = 3;
export const MAX_VARIANTS = 50;
export const MAX_BUNDLE_COMPONENTS = 20;

export interface VariantInput {
  attributes: VariantAttribute[];
  sellPaise: number;
  mrpPaise?: number;
  sku?: string;
  barcode?: string;
  stockQty?: number;
}

export interface BundleComponent { productId: string; qty: number }

export const LABEL_LAYOUTS = ['A4_65', 'A4_24', 'ROLL_50x25'] as const;
export type LabelLayout = typeof LABEL_LAYOUTS[number];
export interface LabelSheetInput {
  items: Array<{ productId: string; copies: number }>;
  layout: LabelLayout;
  showPrice: boolean;
  showMrp: boolean;
}
