/**
 * Owners, co-owner invitations and business handover — the shapes of
 * CONTRACT-partner-P0 §2.1. Dates are ISO strings on the wire.
 *
 * `status`/`kind` are typed as their unions PLUS `string`: a value this build has
 * never heard of must still render (as "not live") rather than crash a switch.
 */

export type InviteKind = 'CO_ADMIN' | 'TRANSFER';
export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
export type InviteChannel = 'PHONE' | 'EMAIL';

export interface AdminView {
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  isActive: boolean;
  isPrimary: boolean;
  since: string;
}

export interface CutoverNumber {
  series: string;
  financialYear?: string;
  number?: string;
  seq?: number;
}

export interface InviteCutover {
  at: string;
  gstinAtCutover?: string;
  note: string;
  lastNumbers: CutoverNumber[];
}

export interface InviteView {
  id: string;
  partnerId: string;
  kind: InviteKind;
  status: InviteStatus | string;
  origin: 'PARTNER' | 'PLATFORM' | string;
  toName: string;
  toPhone?: string;
  toEmail?: string;
  channel: InviteChannel;
  expiresAt: string;
  note?: string;
  invitedByName: string;
  createdAt: string;
  acceptedAt?: string;
  closedAt?: string;
  closedReason?: string;
  revokedCount: number;
  cutover?: InviteCutover;
}

export interface TeamPayload {
  admins: AdminView[];
  invites: InviteView[];
}

export interface CreateInviteBody {
  kind: InviteKind;
  name: string;
  phone?: string;
  email?: string;
  note?: string;
}

export interface CreatedInvite {
  invite: InviteView;
  /** Returned ONCE. Share it now — it cannot be read back. */
  token: string;
  invitePath: string;
}

/** `GET /partner-invites/mine` rows. */
export type MyInvite = InviteView & { partnerName: string };

/** The public preview of one invitation (by token or by id). */
export interface InvitePreview {
  id: string;
  kind: InviteKind;
  status: InviteStatus | string;
  toName: string;
  channel: InviteChannel;
  maskedContact: string;
  invitedByName: string;
  expiresAt: string;
  note?: string;
  partner: { name: string; slug: string; status: string } | null;
}

export interface SendCodeResult {
  expiresInSec: number;
  deliveredVia: 'whatsapp' | 'sms' | 'email' | null;
  maskedContact: string;
}

export interface AcceptResult {
  invite: InviteView;
  partnerId: string;
  partnerName: string;
  userId: string;
  revokedCount: number;
}

/** How an invitation is addressed: the link token (no sign-in) or its id (signed in). */
export type InviteAddress = { token: string } | { id: string };

export interface ArchiveBody {
  reason: string;
  confirmName: string;
}
