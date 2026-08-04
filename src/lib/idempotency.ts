/**
 * A key that makes a create request safe to send twice.
 *
 * The rule (PARTNERS_PLAN §12.5): mint the key when the PARTNER decides to
 * create the thing, store it with the draft, and send the same key on every
 * retry of that decision. Minting one inside the retry — or inside the request
 * helper — is the bug this file exists to prevent: a half-sent invoice on a
 * dying connection is retried with a fresh key and the shop bills the customer
 * twice, which is the one class of mistake a billing app does not get forgiven
 * for.
 *
 * Not a cryptographic identifier and does not need to be. It only has to be
 * unique among the requests one device makes, and to survive being written to
 * disk and read back — see `DEVICE_KEYS.INVOICE_DRAFTS`. `expo-crypto` is not
 * installed and would be a native module added for no gain here.
 */
const HEX = '0123456789abcdef';

function randomHex(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += HEX[Math.floor(Math.random() * 16)];
  }
  return out;
}

/**
 * The millisecond prefix is what stops two keys minted in the same tick from
 * colliding on a device whose `Math.random` is seeded poorly — and it makes a
 * key readable in a server log, which matters when somebody is working out
 * which of two near-identical requests actually landed.
 */
export function newIdempotencyKey(prefix = 'shop'): string {
  return `${prefix}-${Date.now().toString(36)}-${randomHex(16)}`;
}
