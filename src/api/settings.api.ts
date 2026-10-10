import { apiClient, ApiEnvelope, unwrap } from './axios';

/**
 * `/partners/me/settings/{invoice,business}` and
 * `/partners/me/notifications/whatsapp` — how a document looks, what it says
 * about the business, and the WhatsApp opt-in. Mirrors
 * `partner-billing-settings.controller.ts` and `notification.controller.ts`'s
 * `partnerWhatsAppSettings`/`savePartnerWhatsAppOptIn`.
 */

export const INVOICE_THEMES = ['CLASSIC', 'MODERN', 'MINIMAL', 'GST_DETAILED', 'THERMAL_58', 'THERMAL_80'] as const;
export type InvoiceTheme = typeof INVOICE_THEMES[number];

export const GST_REGISTRATION_TYPES = ['REGULAR', 'COMPOSITION', 'UNREGISTERED', 'SEZ', 'EXPORT'] as const;
export type GstRegistrationType = typeof GST_REGISTRATION_TYPES[number];

export interface InvoiceBankDetails {
  name?: string;
  acNo?: string;
  ifsc?: string;
  upiId?: string;
}

export interface InvoiceThermal {
  width: 58 | 80;
  copies: number;
}

export interface PartnerInvoiceSettings {
  _id: string;
  partnerId: string;
  theme: InvoiceTheme;
  accentColor: string;
  logoUrl?: string;
  signatureUrl?: string;
  /** P8A: the stored logo / signature is an old outside link that no longer prints — ask for a new upload. */
  logoNeedsUpload?: boolean;
  signatureNeedsUpload?: boolean;
  terms?: string;
  notes?: string;
  bankDetails: InvoiceBankDetails;
  /** Series code → prefix, e.g. `{ INV: 'INV' }`. A Map on the server, a plain object over JSON. */
  prefixBySeries: Record<string, string>;
  template: string;
  padding: number;
  showHsn: boolean;
  showDiscount: boolean;
  showTaxBreakup: boolean;
  showUpiQr: boolean;
  showSignature: boolean;
  thermal: InvoiceThermal;
  /**
   * Theme M order-billing automation, opt-OUT: order DELIVERED auto-raises +
   * issues a TAX_INVOICE (`autoInvoiceOnDelivery`), and a COD delivery
   * auto-records the payment/receipt (`autoReceiptOnCodDelivery`).
   * `partner-invoice-settings.model.ts` ships both with NO schema default —
   * `order-billing.service.ts#loadBillingSettings` reads absent as ON
   * (`settings?.autoInvoiceOnDelivery !== false`), so `undefined` here means
   * "on" too — mirror that with `!== false`, never `?? false`.
   *
   * This note used to carry a KNOWN GAP warning that a `PUT` carrying either
   * field was silently stripped by zod, so the toggles "flip locally and revert".
   * That gap is CLOSED and the warning is removed rather than left standing:
   * `updateInvoiceSettingsSchema` now declares both
   * (`backend/src/validators/partner-billing.validator.ts`), and
   * `updateInvoiceSettings` applies both with the matching
   * `if (body.x !== undefined)` lines
   * (`backend/src/controllers/partner-billing-settings.controller.ts`). The
   * reasoning it recorded was right at the time and is worth keeping in view —
   * a field absent from that schema IS dropped before the controller sees it,
   * with no error, which is why anything added to `UpdateInvoiceSettingsPayload`
   * below has to be checked against it — but the specific claim about these two
   * fields is no longer true, and a comment telling the next person a working
   * feature is broken costs more than no comment at all.
   */
  autoInvoiceOnDelivery?: boolean;
  autoReceiptOnCodDelivery?: boolean;
  /** P1 §1.5: print an all-exempt invoice as a bill of supply. Absent = false. */
  billOfSupplyForExempt?: boolean;
  /** P1 §1.5: how far (0–20 %) a GRN may exceed the pending PO quantity. Absent = 0. */
  overReceiptPercent?: number;
}

export type UpdateInvoiceSettingsPayload = Partial<{
  theme: InvoiceTheme;
  accentColor: string;
  logoUrl: string | null;
  signatureUrl: string | null;
  terms: string | null;
  notes: string | null;
  bankDetails: InvoiceBankDetails;
  prefixBySeries: Record<string, string>;
  template: string;
  padding: number;
  showHsn: boolean;
  showDiscount: boolean;
  showTaxBreakup: boolean;
  showUpiQr: boolean;
  showSignature: boolean;
  thermal: Partial<InvoiceThermal>;
  /** Both accepted and applied server-side — see the note on `PartnerInvoiceSettings`. */
  autoInvoiceOnDelivery: boolean;
  autoReceiptOnCodDelivery: boolean;
  billOfSupplyForExempt: boolean;
  overReceiptPercent: number;
}>;

export interface BusinessExtraField {
  label: string;
  value: string;
}

