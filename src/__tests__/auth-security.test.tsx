/**
 * The 2026-09-29 sign-in/security contract, shop side:
 *  - auth refusal codes are said in OUR words (en + hi), PASSWORD_POLICY keeps
 *    the server's exact English reason;
 *  - the login screen always offers the one-time code, shows the coded
 *    INVALID_CREDENTIALS sentence and labels the device;
 *  - change password stores the NEW tokens the server returns;
 *  - the devices list signs one other device out;
 *  - the refresh keeps the rotated refresh token and repairs a stale context
 *    instead of signing out; only a 401 ends the session.
 */
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import axios from 'axios';
import i18n from 'i18next';
import * as SecureStore from 'expo-secure-store';

import { apiErrorMessage, endsSession, refreshSession } from '../api/axios';
import { AuthProvider } from '../context/AuthContext';
import { DEVICE_KEYS, STORAGE_KEYS } from '../constants/app';
import { store } from '../lib/store';
import LoginScreen from '../../app/(auth)/login';
import ChangePasswordScreen from '../../app/(app)/account/change-password';
import DevicesScreen from '../../app/(app)/account/devices';
import { calls, callsTo, fail, setRoutes } from './setup/mockApi';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const refusal = (status: number, data: object) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true, response: { status, data },
  });

/** Paper's outlined inputs, in screen order (their label is not an a11y label). */
const field = (i: number) => screen.getAllByTestId('text-input-outlined')[i];

const named = (label: string) => new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const partnerCtx = (id: string, tenantId = id) => ({
  contextId: `partner:${id}`,
  kind: 'PARTNER',
  tenantType: 'PARTNER',
  tenantId,
  tenantName: `Shop ${id}`,
  unitType: 'PARTNER',
  unitId: tenantId,
  unitLabel: null,
  role: 'PARTNER_ADMIN',
});

async function seedSession(profile = partnerCtx('p1')) {
  await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, 'old-access');
  await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, 'old-refresh');
  await SecureStore.setItemAsync(
    STORAGE_KEYS.USER_PROFILE,
    JSON.stringify({ tenantType: 'PARTNER', tenantId: profile.tenantId, role: profile.role, contextId: profile.contextId }),
  );
}

async function clearStore() {
  for (const k of Object.values(STORAGE_KEYS)) await SecureStore.deleteItemAsync(k);
}

const withAuth = (ui: React.ReactElement) => (
  <PaperProvider>
    <AuthProvider>{ui}</AuthProvider>
  </PaperProvider>
);

afterEach(async () => {
  await clearStore();
  jest.restoreAllMocks();
});

// ─────────────────────────────────────────────── error text mapping
describe('auth refusal codes — our sentence, in the reader\'s language', () => {
  it('INVALID_CREDENTIALS is the catalogue sentence in English and Hindi', async () => {
    const e = refusal(401, { code: 'INVALID_CREDENTIALS', error: 'server words' });
    expect(apiErrorMessage(e)).toBe(en.errors.INVALID_CREDENTIALS);
    await i18n.changeLanguage('hi');
    expect(apiErrorMessage(e)).toBe(hi.errors.INVALID_CREDENTIALS);
  });

  it('OTP, Google, session and limiter codes all map', () => {
    for (const code of ['OTP_WRONG', 'OTP_EXPIRED', 'GOOGLE_NO_ACCOUNT', 'SESSION_NOT_FOUND', 'TOO_MANY_ATTEMPTS', 'CURRENT_PASSWORD_WRONG'] as const) {
      expect(apiErrorMessage(refusal(400, { code, error: 'x' }))).toBe(en.errors[code]);
    }
  });

  it('PASSWORD_POLICY keeps the server\'s exact English reason; Hindi gets ours', async () => {
    const e = refusal(400, { code: 'PASSWORD_POLICY', error: 'That password is too common.' });
    expect(apiErrorMessage(e)).toBe('That password is too common.');
    await i18n.changeLanguage('hi');
    expect(apiErrorMessage(e)).toBe(hi.errors.PASSWORD_POLICY);
  });
});

