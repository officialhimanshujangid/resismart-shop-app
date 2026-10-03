/**
 * Commerce C1/C2 for the shop app — the Online-orders half of Online shop
 * settings (storefront, delivery fee, delivery slots, fulfilment, share), the
 * one-tap pause, and the share card. Kept out of the foundation files
 * (`api.ts` / `types.ts` / `hooks.ts` are the orchestrator's): shapes read from
 * the BUILT backend — `routes/commerce-storefront.routes.ts`,
 * `services/commerce/storefront.service.ts`, `validators/commerce.validator.ts`
 * (storefrontPatch, deliveryPatch, slotDay, fulfilmentPatch, pauseOrdersSchema,
 * shareQuerySchema) and `models/partner-commerce-settings.model.ts`.
 *
 * Money = integer paise. The server fills every default (`commerceSettingsOf`);
 * the `…Of` readers below only guard an older server that lacks a section.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { apiClient, type ApiEnvelope, unwrap } from '../../api/axios';
import i18n, { formatI18nDate } from '../../i18n';
import { parseRupeesToPaise } from '../../lib/money';
import { qk } from '../../lib/queryKeys';
import type { CommerceSettingsPayload } from './types';

type T = (key: string, options?: Record<string, unknown>) => string;

// ═══════════════════════════════════════════════════════════════ shapes

export const DELIVERY_FEE_MODES = ['FLAT', 'PER_SOCIETY', 'PER_TOWER'] as const;
export type DeliveryFeeMode = typeof DELIVERY_FEE_MODES[number];
export const DELIVERY_TAX_MODES = ['PRINCIPAL_SUPPLY', 'FIXED_RATE'] as const;
export type DeliveryTaxMode = typeof DELIVERY_TAX_MODES[number];
export const DELIVERY_PROOF_MODES = ['NONE', 'OTP', 'PHOTO', 'OTP_OR_PHOTO'] as const;
export type DeliveryProofMode = typeof DELIVERY_PROOF_MODES[number];

/** `COMMERCE_SETTINGS_BOUNDS` (model) + `pauseOrdersSchema` + `slotDay`. */
export const STOREFRONT_BOUNDS = {
  maxFeePaise: 100_000_00,
  maxMinOrderPaise: 10_000_000_00,
  maxAutoCancelHours: 168,
  maxCutoffMin: 24 * 60,
  maxAdvanceDays: 30,
  maxPauseNote: 140,
  minPauseMinutes: 15,
  maxPauseMinutes: 7 * 24 * 60,
  maxTaxPercent: 40,
  maxSocietyFees: 200,
  maxTowerFees: 500,
  maxBlockName: 40,
  maxWindows: 6,
  minSlotMin: 15,
  maxSlotMin: 240,
  maxCapacity: 500,
} as const;

export interface StorefrontSettings {
  acceptOrdersWhenClosed: boolean;
  ordersPaused: boolean;
  /** ISO — a timed pause ends by itself at this instant. */
  pausedUntil?: string;
  pauseNote?: string;
  minOrderPaise: number;
}
export interface SocietyFee { societyId: string; feePaise: number }
export interface TowerFee { societyId: string; blockName: string; feePaise: number }
export interface SlotDay { day: number; isOpen: boolean; windows: Array<{ from: string; to: string }>; slotMin: number; capacityPerSlot: number }
export interface DeliverySlotRules { weekly: SlotDay[]; cutoffMin: number; advanceDays: number }
export interface DeliverySettings {
  feeEnabled: boolean;
  feeMode: DeliveryFeeMode;
  flatFeePaise: number;
  societyFees: SocietyFee[];
  towerFees: TowerFee[];
  freeAbovePaise: number;
  taxMode: DeliveryTaxMode;
  fixedTaxRatePercent: number;
  sac: string;
  slotsEnabled: boolean;
  slots: DeliverySlotRules;
}
export interface FulfilmentSettings {
  partialAcceptEnabled: boolean;
  substitutionEnabled: boolean;
  deliveryStaffEnabled: boolean;
  proofMode: DeliveryProofMode;
  reserveStockAtPlace: boolean;
  autoCancelPlacedAfterHours: number;
}
export interface ShareSettings { enabled: boolean }

