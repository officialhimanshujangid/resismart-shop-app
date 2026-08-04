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
export const PARTNER_STATUSES = ['DRAFT', 'PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'] as const;
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
export const PARTNER_ACCESS_MODULES = ['BOOKINGS_VIEW', 'BOOKINGS_MANAGE', 'CATALOG_VIEW', 'CATALOG_MANAGE', 'ORDERS_VIEW', 'ORDERS_MANAGE', 'INVOICING_VIEW', 'INVOICING_MANAGE', 'CUSTOMERS', 'REPORTS', 'PROMOTION', 'STAFF', 'SETTINGS'] as const;
export type PartnerAccessModule = typeof PARTNER_ACCESS_MODULES[number];

/** Input types an owner can put on a category booking form. */
export const BOOKING_FIELD_TYPES = ['TEXT', 'TEXTAREA', 'SELECT', 'NUMBER', 'DATE', 'BOOLEAN'] as const;
export type BookingFieldType = typeof BOOKING_FIELD_TYPES[number];

/** How a service is priced — fixed, starting-from, or quote-on-request. */
export const SERVICE_PRICE_TYPES = ['FIXED', 'FROM', 'QUOTE'] as const;
export type ServicePriceType = typeof SERVICE_PRICE_TYPES[number];

/** Units a catalog product can be sold in. */
export const PRODUCT_UNITS = ['PCS', 'BOX', 'KG', 'LTR', 'PKT', 'DOZ'] as const;
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
export const PARTNER_DOCUMENT_TYPES = ['TAX_INVOICE', 'QUOTATION', 'PROFORMA', 'DELIVERY_CHALLAN', 'CREDIT_NOTE', 'SALES_RETURN', 'PURCHASE_INVOICE', 'PURCHASE_ORDER', 'DEBIT_NOTE'] as const;
export type PartnerDocumentType = typeof PARTNER_DOCUMENT_TYPES[number];

/** How a partner payment was made or received. */
export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'BANK', 'ONLINE'] as const;
export type PaymentMode = typeof PAYMENT_MODES[number];
