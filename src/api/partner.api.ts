import type { Href } from 'expo-router';

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
  /**
   * This is a TRIAL, and when it runs out.
   *
   * Both are sent by `partner-entitlement.service.ts` (its own comment: without
   * them a trial is indistinguishable from a plan that was bought). They were
   * missing from this interface, so `normalise()` in `usePartnerEntitlements`
   * — which rebuilds `plan` field by field rather than spreading it — dropped
   * them on the floor and no screen could have shown a deadline even if one had
   * wanted to.
   *
   * Optional because a server that predates them sends neither, and because
   * `trialEndsAt` is present only while `isTrial`. An ISO string over the wire,
   * whatever the `Date` on the server says.
   */
  isTrial?: boolean;
  trialEndsAt?: string;
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

/** One thing standing between this business and being found by a resident. */
export interface PartnerVisibilityBlocker {
  code: 'NOT_ACTIVE' | 'NOT_VERIFIED' | 'NO_LOCATION' | 'NO_SERVICE_MODES' | 'NO_CATEGORY' | 'NO_AVAILABILITY';
  /** Already in the proprietor's language — render it, do not re-word it. */
  message: string;
  /**
   * The route that fixes it, IN THE WEB PANEL — `/dashboard/partner-settings`
   * and friends. Deliberately unused by this app: pushing a web pathname at
   * expo-router is a navigation to a screen that does not exist. `blockerFix`
   * below is the mobile answer to the same question, keyed off `code`.
   */
  href?: string;
  /**
   * Does this one actually keep residents from finding the business, or is it
   * merely holding it back?
   *
   * The server decides. This app used to answer the same question locally by
   * listing the codes it thought were harmless, which is a second copy of a rule
   * that lives on the server and drifts the moment a code is added — `NO_AVAILABILITY`
   * is that moment. Optional because an older deployment does not send it; treat
   * a missing value as blocking, since over-warning is the safer failure here.
   */
  blocksDiscovery?: boolean;
}

/**
 * Where a blocker is actually fixed in THIS app.
 *
 * The server sends an `href` with most blockers and every one of them is a web
 * route, so the app ignored the field and rendered the sentences with nothing to
 * tap — a screen that names five problems and offers no way to any of them. The
 * `code` is the stable half of the payload (its own comment says so), so the
 * mapping is keyed off that.
 *
 * Two of the five have no destination, and that is the honest answer rather than
 * a missing case:
 *
 *   NOT_ACTIVE   only ResiSmart can lift this — a suspension, or a profile that
 *                is still with a reviewer. A partner who is REJECTED is held in
 *                the wizard by `useOnboardingGate` and never reads this list.
 *   NO_CATEGORY  there is no category editor in the app outside the signup
 *                wizard, and the wizard refuses an ACTIVE partner
 *                (`EDITABLE_ONBOARDING_STATUSES`), so it is reported and not
 *                routed.
 *
 * It used to say NO_CATEGORY was "the one blocker that does not make anybody
 * invisible". That is no longer true and never was a fact for this file to
 * assert: there are three non-gating codes today (NO_CATEGORY, NO_AVAILABILITY
 * and — since the gate split — NOT_VERIFIED), and which ones they are is the
 * server's answer, carried on `blocksDiscovery`. See `splitBlockers` below.
 */
export interface BlockerFix {
  href: Href;
  /**
   * A CATALOGUE KEY, imperative and short enough for a button — not the words.
   *
   * This is a plain function outside React, so it cannot hold a `t`. Returning
   * the key keeps the mapping (code → screen → wording) in one place and leaves
   * the two callers, both components, to render it.
   */
  labelKey: string;
}

export function blockerFix(code: PartnerVisibilityBlocker['code']): BlockerFix | undefined {
  switch (code) {
    case 'NOT_VERIFIED':
      return { href: '/settings/verification', labelKey: 'blockerFix.NOT_VERIFIED' };
    case 'NO_LOCATION':
      return { href: '/settings/address', labelKey: 'blockerFix.NO_LOCATION' };
    case 'NO_SERVICE_MODES':
      return { href: '/settings/where-you-work', labelKey: 'blockerFix.NO_SERVICE_MODES' };
    case 'NO_AVAILABILITY':
      // The wizard's opening hours are a marketing fact; the slot engine reads a
      // separate schedule, and without it every Book tap answers 409. This app
      // has that editor, so unlike the web the partner can fix it where they
      // were told about it.
      return { href: '/availability', labelKey: 'blockerFix.NO_AVAILABILITY' };
    default:
      return undefined;
  }
}

