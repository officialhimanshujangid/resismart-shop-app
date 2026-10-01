import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';
import type { PartyLedger } from '../../api/parties.api';

/**
 * Khata — the credit ledger on `/partners/me/parties` (CONTRACT-partner-P1 §7.2,
 * module INVOICING). The default reminder is the free SHARE: the server writes
 * the text + a public statement link (+ UPI link) and the phone's own share
 * sheet sends it (WhatsApp, SMS…). PUSH reaches resident-linked customers.
 */
export const PARTY_CREDIT_MODES = ['WARN', 'BLOCK'] as const;
export type PartyCreditMode = typeof PARTY_CREDIT_MODES[number];
export const KHATA_COLLECTION_CADENCES = ['NONE', 'ON_DATE', 'WEEKLY', 'MONTHLY'] as const;
export type KhataCadence = typeof KHATA_COLLECTION_CADENCES[number];
export type KhataFilter = 'due' | 'overdue' | 'overLimit' | 'all';
export type KhataSort = 'amount' | 'oldest' | 'nextDate' | 'name';

export interface PartyCredit {
  limitPaise?: number;
  days?: number;
  mode?: PartyCreditMode;
}

export interface CollectionPlan {
  nextDate?: string;
  cadence?: KhataCadence;
  weekday?: number;
  dayOfMonth?: number;
  autoRemind?: boolean;
  channel?: 'PUSH' | 'WHATSAPP' | 'SMS';
  lastRemindedAt?: string;
  remindCount?: number;
  optedOutAt?: string;
}

export interface KhataRow {
  partyId: string;
  name: string;
  phoneMasked?: string;
  isResidentLinked: boolean;
  outstandingPaise: number;
  oldestOpenDate?: string;
  oldestOpenAgeDays?: number;
  collectionPlan?: { nextDate?: string; cadence?: KhataCadence; autoRemind?: boolean };
  credit?: PartyCredit;
  overLimit: boolean;
  overdueBeyondDays: boolean;
  lastRemindedAt?: string;
}

export interface KhataList {
  data: KhataRow[];
  totals: { duePaise: number; parties: number };
  page: number;
  limit: number;
  total: number;
}

export interface KhataSettingsBody {
  credit?: { limitPaise?: number | null; days?: number | null; mode?: PartyCreditMode } | null;
  collectionPlan?: {
    nextDate?: string | null;
    cadence?: KhataCadence;
    weekday?: number;
    dayOfMonth?: number;
    autoRemind?: boolean;
    channel?: 'PUSH' | 'WHATSAPP' | 'SMS';
  } | null;
}

export type RemindChannel = 'SHARE' | 'PUSH' | 'WHATSAPP' | 'SMS';

export type RemindResult =
  | { channel: 'SHARE'; text: string; url: string; upiUri?: string }
  | { channel: Exclude<RemindChannel, 'SHARE'>; sent: true };

export const khataApi = {
  list: (query: { filter?: KhataFilter; q?: string; sort?: KhataSort; page?: number; limit?: number }) =>
    apiClient.get<KhataList>('/partners/me/parties/khata', { params: query }).then((r) => r.data),

  saveSettings: (partyId: string, body: KhataSettingsBody) =>
    apiClient
      .put<ApiEnvelope<{ partyId: string; credit?: PartyCredit; collectionPlan?: CollectionPlan }>>(`/partners/me/parties/${partyId}/khata`, body)
      .then((r) => unwrap(r.data)),

  upiLink: (partyId: string, amountPaise?: number) =>
    apiClient
      .get<ApiEnvelope<{ upiUri: string; qrPayload: string; amountPaise: number; note: string }>>(
        `/partners/me/parties/${partyId}/upi-link`, { params: amountPaise ? { amountPaise } : undefined },
      )
      .then((r) => unwrap(r.data)),

  statement: (partyId: string, range?: { from?: string; to?: string }) =>
    apiClient
      .get<ApiEnvelope<PartyLedger>>(`/partners/me/parties/${partyId}/statement`, { params: { ...range, format: 'json' } })
      .then((r) => unwrap(r.data)),

  statementPdfBytes: (partyId: string) =>
    apiClient
      .get<ArrayBuffer>(`/partners/me/parties/${partyId}/statement`, { params: { format: 'pdf' }, responseType: 'arraybuffer' })
      .then((r) => new Uint8Array(r.data)),

  shareStatement: (partyId: string, expiresInDays = 7) =>
    apiClient
      .post<ApiEnvelope<{ token: string; url: string; expiresAt: string }>>(`/partners/me/parties/${partyId}/statement/share`, { expiresInDays })
      .then((r) => unwrap(r.data)),

  revokeStatement: (partyId: string) =>
    apiClient
      .post<ApiEnvelope<{ statementLinkVersion: number }>>(`/partners/me/parties/${partyId}/statement/revoke`, {})
      .then((r) => unwrap(r.data)),

  /** Idempotent (`partner.khata.remind`): one key per tap. */
  remind: (partyId: string, body: { channel: RemindChannel; includeUpiLink: boolean; lang: 'en' | 'hi' }, idempotencyKey: string) =>
    apiClient
      .post<ApiEnvelope<RemindResult>>(`/partners/me/parties/${partyId}/remind`, body, withIdempotency(idempotencyKey))
      .then((r) => unwrap(r.data)),

  remindBulk: (body: { partyIds: string[]; channel: 'PUSH' | 'WHATSAPP' | 'SMS'; includeUpiLink: boolean }) =>
    apiClient
      .post<ApiEnvelope<{ partyId: string; outcome: 'SENT' | 'SKIPPED'; code?: string }[]>>('/partners/me/parties/remind-bulk', body)
      .then((r) => unwrap(r.data)),
};
