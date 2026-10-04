// >>> OWNER-0310
/**
 * Partner signup, shop app — the business is created at the END OF STEP 2,
 * with the real address, exactly like the web wizard:
 *  - step 1 (identity + both OTPs) creates nothing — no `register-public`;
 *  - "Create my business" on step 2 sends `register-public` ONCE with the real
 *    address / city / state / pincode / lat / lng (no placeholder), then asks
 *    for the sign-in code and opens `verify-otp`;
 *  - a lapsed receipt (PARTNER_SIGNUP_*_NOT_VERIFIED) drops the receipts and
 *    sends the partner back to step 1 with the coded sentence;
 *  - PARTNER_NAME_TAKEN goes back to step 1 with the receipts kept.
 */
import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import RegisterScreen from '../../app/(auth)/register';
import { callsTo, fail, setRoutes } from './setup/mockApi';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';

const mockAuth = {
  isAuthenticated: false,
  logout: jest.fn(async () => undefined),
  requestLoginOtp: jest.fn(async () => ({
    success: true,
    delivery: { message: 'Code sent by SMS', deliveredVia: 'SMS', alternatives: [], whatsappAvailable: false },
  })),
};
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }));
// The real map is a native view; the two coordinate boxes under it are what the step reads.
jest.mock('../components/MapPicker', () => ({ MapPicker: () => null }));
jest.mock('expo-location', () => ({ reverseGeocodeAsync: jest.fn(async () => []) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('../lib/google', () => ({
  isGoogleAvailable: () => false,
  getGoogleIdToken: jest.fn(),
  GoogleCancelled: class GoogleCancelled extends Error {},
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { router } = require('expo-router') as { router: { push: jest.Mock; replace: jest.Mock } };

const R = en.auth.register;
const REGISTER = '/partners/register-public';
const field = (i: number) => screen.getAllByTestId('text-input-outlined')[i];

const baseRoutes = {
  'POST /auth/otp/request': { message: 'Code sent', deliveredVia: 'SMS', alternatives: [], whatsappAvailable: false },
  'POST /auth/otp/verify': (call: { body?: unknown }) => ({
    verificationToken: `receipt-${(call.body as { channel: string }).channel}-0123456789`,
  }),
};

async function finishStep1() {
  await renderScreen(<PaperProvider><RegisterScreen /></PaperProvider>);
  expect(screen.getByText(R.step1Title)).toBeTruthy();
  // This testing-library's fireEvent is async (it wraps its own act) — awaited, never nested in act().
  await fireEvent.changeText(field(0), 'Sharma Kirana');
  await fireEvent.changeText(field(1), '9876543210');
  await fireEvent.changeText(field(2), 'ravi@shop.in');
  await fireEvent.changeText(field(3), 'kirana-shop-secret1');
  await fireEvent.changeText(field(4), 'kirana-shop-secret1');
  await fireEvent.press(screen.getByText(R.sendCodes));
  await screen.findByText(R.verifyAndContinue);
  await fireEvent.changeText(field(5), '123456'); // email code
  await fireEvent.changeText(field(6), '654321'); // phone code
  await fireEvent.press(screen.getByText(R.verifyAndContinue));
  await screen.findByText(R.step2Title);
}

async function fillStep2() {
  // Step 2 inputs in screen order: latitude, longitude, address, city, state, pincode.
  await fireEvent.changeText(field(0), '19.076');
  await fireEvent.changeText(field(1), '72.8777');
  await fireEvent.changeText(field(2), '12 Station Road, Andheri East');
  await fireEvent.changeText(field(3), 'Mumbai');
  await fireEvent.changeText(field(4), 'Maharashtra');
  await fireEvent.changeText(field(5), '400069');
}

const press = async (label: string) => { await fireEvent.press(screen.getByText(label)); };

beforeEach(() => {
  mockAuth.isAuthenticated = false;
});

describe('partner signup — business created at step 2, like the web', () => {
  it('step 1 verifies both contacts and creates NOTHING', async () => {
    setRoutes(baseRoutes);
    await finishStep1();

    expect(callsTo('POST', '/auth/otp/verify')).toHaveLength(2);
    expect(callsTo('POST', REGISTER)).toHaveLength(0);
    expect(mockAuth.requestLoginOtp).not.toHaveBeenCalled();
    // Step 2 says plainly that nothing exists yet.
    expect(screen.getByText(R.createNote)).toBeTruthy();
  });

  it('step 2 sends register-public once with the real address and pin, then signs in', async () => {
    setRoutes({ ...baseRoutes, [`POST ${REGISTER}`]: { message: 'ok', onboarding: { missing: [] } } });
    await finishStep1();
    await fillStep2();
    await press(R.createBusiness);

    await waitFor(() => expect(callsTo('POST', REGISTER)).toHaveLength(1));
    const body = callsTo('POST', REGISTER)[0].body as Record<string, unknown>;
    expect(body).toEqual({
      name: 'Sharma Kirana',
      address: '12 Station Road, Andheri East',
      contactNumber: '9876543210',
      adminEmail: 'ravi@shop.in',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400069',
      latitude: 19.076,
      longitude: 72.8777,
      emailVerificationToken: 'receipt-EMAIL-0123456789',
      phoneVerificationToken: 'receipt-PHONE-0123456789',
      password: 'kirana-shop-secret1',
    });
    expect(JSON.stringify(body)).not.toMatch(/To be confirmed/);

    await waitFor(() => expect(mockAuth.requestLoginOtp).toHaveBeenCalledWith('9876543210'));
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(auth)/verify-otp', params: expect.objectContaining({ identifier: '9876543210' }) }),
    );

    // A second press (back from the code screen) signs in again — it never creates twice.
    await screen.findByText(R.signInToContinue);
    await press(R.signInToContinue);
    await waitFor(() => expect(mockAuth.requestLoginOtp).toHaveBeenCalledTimes(2));
    expect(callsTo('POST', REGISTER)).toHaveLength(1);
  });

  it('a NOT_VERIFIED refusal drops the receipts and goes back to step 1 with the reason', async () => {
    setRoutes({
      ...baseRoutes,
      [`POST ${REGISTER}`]: fail(400, { code: 'PARTNER_SIGNUP_EMAIL_NOT_VERIFIED', error: 'server words' }),
    });
    await finishStep1();
    await fillStep2();
    await press(R.createBusiness);

    await screen.findByText(R.step1Title);
    // Receipts gone: the codes have to be sent again.
    expect(screen.getByText(R.sendCodes)).toBeTruthy();
    expect(screen.queryByText(R.continue)).toBeNull();
    expect(
      screen.getByText(`${en.errors.PARTNER_SIGNUP_EMAIL_NOT_VERIFIED} ${R.verifyAgain}`),
    ).toBeTruthy();
    expect(mockAuth.requestLoginOtp).not.toHaveBeenCalled();
    expect(callsTo('POST', REGISTER)).toHaveLength(1);
  });

  it('PARTNER_NAME_TAKEN goes back to step 1 with the receipts kept and the address remembered', async () => {
    setRoutes({
      ...baseRoutes,
      [`POST ${REGISTER}`]: fail(409, { code: 'PARTNER_NAME_TAKEN', error: 'server words' }),
    });
    await finishStep1();
    await fillStep2();
    await press(R.createBusiness);

    await screen.findByText(R.step1Title);
    expect(screen.getByText(en.errors.PARTNER_NAME_TAKEN)).toBeTruthy();
    // Still verified — rename and continue, no new codes.
    expect(screen.getByText(R.continue)).toBeTruthy();
    await fireEvent.changeText(field(0), 'Sharma Kirana Andheri');
    await press(R.continue);
    await screen.findByText(R.step2Title);
    expect(field(2).props.value).toBe('12 Station Road, Andheri East');
  });
});
// <<< OWNER-0310