/**
 * Whether residents can find this business, decided by the server.
 *
 * Deliberately NOT re-derived from `business.status` and `verificationStatus`.
 * This app did exactly that and got it wrong the same way the web panel did:
 * that pair says nothing about a partner with no map pin or no service modes,
 * and either one makes them invisible at every distance. `partnerVisibility()`
 * sits next to the discovery gates it describes; this is its answer.
 */
export interface PartnerVisibilityReport {
  discoverable: boolean;
  /**
   * Will ResiSmart take a booking, an order or boost money for this business?
   *
   * A SECOND boolean, not a refinement of the first, and the split is the whole
   * point: since the gate moved, the ordinary state of a partner who has just
   * submitted is discoverable and NOT transactable — residents find them and
   * ring them, and nothing can be booked until a reviewer has looked. One
   * boolean covering both would have to lie about one of them
   * (`partner-browse.service.ts` says exactly that), and this app was reading
   * only `discoverable`, so that sentence never reached the proprietor's phone
   * at all: the Today banner and the Verification card both keyed off
   * `!discoverable` and stayed silent for every partner in it.
   *
   * Read as `=== false` rather than `!transactable`, so a response that predates
   * the field cannot manufacture a warning out of an absent one.
   */
  transactable: boolean;
  blockers: PartnerVisibilityBlocker[];
}

/**
 * The blockers split into the two lists that are two different sentences.
 *
 * Keyed off `blocksDiscovery`, from the server, and kept HERE rather than in
 * each screen because a copy per screen is precisely the thing this field was
 * added to delete — `(tabs)/index.tsx` and `settings/verification.tsx` each
 * carried `b.code !== 'NO_CATEGORY'`, which was wrong about `NO_AVAILABILITY`
 * the day it landed and wrong about `NOT_VERIFIED` the day after. The mobile
 * twin of the same split in `frontend/.../PartnerVisibilityAlert.tsx`.
 *
 * `!== false`, not `=== true`: a server that does not send the field at all is
 * treated as blocking, because over-warning is the safer failure and it is the
 * fallback the field's own note documents.
 */