/** The extra fields `settingsView` answers beside `settings` / `features`. */
export interface StorefrontPayloadExtras {
  explicit?: { acceptOrdersWhenClosed: boolean | null };
  openNow?: boolean;
  hoursStated?: boolean;
  opensAt?: string;
  timezone?: string;
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const boolOf = (v: unknown, d = false) => (typeof v === 'boolean' ? v : d);
const pickOf = <X extends string>(v: unknown, list: readonly X[], d: X): X =>
  (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as X) : d);

export function storefrontOf(p: CommerceSettingsPayload | undefined): StorefrontSettings {
  const s = rec(p?.settings?.storefront);
  return {
    acceptOrdersWhenClosed: boolOf(s.acceptOrdersWhenClosed, true),
    ordersPaused: boolOf(s.ordersPaused),
    ...(typeof s.pausedUntil === 'string' && s.pausedUntil ? { pausedUntil: s.pausedUntil } : {}),
    ...(typeof s.pauseNote === 'string' && s.pauseNote ? { pauseNote: s.pauseNote } : {}),
    minOrderPaise: num(s.minOrderPaise, 0),
  };
}

export function deliveryOf(p: CommerceSettingsPayload | undefined): DeliverySettings {
  const d = rec(p?.settings?.delivery);
  const slots = rec(d.slots);
  return {
    feeEnabled: boolOf(d.feeEnabled),
    feeMode: pickOf(d.feeMode, DELIVERY_FEE_MODES, 'FLAT'),
    flatFeePaise: num(d.flatFeePaise, 0),
    societyFees: Array.isArray(d.societyFees) ? (d.societyFees as SocietyFee[]).map((x) => ({ societyId: String(x.societyId), feePaise: num(x.feePaise, 0) })) : [],
    towerFees: Array.isArray(d.towerFees)
      ? (d.towerFees as TowerFee[]).map((x) => ({ societyId: String(x.societyId), blockName: String(x.blockName ?? ''), feePaise: num(x.feePaise, 0) }))
      : [],
    freeAbovePaise: num(d.freeAbovePaise, 0),
    taxMode: pickOf(d.taxMode, DELIVERY_TAX_MODES, 'PRINCIPAL_SUPPLY'),
    fixedTaxRatePercent: num(d.fixedTaxRatePercent, 18),
    sac: typeof d.sac === 'string' && d.sac ? d.sac : '996813',
    slotsEnabled: boolOf(d.slotsEnabled),
    slots: {
      weekly: Array.isArray(slots.weekly) ? (slots.weekly as SlotDay[]) : [],
      cutoffMin: num(slots.cutoffMin, 30),
      advanceDays: num(slots.advanceDays, 2),
    },
  };
}

export function fulfilmentOf(p: CommerceSettingsPayload | undefined): FulfilmentSettings {
  const f = rec(p?.settings?.fulfilment);
  return {
    partialAcceptEnabled: boolOf(f.partialAcceptEnabled),
    substitutionEnabled: boolOf(f.substitutionEnabled),
    deliveryStaffEnabled: boolOf(f.deliveryStaffEnabled),
    proofMode: pickOf(f.proofMode, DELIVERY_PROOF_MODES, 'NONE'),
    reserveStockAtPlace: boolOf(f.reserveStockAtPlace),
    autoCancelPlacedAfterHours: num(f.autoCancelPlacedAfterHours, 0),
  };
}

export const shareOf = (p: CommerceSettingsPayload | undefined): ShareSettings => ({ enabled: boolOf(rec(p?.settings?.share).enabled) });

export const extrasOf = (p: CommerceSettingsPayload | undefined): StorefrontPayloadExtras => (p ?? {}) as StorefrontPayloadExtras;

// ═══════════════════════════════════════════════════════════════ pure rules

/** `isPausedAt` (storefront-rules): paused, and a timed pause not yet over. */
export function isPausedNow(s: Pick<StorefrontSettings, 'ordersPaused' | 'pausedUntil'>, now = new Date()): boolean {
  if (!s.ordersPaused) return false;
  if (!s.pausedUntil) return true;
  const until = new Date(s.pausedUntil);
  return Number.isNaN(until.getTime()) || now < until;
}

