import { apiClient, ApiEnvelope, unwrap } from './axios';
import {
  PartnerKind,
  PartnerServiceMode,
  PartnerStatus,
  PartnerVerificationStatus,
  PartnerDocType,
  PartnerModule,
  PartnerAccessModule,
  BookingFieldType,
} from '../types/api-contract.generated';

/**
 * Every `/partners/me/...` call the foundation needs, plus the two the signup
 * wizard makes before a session exists.
 *
 * Nothing in this file hand-writes a union that `api-contract.generated.ts`
 * already carries. `PartnerModule`, `PartnerServiceMode`, `PartnerKind` and the
 * rest are imported from it — mobile-society re-declared them, the two sides
 * drifted, and the whole thing had to be undone.
 */

// --------------------------------------------------------------- entitlements

export type PartnerPermissionLevel = 'NONE' | 'READ' | 'FULL';

/**
 * `plan.limits` is a capability key → ceiling map. `-1` is unlimited, `0` is
 * "your plan does not sell this", and an ABSENT key is treated as not sold —
 * which is deliberately stricter than the server's own `planAllows`, for the
 * reason spelled out in `hooks/usePartnerEntitlements.ts`.
 */
export interface PartnerPlan {
  name: string;
  isFreeTier: boolean;
  status: string;
  limits: Record<string, number>;
}

/** One capability's live usage against its ceiling. */
export interface PartnerUsageRow {
  key: string;
  noun: string;
  kind: 'STOCK' | 'FLOW' | 'MODULE_COUNT';
  /** `null` when unlimited. */
  limit: number | null;
  included: boolean;
  used: number;
  /** Set when the feature's model lands in a later phase — draw "coming soon", not a 0-of-30 meter. */
  wiredIn?: string;
}

/** Why the app may be showing very little: suspended, or still mid-wizard. */
export interface PartnerBusinessSummary {
  status: PartnerStatus | string;
  verificationStatus: PartnerVerificationStatus | string;
  onboardingStep: number;
  kind: PartnerKind | string;
}

export interface PartnerEntitlementsPayload {
  plan: PartnerPlan;
  /** Passed BOTH gate 1 (bought) and gate 2 (switched on). */
  modules: PartnerModule[];
  permissions: Partial<Record<PartnerAccessModule, PartnerPermissionLevel>>;
  isAdmin: boolean;
  /** On the staff list, but nobody has said yet what they may do. */
  awaitingRole: boolean;
  offeredPermissions: PartnerAccessModule[];
  business?: PartnerBusinessSummary;
  /** Only sent to people who can act on it — admins and holders of SETTINGS. */
  usage?: PartnerUsageRow[];
}

// ----------------------------------------------------------------- onboarding

/** One unfinished thing, named, with the step it belongs to. Rendered verbatim. */
export interface OnboardingGap {
  step: number;
  field: string;
  message: string;
}

export interface OnboardingStatus {
  step: number;
  missing: OnboardingGap[];
  canSubmit: boolean;
  status: PartnerStatus | string;
  verificationStatus?: PartnerVerificationStatus | string;
  submittedAt?: string;
}

export interface Step1Payload {
  name: string;
}

export interface Step2Payload {
  address: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  pincode: string;
}

export interface Step3Payload {
  kind: PartnerKind;
  categoryIds: string[];
}

export interface Step4Payload {
  serviceModes: PartnerServiceMode[];
  /**
   * Required exactly when `serviceModes` includes AT_CUSTOMER, and REFUSED when
   * it does not — the server checks both halves. Sending a leftover radius with
   * "customers come to me" is a 400, not a silently ignored field.
   */
  serviceRadiusKm?: number;
}

export interface OpeningWindow {
  /** 'HH:mm', 24-hour, zero-padded. `from` must sort BEFORE `to` as a string. */
  from: string;
  to: string;
}

export interface DayTiming {
  /** 0 = Sunday … 6 = Saturday, matching `Date.getDay()`. */
  day: number;
  isOpen: boolean;
  windows: OpeningWindow[];
}