// ─────────────────────────────────────────────────────────── login
describe('Login screen', () => {
  it('always shows the one-time-code option and the Help link', async () => {
    await renderScreen(withAuth(<LoginScreen />));
    await waitFor(() => expect(screen.getByRole('button', { name: named(en.auth.login.otpButton) })).toBeTruthy());
    expect(screen.getByText(en.auth.login.help)).toBeTruthy();
  });

  it('a wrong password shows the coded INVALID_CREDENTIALS sentence and labels the device', async () => {
    setRoutes({ 'POST /auth/login': fail(401, { code: 'INVALID_CREDENTIALS', error: 'Invalid credentials' }) });
    await renderScreen(withAuth(<LoginScreen />));
    await waitFor(() => expect(screen.getByText(en.auth.login.title)).toBeTruthy());

    await fireEvent.changeText(field(0), 'owner@example.com');
    await fireEvent.changeText(field(1), 'wrong-password');
    await fireEvent.press(screen.getByLabelText(en.auth.login.signIn));

    await waitFor(() => expect(screen.getByText(en.errors.INVALID_CREDENTIALS)).toBeTruthy());
    const [call] = callsTo('POST', '/auth/login');
    expect(call.body).toEqual({
      identifier: 'owner@example.com',
      password: 'wrong-password',
      deviceName: expect.stringContaining('ResiSmart Business'),
    });
    // Still there after the failure — the way in for a passwordless account.
    expect(screen.getByRole('button', { name: named(en.auth.login.otpButton) })).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────── change password
describe('Change password', () => {
  it('on success the NEW token, refresh token and context are stored', async () => {
    await seedSession();
    setRoutes({
      'POST /auth/change-password': {
        success: true,
        token: 'new-access',
        refreshToken: 'new-refresh',
        activeContext: partnerCtx('p1'),
        availableContexts: [partnerCtx('p1')],
      },
    });
    await renderScreen(withAuth(<ChangePasswordScreen />));
    await waitFor(() => expect(screen.getAllByTestId('text-input-outlined')).toHaveLength(3));

    await fireEvent.changeText(field(0), 'old-password-123');
    await fireEvent.changeText(field(1), 'a-much-longer-passphrase');
    await fireEvent.changeText(field(2), 'a-much-longer-passphrase');
    await fireEvent.press(screen.getByRole('button', { name: named(en.account.password.submit) }));

    await waitFor(() => expect(screen.getByText(en.account.password.done)).toBeTruthy());
    expect(callsTo('POST', '/auth/change-password')[0].body).toEqual({
      currentPassword: 'old-password-123',
      newPassword: 'a-much-longer-passphrase',
    });
    expect(await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN)).toBe('new-access');
    expect(await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN)).toBe('new-refresh');
    expect(JSON.parse((await SecureStore.getItemAsync(STORAGE_KEYS.USER_PROFILE))!).contextId).toBe('partner:p1');
  });

  it('a wrong current password is said in our words and the old tokens stay', async () => {
    await seedSession();
    setRoutes({ 'POST /auth/change-password': fail(400, { code: 'CURRENT_PASSWORD_WRONG', error: 'x' }) });
    await renderScreen(withAuth(<ChangePasswordScreen />));
    await waitFor(() => expect(screen.getAllByTestId('text-input-outlined')).toHaveLength(3));
    await fireEvent.changeText(field(0), 'nope');
    await fireEvent.changeText(field(1), 'a-much-longer-passphrase');
    await fireEvent.changeText(field(2), 'a-much-longer-passphrase');
    await fireEvent.press(screen.getByRole('button', { name: named(en.account.password.submit) }));
    await waitFor(() => expect(screen.getByText(en.errors.CURRENT_PASSWORD_WRONG)).toBeTruthy());
    expect(await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN)).toBe('old-refresh');
  });
});

// ─────────────────────────────────────────────────────────── devices
describe('Signed-in devices', () => {
  const sessions = {
    success: true,
    data: {
      hasPassword: true,
      sessions: [
        { id: 's-here', deviceLabel: 'ResiSmart Business · android', method: 'OTP', createdAt: '2026-09-28T10:00:00.000Z', lastUsedAt: '2026-09-29T10:00:00.000Z', current: true },
        { id: 's-other', deviceLabel: 'Chrome on Windows', method: 'PASSWORD', createdAt: '2026-09-20T10:00:00.000Z', lastUsedAt: null, current: false },
      ],
    },
  };

  it('lists the devices, marks this one, and signs the other one out', async () => {
    await seedSession();
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    setRoutes({ 'GET /auth/sessions': sessions, 'DELETE /auth/sessions/s-other': { success: true } });
    await renderScreen(withAuth(<DevicesScreen />));

    await waitFor(() => expect(screen.getByText('Chrome on Windows')).toBeTruthy());
    expect(screen.getByText(en.account.devices.thisDevice)).toBeTruthy();
    // One "Sign out" button: only the OTHER device has one.
    const buttons = screen.getAllByRole('button', { name: new RegExp(`^.*${en.account.devices.signOut}$`) });
    expect(buttons).toHaveLength(1);
    await fireEvent.press(buttons[0]);

    await waitFor(() => expect(screen.getByText(en.account.devices.signedOut)).toBeTruthy());
    expect(callsTo('DELETE', '/auth/sessions/s-other')).toHaveLength(1);
    expect(callsTo('DELETE', '/auth/sessions/s-here')).toHaveLength(0);
    // hasPassword → the change-password entry is offered here too.
    expect(screen.getByText(en.account.devices.changePassword)).toBeTruthy();
  });

  it('"Sign out of all devices" posts everywhere:true with this device\'s refresh token', async () => {
    await seedSession();
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    setRoutes({ 'GET /auth/sessions': sessions, 'POST /auth/logout': { success: true } });
    await renderScreen(withAuth(<DevicesScreen />));
    await waitFor(() => expect(screen.getByText('Chrome on Windows')).toBeTruthy());

    await fireEvent.press(screen.getByRole('button', { name: named(en.account.devices.everywhere) }));
    await waitFor(() => expect(callsTo('POST', '/auth/logout')).toHaveLength(1));
    expect(callsTo('POST', '/auth/logout')[0].body).toEqual({ refreshToken: 'old-refresh', everywhere: true });
    await waitFor(async () => expect(await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN)).toBeNull());
  });

  it('M03 H1: "Sign out of all devices" drops this device\'s push row FIRST and sends pushToken', async () => {
    await seedSession();
    await store.set(DEVICE_KEYS.PUSH_TOKEN, 'ExponentPushToken[here]');
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    setRoutes({
      'GET /auth/sessions': sessions,
      'POST /auth/logout': { success: true },
      'DELETE /notifications/devices': { success: true },
    });
    await renderScreen(withAuth(<DevicesScreen />));
    await waitFor(() => expect(screen.getByText('Chrome on Windows')).toBeTruthy());

    await fireEvent.press(screen.getByRole('button', { name: named(en.account.devices.everywhere) }));
    await waitFor(() => expect(callsTo('POST', '/auth/logout')).toHaveLength(1));
    expect(callsTo('POST', '/auth/logout')[0].body).toEqual({
      refreshToken: 'old-refresh', everywhere: true, pushToken: 'ExponentPushToken[here]',
    });
    const del = callsTo('DELETE', '/notifications/devices');
    expect(del).toHaveLength(1);
    // The DELETE went out before the everywhere-logout (while the bearer was valid).
    expect(calls.indexOf(del[0])).toBeLessThan(calls.indexOf(callsTo('POST', '/auth/logout')[0]));
    await waitFor(async () => expect(await store.get(DEVICE_KEYS.PUSH_TOKEN)).toBeNull());
  });
});