export type PauseChoice = '30' | '60' | '120' | 'today' | 'untilResume';
export const PAUSE_CHOICES: PauseChoice[] = ['30', '60', '120', 'today', 'untilResume'];

/** Minutes until the next local midnight, inside `pauseOrdersSchema`'s 15 – 10080. */
export function minutesLeftToday(now = new Date()): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const m = Math.ceil((midnight.getTime() - now.getTime()) / 60_000);
  return Math.min(STOREFRONT_BOUNDS.maxPauseMinutes, Math.max(STOREFRONT_BOUNDS.minPauseMinutes, m));
}

export interface PauseBody { paused: boolean; forMinutes?: number; note?: string }

/** The sheet's choice → `pauseOrdersSchema` body. */
export function pauseBodyOf(choice: PauseChoice, note: string, now = new Date()): PauseBody {
  const trimmed = note.trim().slice(0, STOREFRONT_BOUNDS.maxPauseNote);
  const forMinutes = choice === 'untilResume' ? undefined : choice === 'today' ? minutesLeftToday(now) : Number(choice);
  return { paused: true, ...(forMinutes ? { forMinutes } : {}), ...(trimmed ? { note: trimmed } : {}) };
}

/** "6:30 PM" today, "3 Oct 2026, 9:00 AM" on another day — the catalogue's own formats. */
export function clockText(iso: string | undefined, t: T, now = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const time = t('components.date.time', {
    hour: h, minute: String(d.getMinutes()).padStart(2, '0'), meridiem: t(h24 >= 12 ? 'common.pm' : 'common.am'),
  });
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? time : t('components.date.dateTime', { date: formatI18nDate(d, t), time });
}

/** A whole number in [min, max]; '' → `blank` (when given). */
export function wholeIn(s: string, min: number, max: number, blank?: number): number | null {
  const raw = s.trim();
  if (!raw) return blank ?? null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n < min || n > max ? null : n;
}

/** Rupees typed → paise in [min, max]; '' → `blank` (when given). */
export function rupeesIn(s: string, min: number, max: number, blank?: number): number | null {
  if (!s.trim()) return blank ?? null;
  const p = parseRupeesToPaise(s);
  return p === null || p < min || p > max ? null : p;
}

/** The fixed delivery GST rate: 0–40, at most two decimals. */
export function taxPercentIn(s: string): number | null {
  const raw = s.trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(raw)) return null;
  const n = Number(raw);
  return n < 0 || n > STOREFRONT_BOUNDS.maxTaxPercent ? null : n;
}

export const SAC_PATTERN = /^\d{4,8}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A fresh week for the slot editor when the shop has none yet: every day shut, sensible hours ready. */
export function defaultSlotWeek(): SlotDay[] {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, isOpen: false, windows: [{ from: '09:00', to: '21:00' }], slotMin: 60, capacityPerSlot: 5 }));
}

/** The stored week, always seven days in order (missing days shut). */
export function normaliseWeek(weekly: SlotDay[]): SlotDay[] {
  const base = defaultSlotWeek();
  return base.map((d) => {
    const found = weekly.find((w) => w.day === d.day);
    return found ? { ...found, windows: found.windows.map((w) => ({ ...w })) } : d;
  });
}

/** Days with a problem → the day numbers (open with no window, a window that does not end after it starts, too many). */
export function slotWeekProblems(weekly: SlotDay[]): number[] {
  return weekly.filter((d) => d.isOpen && (
    !d.windows.length || d.windows.length > STOREFRONT_BOUNDS.maxWindows
    || d.windows.some((w) => !HHMM.test(w.from) || !HHMM.test(w.to) || w.from >= w.to)
    || d.slotMin < STOREFRONT_BOUNDS.minSlotMin || d.slotMin > STOREFRONT_BOUNDS.maxSlotMin
    || d.capacityPerSlot < 1 || d.capacityPerSlot > STOREFRONT_BOUNDS.maxCapacity
  )).map((d) => d.day);
}

