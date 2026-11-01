// SY (2026-10-30 system audit)
/**
 * B1 — the stored push scope key carries the app VERSION, so an updated build
 * (same Expo token) re-registers once and the server stores its new appVersion.
 * M4 — the stored value carries when it was registered; the hook sends it again
 * on return to the foreground once it is a day old (a token the server deleted
 * comes back by itself). The hook's skip test is `pushRegistrationFresh`.
 */
import {
  SHOP_APP_VERSION, PUSH_REREGISTER_MS, pushRegistrationDue, pushRegistrationFresh, pushScopeKey, stampPushScope, storedScopeKey,
} from '../lib/appIdentity';

const ID = '65f0000000000000000000a1';
const TOKEN = 'ExponentPushToken[sy]';

describe('SY — push re-registration', () => {
  it('the key names this build; the previous build is not "fresh"', () => {
    const key = pushScopeKey(ID);
    expect(key).toContain(`@${SHOP_APP_VERSION}`);
    const older = key.replace(`@${SHOP_APP_VERSION}`, '@0.0.1');
    expect(pushRegistrationFresh(TOKEN, stampPushScope(older), TOKEN, key)).toBe(false);
    expect(pushRegistrationFresh(TOKEN, stampPushScope(key), TOKEN, key)).toBe(true);
  });

  it('a registration a day old is due again; a pre-SY value (no stamp) is due once', () => {
    const now = Date.now();
    const key = pushScopeKey(ID);
    expect(pushRegistrationDue(stampPushScope(key, now - 60_000), now)).toBe(false);
    expect(pushRegistrationDue(stampPushScope(key, now - PUSH_REREGISTER_MS), now)).toBe(true);
    expect(pushRegistrationDue(key, now)).toBe(true);
    expect(pushRegistrationDue(null, now)).toBe(true);
    expect(storedScopeKey(stampPushScope(key, now))).toBe(key);
    expect(pushRegistrationFresh(TOKEN, stampPushScope(key, now - PUSH_REREGISTER_MS - 1), TOKEN, key, now)).toBe(false);
  });
});
// <<< SY
