import { WEB_PANEL_URL } from '../../constants/app';
import type { AdminView, InviteKind, InviteView } from './types';

/**
 * The pure half of Team → Owners — no React, no network, so it is testable on
 * its own and the web dashboard's rules can be read side by side with it.
 */

/** The share link the contract names: `<origin>/partner-invite/<token>`. */
export function inviteLink(token: string): string {
  return `${WEB_PANEL_URL}/partner-invite/${encodeURIComponent(token)}`;
}

/** A wa.me link with the message prefilled; addressed to the invitee when we have a usable phone. */
export function whatsappShareUrl(message: string, phone?: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  // A bare 10-digit Indian mobile needs the country code for wa.me.
  const e164 = digits.length === 10 ? `91${digits}` : digits;
  const who = e164.length >= 11 ? e164 : '';
  return `https://wa.me/${who}?text=${encodeURIComponent(message)}`;
}

/** The status to SHOW: a pending row past its expiry reads as expired (contract §2.1). */
export function shownStatus(invite: Pick<InviteView, 'status' | 'expiresAt'>, now = Date.now()): string {
  if (invite.status === 'PENDING' && new Date(invite.expiresAt).getTime() < now) return 'EXPIRED';
  return invite.status;
}

export interface SplitInvites {
  pending: InviteView[];
  closed: InviteView[];
  /** Accepted handovers, newest first — the "handover history" with cut-over details. */
  handovers: InviteView[];
}

export function splitInvites(invites: InviteView[], now = Date.now()): SplitInvites {
  const pending: InviteView[] = [];
  const closed: InviteView[] = [];
  const handovers: InviteView[] = [];
  for (const inv of invites) {
    if (shownStatus(inv, now) === 'PENDING') pending.push(inv);
    else closed.push(inv);
    if (inv.kind === 'TRANSFER' && inv.status === 'ACCEPTED') handovers.push(inv);
  }
  return { pending, closed, handovers };
}

/** Is there already a handover waiting? Only one may be pending per business. */
export function hasPendingTransfer(invites: InviteView[], now = Date.now()): boolean {
  return invites.some((i) => i.kind === 'TRANSFER' && shownStatus(i, now) === 'PENDING');
}

/** The last owner can never be removed; the server enforces it, this only hides a doomed button. */
export function canRemoveOwner(admins: AdminView[]): boolean {
  return admins.filter((a) => a.isActive !== false).length > 1;
}

export interface InviteFormValues {
  name: string;
  phone: string;
  email: string;
  note: string;
}

/** Field → catalogue key. Mirrors the zod schema of `POST /partners/me/team/invites`. */
export function validateInviteForm(kind: InviteKind, v: InviteFormValues): Partial<Record<keyof InviteFormValues | 'contact', string>> {
  const errors: Partial<Record<keyof InviteFormValues | 'contact', string>> = {};
  const name = v.name.trim();
  if (name.length < 2 || name.length > 80) errors.name = 'owners.form.errName';
  const phone = v.phone.trim();
  const email = v.email.trim();
  if (phone && (phone.replace(/\D/g, '').length < 10 || phone.length > 20)) errors.phone = 'owners.form.errPhone';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'owners.form.errEmail';
  if (kind === 'TRANSFER' && !email) errors.email = 'errors.PARTNER_INVITE_EMAIL_REQUIRED_FOR_TRANSFER';
  if (kind === 'CO_ADMIN' && !phone && !email) errors.contact = 'errors.PARTNER_INVITE_CONTACT_REQUIRED';
  if (v.note.trim().length > 300) errors.note = 'owners.form.errNote';
  return errors;
}

/** The archive confirmation: the business name, case-insensitive, as the server compares it. */
export function archiveNameMatches(businessName: string, typed: string): boolean {
  const a = businessName.trim().toLowerCase();
  return a.length > 0 && a === typed.trim().toLowerCase();
}

export const ARCHIVE_REASON_MIN = 3;
export const ARCHIVE_REASON_MAX = 300;
