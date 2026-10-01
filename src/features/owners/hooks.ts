import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '../../lib/queryKeys';
import { ownersApi } from './api';
import type { CreateInviteBody, InviteView } from './types';

export function useTeam(enabled = true) {
  return useQuery({ queryKey: qk.owners.team(), queryFn: ownersApi.team, enabled, staleTime: 15_000 });
}

/** Invitations sent to this person's own phone/email. Quiet on failure — it is a card, not a screen. */
export function useMyInvites(enabled = true) {
  return useQuery({ queryKey: qk.owners.mine(), queryFn: ownersApi.mine, enabled, staleTime: 60_000 });
}

function useInvalidateTeam() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: qk.owners.team() });
}

export function useCreateInvite() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: (body: CreateInviteBody) => ownersApi.createInvite(body),
    onSuccess: invalidate,
  });
}

export function useCancelInvite() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: (inviteId: string) => ownersApi.cancelInvite(inviteId),
    onSuccess: invalidate,
  });
}

/**
 * "Resend" — the contract has no resend verb, and the link token is shown only
 * once, so a resend is: cancel the waiting invitation, then send the same one
 * again, which mints a new link to share. Cancel FIRST: sending first would be
 * refused with PARTNER_INVITE_ALREADY_PENDING.
 */
export function useReissueInvite() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: async (invite: InviteView) => {
      await ownersApi.cancelInvite(invite.id);
      return ownersApi.createInvite({
        kind: invite.kind,
        name: invite.toName,
        phone: invite.toPhone,
        email: invite.toEmail,
        note: invite.note,
      });
    },
    // Settled, not success: if the cancel landed and the send did not, the list
    // must still stop showing the cancelled row as waiting.
    onSettled: invalidate,
  });
}

export function useRemoveOwner() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: (userId: string) => ownersApi.removeAdmin(userId),
    onSuccess: invalidate,
  });
}

export function useArchiveBusiness() {
  return useMutation({ mutationFn: ownersApi.archive });
}