export interface Step5Payload {
  kyc?: {
    /** An empty string means "I cleared this box"; omitting the key means "leave it alone". */
    gstNumber?: string;
    /** The FULL PAN goes up; the server stores only a mask and never returns it whole. */
    pan?: string;
    licenseNumber?: string;
  };
  timings?: {
    weekly: DayTiming[];
    holidays?: string[];
  };
}

export type OnboardingStepPayload =
  | { step: 1; body: Step1Payload }
  | { step: 2; body: Step2Payload }
  | { step: 3; body: Step3Payload }
  | { step: 4; body: Step4Payload }
  | { step: 5; body: Step5Payload };

export interface SaveStepResponse {
  message: string;
  onboarding: OnboardingStatus;
}

export interface PartnerKycDoc {
  _id: string;
  type: PartnerDocType;
  url: string;
  fileName?: string;
  uploadedAt: string;
}

/** The public taxonomy, readable without a session — step 3 runs before one exists. */
export interface PartnerCategory {
  _id: string;
  name: string;
  nameHi?: string;
  icon?: string;
  kindAllowed: PartnerKind;
  defaultServiceModes: PartnerServiceMode[];
  bookingFields?: Array<{ key: string; label: string; type: BookingFieldType; required?: boolean }>;
  sortOrder?: number;
}

export interface RegisterPartnerPayload {
  name: string;
  contactNumber: string;
  address: string;
  adminEmail: string;
  password: string;
  /** Both come from `POST /auth/otp/verify` with purpose PARTNER_REGISTRATION. */
  emailVerificationToken: string;
  phoneVerificationToken: string;
}

export interface RegisterPartnerResponse {
  message: string;
  onboarding: OnboardingStatus;
}

// -------------------------------------------------------------------- the API

/**
 * The partner document, as `GET /partners/me/partner` returns it.
 *
 * Only the fields the wizard prefills from are typed. The endpoint answers with
 * the whole document plus the subscription and plan status; a screen that needs
 * more of it should widen this interface rather than reach for `any`.
 */
export interface MyPartner {
  _id: string;
  name: string;
  address?: string;
  contactNumber?: string;
  adminEmail?: string;
  city?: string;
  state?: string;
  pincode?: string;
  location?: { type: 'Point'; coordinates: number[] };
  kind: PartnerKind;
  categoryIds?: string[];
  serviceModes?: PartnerServiceMode[];
  serviceRadiusKm?: number;
  status: PartnerStatus;
  onboardingStep?: number;
  verification?: { status: PartnerVerificationStatus; docs: PartnerKycDoc[]; note?: string };
  kyc?: { gstNumber?: string; panMasked?: string; licenseNumber?: string };
  timings?: { weekly: DayTiming[]; holidays?: string[] };
}

