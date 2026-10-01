/**
 * Final QA compatibility — the duplicate-GSTIN refusal is OPT-IN on the server.
 *
 * The party form opts in with `checkDuplicateGstin: true` on its first save;
 * on the 409 PARTY_GSTIN_ALREADY_USED it asks once and repeats the save with
 * `confirmDuplicateGstin: true` (the existing confirm-and-retry flow).
 */
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import PartyFormScreen from '../../app/(app)/parties/new';
import { callsTo, fail, setRoutes } from './setup/mockApi';
import { setParams } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';

jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({ can: () => true, hasModule: () => true, ready: true, entitlements: { isAdmin: true }, roleLimits: {} }),
  usePlanUsage: () => ({
    capacity: () => ({ included: false, used: 0, limit: null, atLimit: false, fraction: null, comingSoon: false }),
  }),
}));

const field = (i: number) => screen.getAllByTestId('text-input-outlined')[i];
const pressAlertButton = async (label: string) => {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const buttons = calls[calls.length - 1][2] as { text: string; onPress?: () => void }[];
  await act(async () => { buttons.find((b) => b.text === label)!.onPress!(); });
};

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('party form — duplicate GSTIN check is opted into', () => {
  it('sends checkDuplicateGstin on the first save, then confirmDuplicateGstin after the 409', async () => {
    setParams({});
    let n = 0;
    setRoutes({
      'POST /partners/me/parties': (call: { body?: unknown }) => {
        n += 1;
        const b = call.body as Record<string, unknown>;
        if (b.checkDuplicateGstin === true && !b.confirmDuplicateGstin) {
          return fail(409, { code: 'PARTY_GSTIN_ALREADY_USED', params: { name: 'Metro Pune' } });
        }
        return { success: true, data: { _id: 'p9', name: 'Metro Mumbai', kind: 'CUSTOMER' } };
      },
    });
    await renderScreen(<PaperProvider><PartyFormScreen /></PaperProvider>);
    await fireEvent.changeText(field(0), 'Metro Mumbai');
    await fireEvent.changeText(field(1), '9811100009');
    await fireEvent.changeText(field(3), '27ABCDE1234F1Z5');
    const buttons = screen.getAllByText(en.parties.form.addTitle);
    await fireEvent.press(buttons[buttons.length - 1]);

    await waitFor(() => expect(callsTo('POST', '/partners/me/parties')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/parties')[0].body).toMatchObject({ checkDuplicateGstin: true, gstin: '27ABCDE1234F1Z5' });
    expect(callsTo('POST', '/partners/me/parties')[0].body).not.toHaveProperty('confirmDuplicateGstin');
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    await pressAlertButton(en.parties.form.duplicateGstinConfirm);
    await waitFor(() => expect(callsTo('POST', '/partners/me/parties')).toHaveLength(2));
    const retry = callsTo('POST', '/partners/me/parties')[1].body as Record<string, unknown>;
    expect(retry).toMatchObject({ confirmDuplicateGstin: true, gstin: '27ABCDE1234F1Z5', name: 'Metro Mumbai' });
    expect(retry.checkDuplicateGstin).toBeUndefined();
    expect(n).toBe(2);
  });
});