/** Two fee rows for the same society (or the same society + tower) — the server's DELIVERY_FEE_RULE_INVALID. */
export function feeRowsClash(society: Array<{ societyId: string }>, tower: Array<{ societyId: string; blockName: string }>): boolean {
  const s = society.map((r) => r.societyId);
  const tw = tower.map((r) => `${r.societyId}|${r.blockName.trim().toLowerCase()}`);
  return new Set(s).size !== s.length || new Set(tw).size !== tw.length;
}

/** Same value? (arrays / objects by content) — what decides a key is "changed". */
export const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// ═══════════════════════════════════════════════════════════════ api

export interface PauseResult { storefront: StorefrontSettings & { pausedNow: boolean } }
export interface ShareLinks { storeUrl: string; productUrl?: string; qrPngDataUrl: string }

export const storefrontApi = {
  /** POST /partners/me/commerce/pause — ORDERS_MANAGE or STOREFRONT_MANAGE. */
  pause: (body: PauseBody) =>
    apiClient.post<ApiEnvelope<PauseResult>>('/partners/me/commerce/pause', body).then((r) => unwrap(r.data)),
  /** GET /partners/me/commerce/share — CATALOG_VIEW + feature SHARE. */
  share: (productId?: string) =>
    apiClient
      .get<ApiEnvelope<ShareLinks>>('/partners/me/commerce/share', { params: productId ? { productId } : {} })
      .then((r) => unwrap(r.data)),
  posterBytes: (lang: 'en' | 'hi', productId?: string) =>
    apiClient
      .get<ArrayBuffer>('/partners/me/commerce/share/poster.pdf', {
        params: { lang, ...(productId ? { productId } : {}) },
        responseType: 'arraybuffer',
      })
      .then((r) => new Uint8Array(r.data)),
};

/** The A4 "Scan to order" poster through the OS share sheet (print, save, WhatsApp). */
export async function sharePoster(lang: 'en' | 'hi'): Promise<void> {
  const bytes = await storefrontApi.posterBytes(lang);
  // Built on use, not at import: a screen that never shares must not touch the file system.
  const DIR = new Directory(Paths.cache, 'commerce');
  if (!DIR.exists) DIR.create({ intermediates: true, idempotent: true });
  const label = `shop-poster-${lang}`;
  const file = new File(DIR, `${label}.pdf`);
  file.create({ overwrite: true });
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error(i18n.t('billing.share.sharingUnavailable'));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: i18n.t('billing.share.dialogTitle', { label }) });
}

// ═══════════════════════════════════════════════════════════════ hooks

/** Pause / resume. The answer is the new storefront section — written into the settings cache at once. */
export function usePauseOrders() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: PauseBody) => storefrontApi.pause(body),
    onSuccess: (out) => {
      if (out?.storefront) {
        client.setQueryData<CommerceSettingsPayload>(qk.commerce.settings(), (old) => (old
          ? { ...old, settings: { ...old.settings, storefront: { ...rec(old.settings.storefront), ...out.storefront } } }
          : old));
      }
      void client.invalidateQueries({ queryKey: qk.commerce.settings() });
    },
  });
}

export function useShareLinks(enabled: boolean) {
  return useQuery({ queryKey: ['commerce', 'share'], queryFn: () => storefrontApi.share(), enabled, staleTime: 10 * 60_000 });
}

/** One place the shop delivers to: home, a linked society, one it has had orders from, or one already in a fee rule. */
export interface DeliveryArea { societyId: string; name: string; towers: string[]; sources: string[] }

/** `GET /partners/me/commerce/delivery-areas` (module ORDERS; ORDERS_VIEW or STOREFRONT_MANAGE) — names for the fee tables. */
export function useDeliveryAreas(enabled: boolean) {
  return useQuery({
    queryKey: ['commerce', 'deliveryAreas'],
    queryFn: () =>
      apiClient
        .get<ApiEnvelope<DeliveryArea[]>>('/partners/me/commerce/delivery-areas')
        .then((r) => (unwrap(r.data) ?? []).map((a) => ({ ...a, towers: Array.isArray(a.towers) ? a.towers : [] }))),
    enabled,
    staleTime: 5 * 60_000,
  });
}
