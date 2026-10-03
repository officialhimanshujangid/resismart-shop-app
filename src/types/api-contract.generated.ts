/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 *
 * The API contract this client shares with the backend. Regenerate from the
 * backend package with:
 *
 *   npm run types:generate
 *
 * Editing this file by hand is how the two sides quietly stop agreeing: your
 * change survives until the next regeneration and then vanishes, and nothing
 * says so. If a value is wrong, change it at the source in the backend.
 */

/** Which kind of tenant a session is scoped to. */
export const TENANT_TYPES = ['SYSTEM', 'SOCIETY', 'PARTNER'] as const;
export type TenantType = typeof TENANT_TYPES[number];

/** Every role a context can carry. */
export const USER_ROLES = ['SYSTEM_OWNER', 'SYSTEM_EMPLOYEE', 'SOCIETY_ADMIN', 'SOCIETY_COMMITTEE', 'RESIDENT_OWNER', 'RESIDENT_TENANT', 'SOCIETY_EMPLOYEE', 'FAMILY_MEMBER', 'PARTNER_ADMIN', 'PARTNER_OWNER', 'PARTNER_CLIENT', 'PARTNER_MANAGER', 'PARTNER_STAFF', 'PARTNER_AGENT'] as const;
export type UserRole = typeof USER_ROLES[number];

/** Whether a partner sells services, goods, or both. */
export const PARTNER_KINDS = ['SERVICE', 'RETAIL', 'BOTH'] as const;
export type PartnerKind = typeof PARTNER_KINDS[number];

/** Where a service happens — at the partner, or at the customer. */
export const PARTNER_SERVICE_MODES = ['AT_PARTNER', 'AT_CUSTOMER'] as const;
export type PartnerServiceMode = typeof PARTNER_SERVICE_MODES[number];

