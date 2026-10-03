/**
 * >>> NOTIFY-ROUTE — the shop app names itself when it registers a device for
 * push, so the server stores the token as SHOP_APP (a business's orders and
 * bookings here and on the web; never a society's bills or a gate alarm). An
 * install that registered before the server stored app identity re-registers
 * once (versioned stored scope).
 */
import { notificationApi } from '../api/notification.api';
import { SHOP_APP_NAME, appIdentityHeaders, pushScopeKey } from '../lib/appIdentity';
import { mockApi } from './setup/mockApi';

describe('NOTIFY-ROUTE: the shop app names itself on device registration', () => {
  it('POST /notifications/devices carries X-ResiSmart-App: shop and the app version', async () => {
    mockApi.post.mockClear();
    await notificationApi.registerDevice({ platform: 'IOS', token: 'ExponentPushToken[p]' });
    const call = mockApi.post.mock.calls.find((c: unknown[]) => c[0] === '/notifications/devices') as unknown[] | undefined;
    expect(call).toBeDefined();
    expect(call![1]).toEqual({ platform: 'IOS', token: 'ExponentPushToken[p]' });
    const headers = (call![2] as { headers: Record<string, string> }).headers;
    expect(headers['X-ResiSmart-App']).toBe('shop');
    expect(headers['X-App-Version']).toMatch(/^\d+\.\d+\.\d+/);
    expect(appIdentityHeaders()['X-ResiSmart-App']).toBe(SHOP_APP_NAME);
  });

  it('the inbox read is unchanged (no custom header outside registration)', async () => {
    mockApi.get.mockClear();
    // The empty mock server may make `unwrap` complain; only the request matters here.
    await notificationApi.list({ limit: 5 }).catch(() => undefined);
    const call = mockApi.get.mock.calls.find((c: unknown[]) => c[0] === '/notifications') as unknown[] | undefined;
    expect(call).toBeDefined();
    expect((call![1] as { headers?: unknown }).headers).toBeUndefined();
  });

  it('the stored push scope is versioned and stable', () => {
    const key = pushScopeKey('65f000000000000000000003');
    expect(key).not.toBe('65f000000000000000000003');
    expect(key).toContain('65f000000000000000000003');
    expect(key).toContain('shop');
    expect(pushScopeKey('65f000000000000000000003')).toBe(key);
  });
});
