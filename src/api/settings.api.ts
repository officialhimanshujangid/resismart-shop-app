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
  /** The platform's WhatsApp Business number is wired at all. */
  configured: boolean;
  optedIn: boolean;
  phone?: string;
  optedInAt?: string;
  optedOutAt?: string;
  kinds: string[];
  /** What buying this would turn on — sent even when `available` is false. */
  events: PartnerWhatsAppEvent[];
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
        .then((r) => unwrap(r.data)),
    /** DPDP consent evidence, recorded against the signed-in person's own account phone. */
    setOptIn: (optedIn: boolean) =>
      apiClient
        .put<ApiEnvelope<PartnerWhatsAppSettings>>('/partners/me/notifications/whatsapp', { optedIn })
        .then((r) => unwrap(r.data)),
  },
};