// ─────────────────────────────────────────────────────────── refresh
describe('refresh — rotation and stale context', () => {
  it('stores the ROTATED refresh token', async () => {
    await seedSession();
    const post = jest.spyOn(axios, 'post').mockResolvedValueOnce({
      data: { token: 'a2', refreshToken: 'r2', activeContext: partnerCtx('p1'), availableContexts: [partnerCtx('p1')] },
    });
    await expect(refreshSession()).resolves.toBe('a2');
    expect(post.mock.calls[0][1]).toMatchObject({ refreshToken: 'old-refresh', contextId: 'partner:p1' });
    expect(await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN)).toBe('r2');
    expect(await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN)).toBe('a2');
  });

  it('403 CONTEXT_NOT_AVAILABLE → refresh again WITHOUT a context, keep the partner session', async () => {
    await seedSession(partnerCtx('gone'));
    const post = jest.spyOn(axios, 'post')
      .mockRejectedValueOnce(refusal(403, { code: 'CONTEXT_NOT_AVAILABLE', error: 'Unauthorized context request' }))
      .mockResolvedValueOnce({
        data: { token: 'a3', refreshToken: 'r3', activeContext: partnerCtx('p2'), availableContexts: [partnerCtx('p2')] },
      });
    await expect(refreshSession()).resolves.toBe('a3');
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toEqual({ refreshToken: 'old-refresh' });
    expect(await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN)).toBe('r3');
    expect(JSON.parse((await SecureStore.getItemAsync(STORAGE_KEYS.USER_PROFILE))!).contextId).toBe('partner:p2');
  });

  it('only a 401 from the refresh ends the session; a 503 or a network failure does not', async () => {
    await seedSession();
    jest.spyOn(axios, 'post').mockRejectedValueOnce(refusal(401, { code: 'REFRESH_REUSED' }));
    const rejected = await refreshSession().catch((e) => e);
    expect(endsSession(rejected)).toBe(true);

    jest.spyOn(axios, 'post').mockRejectedValueOnce(refusal(503, { code: 'REFRESH_UNAVAILABLE' }));
    const unavailable = await refreshSession().catch((e) => e);
    expect(endsSession(unavailable)).toBe(false);

    jest.spyOn(axios, 'post').mockRejectedValueOnce(Object.assign(new Error('Network Error'), { isAxiosError: true }));
    const offline = await refreshSession().catch((e) => e);
    expect(endsSession(offline)).toBe(false);
  });
});