/** Lifecycle of a partner account. */
export const PARTNER_STATUSES = ['DRAFT', 'PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'ARCHIVED'] as const;
export type PartnerStatus = typeof PARTNER_STATUSES[number];

/** Where a partner sits in KYC review. */
export const PARTNER_VERIFICATION_STATUSES = ['UNSUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED'] as const;
export type PartnerVerificationStatus = typeof PARTNER_VERIFICATION_STATUSES[number];

/** KYC document kinds a partner can upload. */
export const PARTNER_DOC_TYPES = ['GST', 'PAN', 'LICENSE', 'SHOP_ACT', 'OTHER'] as const;
export type PartnerDocType = typeof PARTNER_DOC_TYPES[number];

/** Feature modules a partner can have switched on (gate 2). */
export const PARTNER_MODULES = ['BOOKINGS', 'CATALOG', 'ORDERS', 'INVOICING', 'PROMOTION'] as const;
export type PartnerModule = typeof PARTNER_MODULES[number];

/** Permission rows a partner staff role can grant (gate 3). */
export const PARTNER_ACCESS_MODULES = ['BOOKINGS_VIEW', 'BOOKINGS_MANAGE', 'CATALOG_VIEW', 'CATALOG_MANAGE', 'ORDERS_VIEW', 'ORDERS_MANAGE', 'INVOICING_VIEW', 'INVOICING_MANAGE', 'CUSTOMERS', 'REPORTS', 'PROMOTION', 'STAFF', 'SETTINGS', 'PURCHASES_VIEW', 'PURCHASES_MANAGE', 'STOCK_VIEW', 'STOCK_MANAGE', 'STOCK_COUNT', 'EXPENSES_VIEW', 'EXPENSES_MANAGE', 'ACCOUNTS', 'COSTS', 'DOCUMENTS_VOID', 'PHARMACY_VIEW', 'PHARMACY_MANAGE', 'RX_REGISTER', 'SUBSCRIPTIONS_VIEW', 'SUBSCRIPTIONS_MANAGE', 'DELIVERIES_MARK', 'ATTENDANCE_MARK', 'PACKAGES_MANAGE', 'JOBS_QUOTE', 'STOREFRONT_MANAGE', 'OFFERS_VIEW', 'OFFERS_MANAGE', 'ORDER_DELIVERIES', 'WALLET_VIEW', 'WALLET_MANAGE', 'BROADCAST_SEND'] as const;
export type PartnerAccessModule = typeof PARTNER_ACCESS_MODULES[number];

/** Input types an owner can put on a category booking form. */
export const BOOKING_FIELD_TYPES = ['TEXT', 'TEXTAREA', 'SELECT', 'NUMBER', 'DATE', 'BOOLEAN'] as const;
export type BookingFieldType = typeof BOOKING_FIELD_TYPES[number];

/** How a service is priced — fixed, starting-from, or quote-on-request. */
export const SERVICE_PRICE_TYPES = ['FIXED', 'FROM', 'QUOTE'] as const;
export type ServicePriceType = typeof SERVICE_PRICE_TYPES[number];

/** Units a catalog product can be sold in. */
export const PRODUCT_UNITS = ['PCS', 'BOX', 'KG', 'LTR', 'PKT', 'DOZ', 'GM', 'ML'] as const;
export type ProductUnit = typeof PRODUCT_UNITS[number];

/** Lifecycle of a partner boost purchase. */
export const PARTNER_BOOST_STATUSES = ['PENDING', 'ACTIVE', 'EXPIRED', 'FAILED', 'REFUNDED'] as const;
export type PartnerBoostStatus = typeof PARTNER_BOOST_STATUSES[number];

/** Lifecycle of a service booking. */
export const BOOKING_STATUSES = ['REQUESTED', 'ACCEPTED', 'SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'REJECTED', 'CANCELLED', 'NO_SHOW'] as const;
export type BookingStatus = typeof BOOKING_STATUSES[number];

/** Lifecycle of a catalog order. */
export const ORDER_STATUSES = ['PLACED', 'ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'INVOICED', 'PAID', 'REJECTED', 'CANCELLED', 'RETURNED'] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

/** Billing document kinds a partner can issue or record. */
export const PARTNER_DOCUMENT_TYPES = ['TAX_INVOICE', 'QUOTATION', 'PROFORMA', 'DELIVERY_CHALLAN', 'CREDIT_NOTE', 'SALES_RETURN', 'PURCHASE_INVOICE', 'PURCHASE_ORDER', 'DEBIT_NOTE', 'GOODS_RECEIPT'] as const;
export type PartnerDocumentType = typeof PARTNER_DOCUMENT_TYPES[number];

/** How a partner payment was made or received. */
export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'BANK', 'ONLINE'] as const;
export type PaymentMode = typeof PAYMENT_MODES[number];

/** Homes: what kind of property an ad is for. */
export const PROPERTY_TYPES = ['APARTMENT', 'STUDIO', 'PENTHOUSE', 'BUILDER_FLOOR', 'INDEPENDENT_HOUSE', 'VILLA', 'ROW_HOUSE', 'ROOM', 'SHOP', 'OFFICE', 'OTHER'] as const;
export type PropertyType = typeof PROPERTY_TYPES[number];

/** Homes: the unit an area was typed in (stored as sqft). */
export const AREA_UNITS = ['SQFT', 'SQM', 'SQYD'] as const;
export type AreaUnit = typeof AREA_UNITS[number];

/** Homes: which way the property faces. */
export const FACINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Facing = typeof FACINGS[number];

/** Homes: sale ad possession status. */
export const POSSESSION_STATUSES = ['READY', 'UNDER_CONSTRUCTION'] as const;
export type PossessionStatus = typeof POSSESSION_STATUSES[number];

/** Homes: where a rent ad's maintenance figure came from. */
export const MAINTENANCE_SOURCES = ['SOCIETY_BILLING', 'OWNER'] as const;
export type MaintenanceSource = typeof MAINTENANCE_SOURCES[number];

/** Homes: tenants the owner prefers (empty = anyone). */
export const TENANT_PREFS = ['FAMILY', 'BACHELOR_MALE', 'BACHELOR_FEMALE', 'COMPANY'] as const;
export type TenantPref = typeof TENANT_PREFS[number];

/** Homes: the browse filter for tenant preference. */
export const TENANT_PREFERENCE_FILTERS = ['FAMILY', 'BACHELOR', 'COMPANY'] as const;
export type TenantPreferenceFilter = typeof TENANT_PREFERENCE_FILTERS[number];

/** Homes: pets on a rent ad. */
export const PETS_POLICIES = ['ALLOWED', 'NOT_ALLOWED', 'ASK'] as const;
export type PetsPolicy = typeof PETS_POLICIES[number];

/** Homes: food preference on a rent ad. */
export const FOOD_POLICIES = ['ANY', 'VEG_ONLY'] as const;
export type FoodPolicy = typeof FOOD_POLICIES[number];

/** Homes: new or resale. */
export const SALE_TRANSACTIONS = ['NEW', 'RESALE'] as const;
export type SaleTransaction = typeof SALE_TRANSACTIONS[number];

/** Homes: ownership type on a sale ad. */
export const SALE_OWNERSHIPS = ['FREEHOLD', 'LEASEHOLD', 'COOPERATIVE_SOCIETY', 'POWER_OF_ATTORNEY'] as const;
export type SaleOwnership = typeof SALE_OWNERSHIPS[number];

/** Homes: furnishing items an ad can list. */
export const FURNISHING_ITEMS = ['BED', 'WARDROBE', 'AC', 'FRIDGE', 'WASHING_MACHINE', 'TV', 'SOFA', 'DINING_TABLE', 'GEYSER', 'MODULAR_KITCHEN', 'CHIMNEY', 'WATER_PURIFIER', 'MICROWAVE', 'CURTAINS', 'LIGHTS_FANS', 'INVERTER', 'WIFI', 'GAS_CONNECTION'] as const;
export type FurnishingItem = typeof FURNISHING_ITEMS[number];

/** Homes: why the system closed an ad (author only). */
export const AUTO_CLOSE_REASONS = ['TENANT_REGISTERED', 'FLAT_SOLD'] as const;
export type AutoCloseReason = typeof AUTO_CLOSE_REASONS[number];

/** Homes: society amenities on the listing profile. */
export const STANDARD_AMENITIES = ['LIFT', 'POWER_BACKUP', 'SECURITY_24X7', 'CCTV', 'GYM', 'POOL', 'CLUBHOUSE', 'PARK', 'CHILDREN_PLAY_AREA', 'GAS_PIPELINE', 'RAINWATER_HARVESTING', 'INTERCOM', 'VISITOR_PARKING', 'FIRE_SAFETY', 'EV_CHARGING', 'SPORTS_COURT', 'LIBRARY', 'TEMPLE', 'JOGGING_TRACK'] as const;
export type StandardAmenity = typeof STANDARD_AMENITIES[number];

/** Homes: kinds of nearby places. */
export const NEARBY_KINDS = ['SCHOOL', 'HOSPITAL', 'METRO', 'RAILWAY', 'BUS_STOP', 'MARKET', 'MALL', 'PARK', 'BANK', 'OFFICE_HUB', 'OTHER'] as const;
export type NearbyKind = typeof NEARBY_KINDS[number];

/** Homes: society rental rule for pets / bachelors. */
export const RENTAL_RULE_CHOICES = ['YES', 'NO', 'WITH_PERMISSION'] as const;
export type RentalRuleChoice = typeof RENTAL_RULE_CHOICES[number];

/** Homes: society rental rule for non-veg. */
export const RENTAL_RULE_YES_NO = ['YES', 'NO'] as const;
export type RentalRuleYesNo = typeof RENTAL_RULE_YES_NO[number];

/** Homes: an enquiry's step in the lister's pipeline (absent = NEW). */
export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'VISIT_BOOKED', 'VISITED', 'NEGOTIATING', 'AGREEMENT', 'CLOSED', 'LOST'] as const;
export type LeadStatus = typeof LEAD_STATUSES[number];

/** Homes: why an enquiry did not work out. */
export const LEAD_LOST_REASONS = ['NOT_INTERESTED', 'PRICE', 'RENTED_ELSEWHERE', 'NO_RESPONSE', 'BROKER', 'OTHER'] as const;
export type LeadLostReason = typeof LEAD_LOST_REASONS[number];

/** Homes: browse sort keys. */
export const LISTING_SORTS = ['relevance', 'newest', 'price_asc', 'price_desc', 'price_per_sqft_asc'] as const;
export type ListingSort = typeof LISTING_SORTS[number];

/** Homes: trust / freshness badges (computed, never stored). */
export const LISTING_BADGES = ['VERIFIED_OWNER', 'SOCIETY_OFFICE', 'VERIFIED_RESIDENT', 'OWNER_DECLARED', 'SOCIETY_APPROVED', 'NEW'] as const;
export type ListingBadge = typeof LISTING_BADGES[number];

/** Homes: how an ad was shared. */
export const SHARE_CHANNELS = ['NATIVE', 'COPY', 'WHATSAPP'] as const;
export type ShareChannel = typeof SHARE_CHANNELS[number];

/** Homes: a property visit's status. */
export const VISIT_STATUSES = ['REQUESTED', 'CONFIRMED', 'CANCELLED', 'DECLINED', 'VISITED', 'NO_SHOW', 'AWAITING_OUTCOME'] as const;
export type VisitStatus = typeof VISIT_STATUSES[number];

/** Homes: who asked for the visit. */
export const VISIT_REQUESTERS = ['VISITOR', 'LISTER'] as const;
export type VisitRequester = typeof VISIT_REQUESTERS[number];

/** Homes: the lister's answer after a visit. */
export const VISIT_OUTCOMES = ['VISITED', 'NO_SHOW'] as const;
export type VisitOutcome = typeof VISIT_OUTCOMES[number];

/** Homes: the gate side of a visit (pass / home visit). */
export const VISIT_GATE_STATUSES = ['NONE', 'ACTIVE', 'NOT_AVAILABLE', 'FAILED', 'USED', 'REVOKED', 'HOME_VISIT'] as const;
export type VisitGateStatus = typeof VISIT_GATE_STATUSES[number];

/** Homes: visits list side (URL param). */
export const VISIT_SIDES = ['lister', 'visitor'] as const;
export type VisitSide = typeof VISIT_SIDES[number];

/** Homes: an ad chat's status. */
export const CONVERSATION_STATUSES = ['OPEN', 'CLOSED', 'BLOCKED'] as const;
export type ConversationStatus = typeof CONVERSATION_STATUSES[number];

/** Homes: who wrote a chat line. */
export const CHAT_SIDES = ['ENQUIRER', 'LISTER', 'SYSTEM'] as const;
export type ChatSide = typeof CHAT_SIDES[number];

/** Homes: a chat line's kind. */
export const CHAT_MESSAGE_KINDS = ['TEXT', 'SYSTEM'] as const;
export type ChatMessageKind = typeof CHAT_MESSAGE_KINDS[number];

/** Homes: why a chat was reported. */
export const CHAT_REPORT_REASONS = ['SPAM', 'BROKER', 'SCAM', 'ABUSE', 'OTHER'] as const;
export type ChatReportReason = typeof CHAT_REPORT_REASONS[number];

/** Homes: owner-console chat report state. */
export const CHAT_REPORT_STATUSES = ['OPEN', 'DISMISSED', 'ACTIONED'] as const;
export type ChatReportStatus = typeof CHAT_REPORT_STATUSES[number];

/** Homes: what a moderator did with a chat report. */
export const CHAT_REPORT_ACTIONS = ['DISMISS', 'BLOCK_CHAT', 'TAKE_DOWN_AD'] as const;
export type ChatReportAction = typeof CHAT_REPORT_ACTIONS[number];

/** Homes: chat list filter (URL param). */
export const CHAT_BOXES = ['all', 'unread'] as const;
export type ChatBox = typeof CHAT_BOXES[number];

/** Homes: verification method on a tenant-suggested ad. */
export const TENANT_AD_METHODS = ['TENANT_POSTED', 'OWNER_APPROVED_TENANT'] as const;
export type TenantAdMethod = typeof TENANT_AD_METHODS[number];

/** Homes: society NOC kind. */
export const NOC_KINDS = ['RENT', 'SALE_TRANSFER'] as const;
export type NocKind = typeof NOC_KINDS[number];

/** Homes: society NOC status. */
export const NOC_STATUSES = ['REQUESTED', 'APPROVED', 'REJECTED', 'REVOKED', 'EXPIRED', 'WITHDRAWN'] as const;
export type NocStatus = typeof NOC_STATUSES[number];

/** Homes: rent agreement status. */
export const AGREEMENT_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'MOVED_IN', 'CANCELLED'] as const;
export type AgreementStatus = typeof AGREEMENT_STATUSES[number];

