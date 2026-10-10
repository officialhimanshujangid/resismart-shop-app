/**
 * E-VISUAL-APPS (2026-10-10) — every shop screen renders: light, dark and Hindi.
 *
 * Walks `app/`, renders each route's default export (inside Paper + the kit toast
 * provider, as a signed-in shop owner with every module open) on the EMPTY server,
 * three times: light/English, dark/English, light/Hindi. A crash — including one
 * thrown after data lands, which the shared setup turns into a failure — fails the
 * screen; so does a translation key i18next could not find (it draws the raw key).
 *
 * The dark pass is the point: the shop follows the phone again from 2026-10-10
 * (the 1R forced-light import was retired after the END dark scan).
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import i18n from 'i18next';
import { act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { renderScreen } from './setup/harness';
import { ToastProvider } from '../components/ui';

const mockScheme = { value: 'light' as 'light' | 'dark' };
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme.value,
}));

// The signed-in owner. Any auth action a screen reaches for is a resolved no-op.
const mockAuthState: Record<string, unknown> = {
  isAuthenticated: true,
  isLoading: false,
  token: 'smoke-token',
  user: { _id: 'u1', name: 'Ravi', phone: '9876543210', email: 'ravi@shop.in' },
  profile: { role: 'PARTNER_ADMIN', tenantType: 'PARTNER', tenantId: 'p1', contextId: 'partner:p1', tenantName: 'Sharma Kirana' },
  availableContexts: [],
};
jest.mock('../context/AuthContext', () => {
  const auth = new Proxy(mockAuthState, {
    get: (target, key: string) => (key in target ? target[key] : jest.fn(async () => undefined)),
  });
  return {
    useAuth: () => auth,
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
// Every module open, every permission granted — so each screen draws its real body.
jest.mock('../hooks', () => {
  const actual = jest.requireActual('../hooks');
  const full = {
    entitlements: actual.CLOSED_ENTITLEMENTS, loading: false, ready: true, failed: false,
    can: () => true, hasModule: () => true, moduleState: () => 'ON', menu: [], roleLimits: {}, refresh: () => {},
  };
  return { ...actual, usePartnerEntitlements: () => full };
});

// The scanner's beep: expo-audio has no native module under jest.
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => {}), remove: jest.fn(), volume: 1 }),
  setAudioModeAsync: jest.fn(async () => {}),
  AudioPlayer: class {},
}));

// The font package ships untranspiled ESM; the screens only need the names.
jest.mock('@expo-google-fonts/sora', () => ({ useFonts: () => [true, null], Sora_500Medium: 1, Sora_600SemiBold: 1, Sora_700Bold: 1 }));

jest.setTimeout(90_000);

const APP = path.join(__dirname, '..', '..', 'app');
function routes(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) routes(p, out);
    else if (/\.tsx$/.test(e.name) && !/^_layout\.tsx$|^\+(html|not-found)\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}
const SCREENS = routes(APP).map((f) => path.relative(APP, f).split(path.sep).join('/')).sort();

function paramsFor(rel: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const m of rel.matchAll(/\[(?:\.\.\.)?(\w+)\]/g)) params[m[1]] = 'smoke-1';
  return params;
}

const missing: string[] = [];
beforeAll(() => {
  i18n.options.saveMissing = true;
  i18n.options.missingKeyHandler = (_lngs: readonly string[], _ns: string, key: string) => { missing.push(key); };
});
afterAll(() => {
  i18n.options.saveMissing = false;
  i18n.options.missingKeyHandler = false;
});
afterEach(() => { mockScheme.value = 'light'; });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); });

describe('every shop screen renders in light, dark and Hindi', () => {
  it('found the route tree', () => {
    expect(SCREENS.length).toBeGreaterThan(100);
  });

  it.each(SCREENS)('%s', async (rel) => {
    const { setParams } = require('./setup/mockRouter'); // eslint-disable-line @typescript-eslint/no-require-imports
    const mod = require(path.join(APP, rel)); // eslint-disable-line @typescript-eslint/no-require-imports
    const Screen = mod.default as React.ComponentType | undefined;
    if (typeof Screen !== 'function') return;
    const variants: { name: string; scheme: 'light' | 'dark'; lang: 'en' | 'hi' }[] = [
      { name: 'light/en', scheme: 'light', lang: 'en' },
      { name: 'dark/en', scheme: 'dark', lang: 'en' },
      { name: 'light/hi', scheme: 'light', lang: 'hi' },
    ];
    for (const v of variants) {
      missing.length = 0;
      mockScheme.value = v.scheme;
      setParams(paramsFor(rel));
      const r = await renderScreen(<PaperProvider><ToastProvider><Screen /></ToastProvider></PaperProvider>, { lang: v.lang });
      await flush();
      expect({ variant: v.name, missing: [...new Set(missing)] }).toEqual({ variant: v.name, missing: [] });
      await r.unmount();
    }
  });
});
