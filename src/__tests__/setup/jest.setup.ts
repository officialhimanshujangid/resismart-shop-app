/**
 * Shared jest setup for the shop app, mirroring mobile-guard's:
 *
 *  - the one axios instance (`apiClient` in src/api/axios) is replaced by a
 *    routed fake (./mockApi); every other export of that module
 *    (apiErrorMessage, apiErrorCode, unwrap, …) stays real;
 *  - expo-router is reduced to recorded calls (./mockRouter);
 *  - native modules (secure store, storage, netinfo, safe area) are fakes;
 *  - i18next is initialised in English; a test may switch to Hindi and is
 *    switched back afterwards.
 *
 * `require()` throughout, not `import`: jest hoists `jest.mock` above the
 * imports, so a factory may only reach a module lazily.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('../../api/axios', () => {
  const actual = jest.requireActual('../../api/axios');
  return { ...actual, apiClient: require('./mockApi').mockApi };
});
jest.mock('expo-router', () => require('./mockRouter'));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-secure-store', () => {
  const mem = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => mem.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => { mem.set(k, v); }),
    deleteItemAsync: jest.fn(async (k: string) => { mem.delete(k); }),
  };
});
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

require('../../i18n').initI18n('en');

/*
  A screen that throws AFTER its data arrives is only LOGGED by the test
  renderer, not thrown — collected here so it fails the test (same as guard).
*/
const renderErrors: unknown[] = [];
const consoleError = console.error;
const BENIGN = [/not wrapped in act\(/, /^Query data cannot be undefined/];
console.error = (...args: unknown[]) => {
  const first = typeof args[0] === 'string' ? args[0] : '';
  if (/^(Uncaught|Caught) error:/.test(first)) renderErrors.push(args[1]);
  if (BENIGN.some((re) => re.test(first))) return;
  consoleError(...args);
};

afterEach(async () => {
  if (renderErrors.length) {
    const first = renderErrors[0];
    renderErrors.length = 0;
    throw first instanceof Error ? first : new Error(String(first));
  }
});

afterEach(async () => {
  require('./mockApi').resetApi();
  require('./mockRouter').setParams({});
  require('@tanstack/react-query').onlineManager.setOnline(true);
  const i18next = require('i18next');
  await (i18next.default ?? i18next).changeLanguage('en');
  jest.clearAllMocks();
});
