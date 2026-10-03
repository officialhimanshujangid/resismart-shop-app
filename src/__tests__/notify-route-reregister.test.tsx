/**
 * >>> NOTIFY-ROUTE — the real `usePushRegistration` hook on an install that
 * registered BEFORE the server stored app identity (its stored scope is the
 * old bare partner id). It must POST exactly once — named `shop`, so the
 * server stores the token as SHOP_APP — and then never again for the same
 * token + business. A web build never registers at all.
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { callsTo, mockApi } from './setup/mockApi';
import { renderScreen } from './setup/harness';
import { usePushRegistration } from '../hooks/usePushRegistration';
import { pushScopeKey } from '../lib/appIdentity';
import { store } from '../lib/store';
import { DEVICE_KEYS } from '../constants/app';

const TOKEN = 'ExponentPushToken[shop-old-install]';
const PARTNER = '65f000000000000000000033';

jest.mock('expo-notifications', () => ({
  AndroidImportance: {},
  AndroidNotificationVisibility: {},
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[shop-old-install]' })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { appOwnership: null, expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'test-project' } } }, easConfig: {} },
}));
jest.mock('expo-device', () => ({ isDevice: true, deviceName: 'Shop phone', manufacturer: 'S', modelName: 'P' }));

function Host() {
  usePushRegistration({ enabled: true, partnerId: PARTNER });
  return null;
}

/** Let the registration effect finish its awaits. */
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

describe('NOTIFY-ROUTE: an old shop-app install re-registers once', () => {
  it('old bare stored scope → exactly one named POST, the new key is stored, a second launch posts nothing', async () => {
    await store.set(DEVICE_KEYS.PUSH_TOKEN, TOKEN);
    await store.set(DEVICE_KEYS.PUSH_TOKEN_SCOPE, PARTNER); // the pre-routing format

    const first = await renderScreen(<Host />);
    await waitFor(() => expect(callsTo('POST', '/notifications/devices')).toHaveLength(1));
    const post = mockApi.post.mock.calls.find((c: unknown[]) => c[0] === '/notifications/devices') as unknown[];
    expect(post[1]).toEqual(expect.objectContaining({ token: TOKEN }));
    expect((post[2] as { headers: Record<string, string> }).headers['X-ResiSmart-App']).toBe('shop');
    await flush();
    expect(await store.get(DEVICE_KEYS.PUSH_TOKEN_SCOPE)).toBe(pushScopeKey(PARTNER));
    first.unmount();

    await renderScreen(<Host />);
    await waitFor(() => expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(2));
    await flush();
    expect(callsTo('POST', '/notifications/devices')).toHaveLength(1);
  });

  it('a web build never registers (and so never sends the app header)', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'web');
    try {
      await renderScreen(<Host />);
      await flush();
      expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
      expect(callsTo('POST', '/notifications/devices')).toHaveLength(0);
    } finally {
      os.restore();
    }
  });
});