/** Homes: who pays maintenance under the agreement. */
export const MAINTENANCE_BORNE_BY = ['OWNER', 'TENANT'] as const;
export type MaintenanceBorneBy = typeof MAINTENANCE_BORNE_BY[number];

/** Homes: agreements list side (URL param). */
export const AGREEMENT_SIDES = ['owner', 'tenant'] as const;
export type AgreementSide = typeof AGREEMENT_SIDES[number];

/** Homes: tenant police verification status. */
export const POLICE_STATUSES = ['NOT_STARTED', 'SUBMITTED', 'VERIFIED', 'REJECTED'] as const;
export type PoliceStatus = typeof POLICE_STATUSES[number];

/** Homes: documents an owner uploads next to an agreement. */
export const AGREEMENT_DOC_KINDS = ['STAMPED_AGREEMENT', 'REGISTRATION', 'KYC', 'POLICE_VERIFICATION'] as const;
export type AgreementDocKind = typeof AGREEMENT_DOC_KINDS[number];

/** Homes: Indian states / UTs (ISO 3166-2:IN codes). */
export const IN_STATES = ['AN', 'AP', 'AR', 'AS', 'BR', 'CH', 'CT', 'DH', 'DL', 'GA', 'GJ', 'HR', 'HP', 'JK', 'JH', 'KA', 'KL', 'LA', 'LD', 'MP', 'MH', 'MN', 'ML', 'MZ', 'NL', 'OR', 'PY', 'PB', 'RJ', 'SK', 'TN', 'TG', 'TR', 'UP', 'UT', 'WB'] as const;
export type InState = typeof IN_STATES[number];