export interface PartnerBusinessSettings {
  _id: string;
  partnerId: string;
  businessName: string;
  phone?: string;
  email?: string;
  billingAddress?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  isGstRegistered: boolean;
  gstin?: string;
  registrationType: GstRegistrationType;
  businessType: string[];
  industryType?: string;
  extraFields: BusinessExtraField[];
  /** P1 §1.5 — composition partners only; one of 0.5, 1, 2, 5, 6. */
  compositionRatePercent?: number;
}

export type UpdateBusinessSettingsPayload = Partial<{
  businessName: string;
  phone: string;
  email: string;
  billingAddress: string;
  city: string;
  state: string;
  pincode: string;
  isGstRegistered: boolean;
  gstin: string | null;
  registrationType: GstRegistrationType;
  businessType: string[];
  industryType: string;
  extraFields: BusinessExtraField[];
  /** null clears it. */
  compositionRatePercent: number | null;
}>;

export interface PartnerWhatsAppEvent {
  template: string;
  label: string;
  audience: string;
  category: string;
}

export interface PartnerWhatsAppSettings {
  /** Plan sells `whatsapp_notifications`. False also reads as "could not check" — fails closed. */
  available: boolean;
  /**
   * Why `available` is false, when it is not the plan: `PARTNER_WHATSAPP_OFF` =
   * ResiSmart has switched partner WhatsApp off platform-wide.
   */
  availableReason?: 'PARTNER_WHATSAPP_OFF' | (string & {});
  /** The platform's WhatsApp Business number is wired at all. */
  configured: boolean;
  optedIn: boolean;
  phone?: string;
  optedInAt?: string;
  optedOutAt?: string;
  /** P1+ review (R+06): when this admin's number replied STOP on WhatsApp (ISO). Turning `optedIn` on lifts it. */
  stoppedAt?: string;
  kinds: string[];
  /**
   * The messages to the BUSINESS itself (audience 'You') — governed by the
   * signed-in admin's own consent, `optedIn`. Sent even when `available` is false.
   */
  events: PartnerWhatsAppEvent[];
  /**
   * Q4 — the BUSINESS switch: may this business's customers be sent WhatsApp at
   * all (booking confirmed/reminder/completion code/cancelled, order updates,
   * invoices, payment receipts, khata reminders). Absent on the server = ON.
   * Off → app notifications still go. Needs no phone.
   */
  customerWhatsApp: boolean;
  /** Q4 — the messages `customerWhatsApp` governs (audience 'Customers'). */
  customerEvents: PartnerWhatsAppEvent[];
}

/** PUT body — at least one of the two. */
export type SavePartnerWhatsAppPayload =
  | { customerWhatsApp: boolean; optedIn?: boolean }
  | { optedIn: boolean; customerWhatsApp?: boolean };

/** Older server without Q4 fields: the business switch reads ON (server default). */
function normaliseWhatsApp(w: PartnerWhatsAppSettings): PartnerWhatsAppSettings {
  return {
    ...w,
    events: Array.isArray(w?.events) ? w.events : [],
    customerWhatsApp: w?.customerWhatsApp !== false,
    customerEvents: Array.isArray(w?.customerEvents) ? w.customerEvents : [],
  };
}

/** One PUT for either switch; the reply is the whole block. */
function saveWhatsApp(payload: SavePartnerWhatsAppPayload): Promise<PartnerWhatsAppSettings> {
  return apiClient
    .put<ApiEnvelope<PartnerWhatsAppSettings>>('/partners/me/notifications/whatsapp', payload)
    .then((r) => normaliseWhatsApp(unwrap(r.data)));
}

export const settingsApi = {
  invoice: {
    get: () =>
      apiClient
        .get<ApiEnvelope<PartnerInvoiceSettings>>('/partners/me/settings/invoice')
        .then((r) => unwrap(r.data)),
    update: (payload: UpdateInvoiceSettingsPayload) =>
      apiClient
        .put<ApiEnvelope<PartnerInvoiceSettings>>('/partners/me/settings/invoice', payload)
        .then((r) => unwrap(r.data)),
  },

  business: {
    get: () =>
      apiClient
        .get<ApiEnvelope<PartnerBusinessSettings>>('/partners/me/settings/business')
        .then((r) => unwrap(r.data)),
    update: (payload: UpdateBusinessSettingsPayload) =>
      apiClient
        .put<ApiEnvelope<PartnerBusinessSettings>>('/partners/me/settings/business', payload)
        .then((r) => unwrap(r.data)),
  },

  whatsapp: {
    get: () =>
      apiClient
        .get<ApiEnvelope<PartnerWhatsAppSettings>>('/partners/me/notifications/whatsapp')
        .then((r) => normaliseWhatsApp(unwrap(r.data))),
    save: saveWhatsApp,
    /**
     * The admin's OWN WhatsApp alerts — DPDP consent evidence, recorded against
     * the signed-in person's account phone. 409 `PARTNER_WHATSAPP_NO_PHONE` when
     * that account has no phone. Does NOT control messages to customers.
     */
    setOptIn: (optedIn: boolean) => saveWhatsApp({ optedIn }),
    /** Q4 — the business switch for WhatsApp to its customers. Needs no phone. */
    setCustomerWhatsApp: (customerWhatsApp: boolean) => saveWhatsApp({ customerWhatsApp }),
  },
};
