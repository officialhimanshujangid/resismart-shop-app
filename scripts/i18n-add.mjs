/**
 * Add or update a namespace in BOTH message catalogues at once.
 *
 * Written because the alternative — hand-editing two JSON files in parallel — is
 * how the two drift. `en.json` and `hi.json` must carry exactly the same key
 * set: a key present in one and missing from the other is either a reader seeing
 * a raw dotted key, or a Hindi reader silently getting English with nothing to
 * reveal it. This writes the same shape to both files from one source, so they
 * cannot disagree by construction.
 *
 *   node scripts/i18n-add.mjs <payload.json>
 *
 * The payload is `{ "<namespace>": { en: {...}, hi: {...} } }` — the two halves
 * side by side while they are being written, which is also the only way to
 * review a translation.
 *
 * Merges rather than replaces, so re-running with a subset adds to a namespace
 * instead of truncating it.
 *
 * Copied from `mobile-society/scripts/i18n-add.mjs`; only the catalogue paths
 * differ (`locales/`, matching the guard app's layout, not `messages/`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const MESSAGES = {
  en: resolve(here, '../src/i18n/locales/en.json'),
  hi: resolve(here, '../src/i18n/locales/hi.json'),
};

/** Deep merge, with the incoming value winning on a leaf. */
function merge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object'
      ? merge(base[k], v)
      : v;
  }
  return out;
}

/**
 * Wrap a half in the objects its namespace names.
 *
 * A namespace here is a PATH — "billing.new", not a key literally called
 * "billing.new". Without this the script writes the dotted string as a top-level
 * key, which every catalogue check passes (both files get the same wrong shape)
 * and which the translator then cannot see, so the screen renders raw dotted
 * keys and nothing anywhere says why.
 */
function nest(namespace, half) {
  return namespace.split('.').reduceRight((acc, part) => ({ [part]: acc }), half);
}

/** Every dotted leaf path in an object, for the parity check below. */
function leaves(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...leaves(v, path));
    else out.push(path);
  }
  return out;
}

const payloadPath = process.argv[2];
if (!payloadPath) {
  console.error('usage: node scripts/i18n-add.mjs <payload.json>');
  process.exit(1);
}
const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));

for (const locale of ['en', 'hi']) {
  const file = MESSAGES[locale];
  const current = JSON.parse(readFileSync(file, 'utf8'));
  let next = current;
  for (const [namespace, halves] of Object.entries(payload)) {
    const half = halves[locale];
    if (!half) {
      console.error(`! ${namespace} has no '${locale}' half — refusing to write a half-translated namespace.`);
      process.exit(1);
    }
    next = merge(next, nest(namespace, half));
  }
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

// Parity is checked AFTER writing rather than trusted: the whole point of this
// script is that the two files agree, and the cheapest place to prove it is
// here, every time, rather than in a lint nobody runs.
const en = leaves(JSON.parse(readFileSync(MESSAGES.en, 'utf8')));
const hi = leaves(JSON.parse(readFileSync(MESSAGES.hi, 'utf8')));
const onlyEn = en.filter(k => !hi.includes(k));
const onlyHi = hi.filter(k => !en.includes(k));
if (onlyEn.length || onlyHi.length) {
  console.error(`! catalogues disagree — en-only: ${onlyEn.slice(0, 10).join(', ')} | hi-only: ${onlyHi.slice(0, 10).join(', ')}`);
  process.exit(1);
}
console.log(`ok — ${en.length} keys, both catalogues in step`);