/** Homes: documents on a sale ad's checklist (public reads get only `sale.docTicks`). */
export const SALE_DOC_KINDS = ['SALE_DEED', 'SHARE_CERTIFICATE', 'TRANSFER_NOC', 'OC_CERTIFICATE', 'PROPERTY_TAX_RECEIPT', 'ELECTRICITY_BILL', 'ENCUMBRANCE_CERTIFICATE', 'APPROVED_PLAN', 'POSSESSION_LETTER', 'NO_DUES'] as const;
export type SaleDocKind = typeof SALE_DOC_KINDS[number];

/** Homes: where the owner says a sale document stands. */
export const SALE_DOC_STATES = ['AVAILABLE', 'IN_PROGRESS', 'NOT_AVAILABLE'] as const;
export type SaleDocState = typeof SALE_DOC_STATES[number];

/** Homes: what a price band measures (paise: monthly rent / sale price per sq ft). */
export const PRICE_METRICS = ['RENT_MONTHLY', 'SALE_PER_SQFT'] as const;
export type PriceMetric = typeof PRICE_METRICS[number];

/** Homes: which place a price band is for (locality, its city, or none). */
export const PRICE_GUIDE_BASES = ['LOCALITY', 'CITY', 'NONE'] as const;
export type PriceGuideBasis = typeof PRICE_GUIDE_BASES[number];