export const partnerApi = {
  /**
   * The business profile, used to PREFILL the wizard.
   *
   * Prefilling is not a nicety here: a REJECTED partner is sent back to change
   * one field, and a wizard that made them retype five screens to fix a pincode
   * is a wizard they abandon. Note the payload nests the document under
   * `partner` and is NOT wrapped in the `{ success, data }` envelope.
   */
  me: () =>
    apiClient
      .get<{ partner: MyPartner; planStatus?: { planName: string; isFreeTier: boolean; status: string } }>(
        '/partners/me/partner',
      )
      .then((r) => r.data),

  /**
   * The one call the whole app hangs off. Ungated server-side on purpose — it is
   * the request that ASKS what this person may do, so gating it would be
   * circular.
   */
  entitlements: () =>
    apiClient
      .get<ApiEnvelope<PartnerEntitlementsPayload>>('/partners/me/entitlements')
      .then((r) => unwrap(r.data)),

  /** Meters for "42 of 50 products", shown BEFORE a create button — never a 402 after the form. */
  usage: () =>
    apiClient
      .get<ApiEnvelope<{ planName: string; isFreeTier: boolean; usage: PartnerUsageRow[] }>>('/partners/me/usage')
      .then((r) => unwrap(r.data)),

  /** Gate 2's editor: what the plan sells, what the partner chose, what resolves. */
  modules: () =>
    apiClient
      .get<ApiEnvelope<{
        chosen: PartnerModule[];
        effective: PartnerModule[];
        available: PartnerModule[];
        plan: { name: string; isFreeTier: boolean };
      }>>('/partners/me/modules')
      .then((r) => unwrap(r.data)),

  saveModules: (modules: PartnerModule[]) =>
    apiClient.put<ApiEnvelope<unknown>>('/partners/me/modules', { modules }).then((r) => r.data),

  // --- the signup wizard ---

  /** Unauthenticated. Creates the business in DRAFT at step 1 and the login identities. */
  register: (payload: RegisterPartnerPayload) =>
    apiClient.post<RegisterPartnerResponse>('/partners/register-public', payload).then((r) => r.data),

  /** Unauthenticated — step 3 has to draw its picker before a tenant exists. */
  categories: () =>
    apiClient
      .get<ApiEnvelope<PartnerCategory[]>>('/partner-categories/public')
      .then((r) => unwrap(r.data)),

  /**
   * Where the partner got to, what is left, and whether they may submit.
   *
   * This is what makes the wizard resumable, and it is read on mount rather than
   * trusted from local state: the step is stored on the partner document, so a
   * partner who filled step 3 on a phone and opens the app on a tablet lands on
   * step 4 there too.
   */
  onboardingStatus: () =>
    apiClient.get<OnboardingStatus>('/partners/me/onboarding-status').then((r) => r.data),

  /**
   * Save one step. The whole step or none of it — these are complete payloads,
   * not patches, so a half-typed step 2 cannot leave the address updated and the
   * map pin stale.
   */
  saveStep: (payload: OnboardingStepPayload) =>
    apiClient
      .put<SaveStepResponse>(`/partners/me/onboarding/${payload.step}`, payload.body)
      .then((r) => r.data),

  /**
   * Attach an already-uploaded document. Two calls, not one multipart post: the
   * file goes to `POST /upload/document` first, so a partner who uploads three
   * files and then loses their connection still has three files uploaded.
   */
  addKycDoc: (doc: { type: PartnerDocType; url: string; fileName?: string }) =>
    apiClient
      .post<{ message: string; doc: PartnerKycDoc; onboarding: OnboardingStatus }>('/partners/me/kyc-docs', doc)
      .then((r) => r.data),

  removeKycDoc: (docId: string) =>
    apiClient
      .delete<{ message: string; onboarding: OnboardingStatus }>(`/partners/me/kyc-docs/${docId}`)
      .then((r) => r.data),

  /** DRAFT/REJECTED → PENDING. A 400 carries `missing[]`; render those sentences verbatim. */
  submitForReview: () =>
    apiClient
      .post<{ message: string; onboarding: OnboardingStatus }>('/partners/me/submit-for-review', {})
      .then((r) => r.data),
};

/**
 * Upload a KYC file and return the URL `addKycDoc` wants.
 *
 * `FormData` with a `{ uri, name, type }` part is React Native's own file
 * shape — `fetch`/XHR turn it into a real multipart upload. The Content-Type
 * header is deliberately NOT set: axios has to fill in the multipart boundary,
 * and setting it by hand produces a body the server cannot parse. The client's
 * default JSON content type is overridden to `undefined` for the same reason.
 */
export async function uploadKycFile(file: {
  uri: string;
  name: string;
  mimeType: string;
}): Promise<{ url: string; key: string }> {
  const form = new FormData();
  // RN's FormData accepts this object; the DOM typing does not describe it, so
  // it is declared as the Blob-compatible shape the platform actually consumes.
  const part = { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob;
  form.append('file', part);

  const { data } = await apiClient.post<{ url: string; key: string }>('/upload/document', form, {
    headers: { 'Content-Type': undefined },
    timeout: 60_000, // a photographed licence over a shop's 3G is not a 30-second request
  });
  return data;
}