export function splitBlockers(report: PartnerVisibilityReport | undefined): {
  /** Residents genuinely cannot find the business until these clear. */
  blocking: PartnerVisibilityBlocker[];
  /** Findable, and still losing business. Quieter, and never a reason to hide the dashboard. */
  alsoCosting: PartnerVisibilityBlocker[];
} {
  const all = report?.blockers ?? [];
  return {
    blocking: all.filter((b) => b.blocksDiscovery !== false),
    alsoCosting: all.filter((b) => b.blocksDiscovery === false),
  };
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
  visibility?: PartnerVisibilityReport;
  /**
   * Whether ResiSmart collects identity documents at all — the owner's switch.
   * Optional so a response from a server that predates it is still readable;
   * every reader treats anything but an explicit `false` as "yes".
   */
  kycRequired?: boolean;
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
  /**
   * Whether this installation asks for documents. When false the server has
   * ALSO stopped requiring one, so step 5 must stop asking — a required-looking
   * upload that blocks nothing is worse than no upload at all.
   */
  kycRequired?: boolean;
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
  /**
   * The older, top-level twin of `verification.note` — still written by some
   * rejection paths on the server (`partner.model.ts`). Read as a FALLBACK
   * behind the note, exactly as the web wizard reads it, because a REJECTED
   * partner with neither is being sent back to a form with no idea why.
   */
  rejectionReason?: string;
  verification?: { status: PartnerVerificationStatus; docs: PartnerKycDoc[]; note?: string };
  kyc?: { gstNumber?: string; panMasked?: string; licenseNumber?: string };
  timings?: { weekly: DayTiming[]; holidays?: string[] };
  /**
   * L1 — "I can take an immediate job right now", a live flag separate from
   * the weekly schedule (`partner.model.ts:223`, default `false`). Read here
   * off `GET /partners/me/partner` (there is no dedicated GET for this one
   * field); written with `partnerApi.setAvailableNow` below, which hits the
   * dedicated `PUT /partners/me/availability/available-now` — NOT this
   * endpoint's own `updateMe`, which does not accept it.
   */
  availableNow?: boolean;
  availableNowUpdatedAt?: string;
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
   * Change the business profile after it has gone live.
   *
   * NOT `saveStep`. That endpoint 409s the moment a partner is ACTIVE
   * (`EDITABLE_ONBOARDING_STATUSES` is DRAFT/PENDING/REJECTED), which is right
   * — the wizard is for registering, not for running a business — but it left a
   * live partner with no way to change where they work. `PUT /me/partner` is
   * the one that stays open, and its `pickDetails` already accepts these.
   *
   * `serviceRadiusKm` is required by the server exactly when `serviceModes`
   * includes AT_CUSTOMER, and REFUSED when it does not. Send accordingly.
   *
   * ── Why the address fields are here ───────────────────────────────────────
   *
   * This used to send `serviceModes` and `serviceRadiusKm` and nothing else,
   * which left the map pin with no editor anywhere in the signed-in app: a
   * partner whose GPS never fixed during registration, or whose pin is simply
   * wrong, is invisible to every resident (`$geoNear`) with no screen able to
   * change it. `updateMyPartner` already handles all of these — `name`,
   * `address` and `contactNumber` by hand, `latitude`/`longitude` into the
   * GeoJSON point, and city/state/pincode through `pickDetails` — so nothing on
   * the server had to change.
   *
   * Two shapes worth knowing before calling it:
   *
   *   - LATITUDE AND LONGITUDE MOVE TOGETHER. The controller only writes the
   *     point when both are present, so sending one is sending neither.
   *   - AN EMPTY STRING CLEARS a city, state or pincode; omitting the key leaves
   *     it alone. `name` and `address` have minimum lengths (2 and 5) and are
   *     rejected empty, so they are omitted rather than blanked.
   */
  updateMe: (body: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    latitude?: number;
    longitude?: number;
    serviceModes?: PartnerServiceMode[];
    serviceRadiusKm?: number;
  }) =>
    apiClient.put<{ message: string; partner: MyPartner }>('/partners/me/partner', body).then((r) => r.data),

  /**
   * L1's live "available now" switch. Deliberately its own tiny endpoint,
   * mirroring the web partner availability page
   * (`frontend/.../partner/availability/page.tsx#setLiveAvailability`) rather
   * than folding into `updateMe` above — gated `BOOKINGS_MANAGE` FULL
   * server-side (`partner-service.routes.ts`'s `canManageBookings`), not
   * `SETTINGS`. Returns only the flag, not the whole partner document.
   */
  setAvailableNow: (availableNow: boolean) =>
    apiClient
      .put<ApiEnvelope<{ availableNow: boolean }>>('/partners/me/availability/available-now', { availableNow })
      .then((r) => unwrap(r.data)),

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

/**
 * Upload a PUBLIC image and return the URL to store against the record.
 *
 * `POST /upload`, NOT `POST /upload/document` above, and the difference is the
 * whole point rather than a detail:
 *
 *   - `/upload/document` writes to a PRIVATE prefix. Its URL is not fetchable
 *     without a presigned download, which is right for a KYC licence and
 *     catastrophic for a product photo — residents browse the catalogue from
 *     another app entirely, and every picture would render as a broken image.
 *   - `/upload` writes to `profile-images/`, which is world-readable, and
 *     answers `{ imageUrl }` (not `{ url, key }` — the two endpoints do not
 *     share a response shape).
 *
 * ── Why the returned URL is stored verbatim ───────────────────────────────
 *
 * `createProductSchema` validates `images[]` with `uploadedUrl()`, which parses
 * the URL and checks its HOST against our own bucket — a hand-built path, a
 * CDN alias, or anything from outside is rejected with "Attach a file uploaded
 * through ResiSmart". So the only URL that can ever pass is the one this call
 * hands back. Never construct one.
 *
 * The field name is `image`; `upload.single('image')` on the route reads that
 * name and nothing else, and a mismatched name is a 400 saying "Please upload
 * an image file" for a request that carried one. The server re-detects the mime
 * type from the BYTES and ignores what is claimed here, so the value below is
 * for the multipart part only.
 *
 * Rate-limited to 120 uploads per hour per user server-side. A shop
 * photographing its shelves can reach that; the limiter's own message is
 * readable and `apiErrorMessage` surfaces it.
 */
export async function uploadPublicImage(file: {
  uri: string;
  name: string;
  mimeType: string;
}): Promise<string> {
  const form = new FormData();
  const part = { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob;
  form.append('image', part);

  const { data } = await apiClient.post<{ imageUrl: string }>('/upload', form, {
    // Same two rules as `uploadKycFile`: axios must be left to write the
    // multipart boundary, and a photograph over a shop's 3G is not a
    // 30-second request.
    headers: { 'Content-Type': undefined },
    timeout: 60_000,
  });
  return data.imageUrl;
}