/** Homes: the sample size a price band shows. */
export const PRICE_SAMPLE_BUCKETS = ['5+', '10+', '25+'] as const;
export type PriceSampleBucket = typeof PRICE_SAMPLE_BUCKETS[number];

/** Homes: price-check warning (absent = in range). */
export const PRICE_WARNINGS = ['HIGH', 'LOW'] as const;
export type PriceWarning = typeof PRICE_WARNINGS[number];

/**
 * Homes: RERA per state — `reraPattern` is a RegExp source run on the trimmed,
 * upper-case number without spaces; `reraUrl` is the state RERA website.
 * NOT CONFIRMED by the Owner yet (`RERA_PATTERNS_CONFIRMED`); a pattern miss is
 * a warning (LISTING_RERA_FORMAT), never a refusal.
 */
export const RERA_STATES: Readonly<Record<InState, { readonly reraPattern: string; readonly reraUrl: string }>> = {
  AN: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  AP: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.ap.gov.in/' },
  AR: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  AS: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.assam.gov.in/' },
  BR: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.bihar.gov.in/' },
  CH: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  CT: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.cgstate.gov.in/' },
  DH: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  DL: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.delhi.gov.in/' },
  GA: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.goa.gov.in/' },
  GJ: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://gujrera.gujarat.gov.in/' },
  HR: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://haryanarera.gov.in/' },
  HP: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://hprera.nic.in/' },
  JK: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  JH: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://jharera.jharkhand.gov.in/' },
  KA: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.karnataka.gov.in/' },
  KL: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.kerala.gov.in/' },
  LA: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  LD: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  MP: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://www.rera.mp.gov.in/' },
  MH: { reraPattern: '^P\\d{11}$', reraUrl: 'https://maharera.maharashtra.gov.in/' },
  MN: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  ML: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  MZ: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  NL: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  OR: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.odisha.gov.in/' },
  PY: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  PB: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.punjab.gov.in/' },
  RJ: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.rajasthan.gov.in/' },
  SK: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  TN: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://www.rera.tn.gov.in/' },
  TG: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rerait.telangana.gov.in/' },
  TR: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.mohua.gov.in/' },
  UP: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://www.up-rera.in/' },
  UT: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://ukrera.uk.gov.in/' },
  WB: { reraPattern: '^[A-Z0-9][A-Z0-9/\\-]{5,59}$', reraUrl: 'https://rera.wb.gov.in/' },
};
export const RERA_PATTERNS_CONFIRMED = false;

/** Homes: the owner-analytics windows (`?days=`). */
export const STATS_DAYS = [7, 30, 90] as const;
export type StatsDays = typeof STATS_DAYS[number];
