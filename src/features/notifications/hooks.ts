import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notificationApi, NotificationRow } from '../../api/notification.api';
import { qk } from '../../lib/queryKeys';

/**
 * The notification inbox, finally READ by something.
 *
 * `qk.notifications()` was invalidated in two places — `useLiveEvents.keysForKind`
 * on every SSE frame, and `usePushRegistration` on every push received while the
 * app is open — and no query in the app had ever been registered under it. An
 * invalidation with no reader is a no-op, so both of those lines were doing
 * nothing at all, and anything that arrived while the phone was off was
 * unrecoverable: `notificationApi.list` and `markRead` were defined and called
 * from nowhere.
 *
 * With this hook mounted, both existing invalidations start working as written.
 */

/** How many rows one page holds. The server clamps `limit` to 100. */
export const NOTIFICATIONS_PAGE = 30;

export interface NotificationPage {
  items: NotificationRow[];
  /** Unread across the WHOLE inbox, not just this page — the server counts separately. */
  unread: number;
}

/**
 * The newest page, plus the unread count the badge reads.
 *
 * Deliberately not `useInfiniteQuery`. The endpoint pages by `before`
 * (a createdAt cursor), and the accumulate-into-state pattern the Orders tab
 * already uses is the one this codebase has settled on — see `notifications.tsx`,
 * which holds the older pages itself. One shape for "load more" in this app is
 * worth more than the marginally tidier hook.
 *
 * `staleTime` is short: the badge is the whole point, and a count that is a
 * minute out of date is a partner who thinks they have read everything.
 */
export function useNotifications(limit: number = NOTIFICATIONS_PAGE) {
  return useQuery({
    queryKey: qk.notifications(),
    queryFn: () => notificationApi.list({ limit }),
    staleTime: 15_000,
  });
}

/** One older page, fetched on demand. Not cached — see `notifications.tsx`. */
export function fetchOlderNotifications(before: string, limit: number = NOTIFICATIONS_PAGE) {
  return notificationApi.list({ before, limit });
}

/**
 * Mark rows read.
 *
 * An EMPTY array is not "mark nothing" — `notification.controller.ts#markRead`
 * reads a missing/empty `ids` as "all of mine", and scopes by `userId` either
 * way. So `markRead([])` is the "mark all read" button, and that is deliberate
 * rather than a quirk being exploited: the alternative is sending every id the
 * client happens to have loaded, which marks only the page in front of the
 * partner and leaves the badge stubbornly non-zero.
 */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => notificationApi.markRead(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications() });
    },
  });
}
