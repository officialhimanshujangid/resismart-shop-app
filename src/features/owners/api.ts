import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
import type {
  AcceptResult, ArchiveBody, CreateInviteBody, CreatedInvite, InviteAddress, InvitePreview,
  InviteView, MyInvite, SendCodeResult, TeamPayload,
} from './types';

/**
 * CONTRACT-partner-P0 §2.2 (owner of the business), §2.3 (the invitee) and the
 * archive route. Every path here is exactly the contract's; nothing is guessed.
 */

/** `by-token/<token>` or `<inviteId>` — the two ways the contract addresses one invitation. */
export function invitePath(addr: InviteAddress): string {
  return 'token' in addr
    ? `/partner-invites/by-token/${encodeURIComponent(addr.token)}`
    : `/partner-invites/${encodeURIComponent(addr.id)}`;
}

/** Blank strings are dropped rather than sent — the schema reads `''` and absent the same, absent is clearer. */
function compact(body: CreateInviteBody): CreateInviteBody {
  const out: CreateInviteBody = { kind: body.kind, name: body.name.trim() };
  if (body.phone?.trim()) out.phone = body.phone.trim();
  if (body.email?.trim()) out.email = body.email.trim();
  if (body.note?.trim()) out.note = body.note.trim();
  return out;
}

export const ownersApi = {
  team: () =>
    apiClient.get<ApiEnvelope<TeamPayload>>('/partners/me/team').then((r) => unwrap(r.data)),

  createInvite: (body: CreateInviteBody) =>
    apiClient
      .post<ApiEnvelope<CreatedInvite>>('/partners/me/team/invites', compact(body))
      .then((r) => unwrap(r.data)),

  cancelInvite: (inviteId: string) =>
    apiClient
      .post<ApiEnvelope<InviteView>>(`/partners/me/team/invites/${encodeURIComponent(inviteId)}/cancel`, {})
      .then((r) => unwrap(r.data)),

  removeAdmin: (userId: string) =>
    apiClient
      .delete<ApiEnvelope<{ removedUserId: string; primaryRepointedTo: string | null }>>(
        `/partners/me/team/admins/${encodeURIComponent(userId)}`,
      )
      .then((r) => unwrap(r.data)),

  archive: (body: ArchiveBody) =>
    apiClient
      .post<{ success: boolean; message?: string; data: { status: 'ARCHIVED' } }>('/partners/me/archive', {
        reason: body.reason.trim(),
        confirmName: body.confirmName.trim(),
      })
      .then((r) => r.data),

  // ---------------------------------------------------------------- invitee

  mine: () =>
    apiClient.get<ApiEnvelope<MyInvite[]>>('/partner-invites/mine').then((r) => unwrap(r.data) ?? []),

  preview: (addr: InviteAddress) =>
    apiClient.get<ApiEnvelope<InvitePreview>>(invitePath(addr)).then((r) => unwrap(r.data)),

  sendCode: (addr: InviteAddress) =>
    apiClient.post<ApiEnvelope<SendCodeResult>>(`${invitePath(addr)}/send-code`, {}).then((r) => unwrap(r.data)),

  accept: (addr: InviteAddress, body: { code: string; name?: string }) =>
    apiClient
      .post<ApiEnvelope<AcceptResult> & { message?: string }>(`${invitePath(addr)}/accept`, {
        code: body.code.trim(),
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
      })
      .then((r) => unwrap(r.data)),

  decline: (addr: InviteAddress) =>
    apiClient.post<ApiEnvelope<InviteView>>(`${invitePath(addr)}/decline`, {}).then((r) => unwrap(r.data)),
};
