import { apiClient, ApiEnvelope, unwrap } from './axios';

/**
 * A person's own notifications and their own devices.
 *
 * Deliberately ungated server-side: every handler scopes to `req.user`, so
 * there is no wider set a permission check could protect — it could only stop
 * somebody reading their own messages.
 */

export type DevicePlatform = 'WEB' | 'ANDROID' | 'IOS';

export interface NotificationRow {
  _id: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
  priority?: string;
  readAt?: string | null;
  createdAt: string;
}

export const notificationApi = {
  /**
   * The query parameter is `unread`, not `unreadOnly` — the controller reads
   * `req.query.unread === 'true'` and anything else is ignored, so the wrong
   * name silently returns the full list instead of erroring.
   */
  list: (params?: { unread?: boolean; limit?: number; before?: string }) =>
    apiClient
      .get<ApiEnvelope<{ items: NotificationRow[]; unread: number }>>('/notifications', { params })
      .then((r) => unwrap(r.data)),

  markRead: (ids: string[]) => apiClient.post('/notifications/read', { ids }).then((r) => r.data),

  /**
   * Register this device for push.
   *
   * Registered against the ACTIVE tenant — `push.service.ts` addresses tokens by
   * scope id, which in a partner session is the partner id. That is why
   * `usePushRegistration` re-registers on a context switch instead of assuming
   * one token per install: without it, a partner who switches to their second
   * business keeps receiving the first one's alerts and none of the second's.
   */
  registerDevice: (input: { platform: DevicePlatform; token: string; deviceLabel?: string }) =>
    apiClient.post('/notifications/devices', input).then((r) => r.data),

  unregisterDevice: (token: string) =>
    apiClient.delete('/notifications/devices', { data: { token } }).then((r) => r.data),
};
