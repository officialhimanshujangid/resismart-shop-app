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

  it('the inbox read, mark-read and unregister name the app too (M03 H10)', async () => {
    mockApi.get.mockClear();
    mockApi.post.mockClear();
    mockApi.delete.mockClear();
    // The empty mock server may make `unwrap` complain; only the request matters here.
    await notificationApi.list({ limit: 5, cursor: 'c1' }).catch(() => undefined);
    const call = mockApi.get.mock.calls.find((c: unknown[]) => c[0] === '/notifications') as unknown[] | undefined;
    expect(call).toBeDefined();
    const cfg = call![1] as { headers?: Record<string, string>; params?: Record<string, unknown> };
    expect(cfg.headers?.['X-ResiSmart-App']).toBe('shop');
    expect(cfg.params).toEqual({ limit: 5, cursor: 'c1' });

    await notificationApi.markRead(['a']).catch(() => undefined);
    const read = mockApi.post.mock.calls.find((c: unknown[]) => c[0] === '/notifications/read') as unknown[] | undefined;
    expect((read![2] as { headers: Record<string, string> }).headers['X-ResiSmart-App']).toBe('shop');

    await notificationApi.unregisterDevice('ExponentPushToken[p]').catch(() => undefined);
    const del = mockApi.delete.mock.calls.find((c: unknown[]) => c[0] === '/notifications/devices') as unknown[] | undefined;
    const delCfg = del![1] as { data: unknown; headers: Record<string, string> };
    expect(delCfg.data).toEqual({ token: 'ExponentPushToken[p]' });
    expect(delCfg.headers['X-ResiSmart-App']).toBe('shop');
  });

  it('the stored push scope is versioned and stable', () => {
    const key = pushScopeKey('65f000000000000000000003');
    expect(key).not.toBe('65f000000000000000000003');
    expect(key).toContain('65f000000000000000000003');
    expect(key).toContain('shop');
    expect(pushScopeKey('65f000000000000000000003')).toBe(key);
  });
});
