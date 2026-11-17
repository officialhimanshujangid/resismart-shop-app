/**
 * PARITY (PAY-E Phase C skip, same as the society app) — a push that carries a bill pay
 * link (`data.payUrl`, `<web>/pay/b/<token>`) opens it directly; anything else is ignored.
 */
let mockListener: ((r: unknown) => void) | null = null;
jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn((fn: (r: unknown) => void) => { mockListener = fn; return { remove: jest.fn() }; }),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { appOwnership: null } }));
jest.mock('expo-linking', () => ({ openURL: jest.fn(async () => true) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
import { renderHook } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { payUrlFromPush } from '../lib/pay-url';
import { useNotificationTaps } from '../hooks/useNotificationTaps';

const tap = (id: string, data: Record<string, unknown>) => ({ notification: { request: { identifier: id, content: { data } } } });

describe('push pay link', () => {
  it('accepts only an http(s) /pay/b/<token> link', () => {
    expect(payUrlFromPush({ payUrl: 'https://resismart.in/pay/b/tok_1' })).toBe('https://resismart.in/pay/b/tok_1');
    expect(payUrlFromPush({ payUrl: 'upi://pay?pa=x' })).toBeNull();
    expect(payUrlFromPush({ payUrl: 'https://resismart.in/dashboard' })).toBeNull();
    expect(payUrlFromPush(null)).toBeNull();
  });

  it('a tap with payUrl opens the pay page; without it, the normal route', async () => {
    await renderHook(() => useNotificationTaps({ enabled: true, ready: true, hasModule: () => true }));
    const N = require('expo-notifications'); const C = require('expo-constants');
    expect([N.addNotificationResponseReceivedListener.mock?.calls?.length, C.default?.appOwnership, typeof mockListener]).toEqual([1, null, 'function']);
    mockListener!(tap('n1', { payUrl: 'https://resismart.in/pay/b/tok_1', link: '', kind: 'BILL_READY' }));
    expect(Linking.openURL).toHaveBeenCalledWith('https://resismart.in/pay/b/tok_1');
    expect(router.push).not.toHaveBeenCalled();
    mockListener!(tap('n2', { payUrl: 'javascript:alert(1)', link: '', kind: '' }));
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/notifications');
  });
});
