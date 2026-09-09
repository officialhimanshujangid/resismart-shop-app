/**
 * THE GUARD THAT KEEPS EN AND HI IN STEP.
 *
 *   node scripts/i18n-check.mjs
 *
 * Exits non-zero when the two catalogues disagree, so this belongs in CI beside
 * the typecheck. Deliberately separate from `i18n-add.mjs`: that one checks what
 * IT just wrote, which cannot catch a key added by hand, a merge that resolved
 * badly, or a namespace deleted from one file only.
 *
 * WHAT IT CHECKS, and why each is a real failure rather than untidiness:
 *
 *   1. **A key in one catalogue and not the other.** Asymmetric and both bad: a
 *      key only in `en` shows a Hindi reader the English (`fallbackLng: 'en'`)
 *      with nothing anywhere to reveal it, and a key only in `hi` is dead weight
 *      nothing can reach. Neither shows up in a typecheck.
 *
 *   2. **An empty string** — renders as nothing at all, which reads as a broken
 *      screen rather than as a missing translation, so nobody reports it.
 *
 *   3. **A leaf that is a string in one file and an object in the other**, which
 *      is what a half-applied namespace edit looks like.
 *
 *   4. **Placeholder drift.** `{{count}}` in the English and missing from the
 *      Hindi is the failure nobody reports: the Hindi still reads as a
 *      grammatical sentence and simply tells the reader less. On this app that
 *      sentence is often a rupee amount or an invoice number.
 *
 *   5. **Every literal key the code asks for exists.**
 *
 * Untranslated-but-identical strings are NOT a failure — a proper noun, a GSTIN
 * and a brand name are legitimately the same in both languages, and flagging
 * them trains everybody to ignore the output.
 *
 * Copied from `mobile-guard/scripts/i18n-check.mjs` with two corrections, both
 * of which had silently disabled a whole check there:
 *
 *   • the placeholder regex was `%{name}` (i18n-js), while these catalogues and
 *     guard's are i18next `{{name}}` — so check 4 matched nothing and had never
 *     fired on any key in either app;
 *   • the namespace scanner looked for `useTranslations(` (next-intl), while
 *     both apps call `useTranslation(` — so scoped keys in check 5 resolved
 *     against an empty prefix list.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative, sep } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FILES = {
  en: resolve(here, '../src/i18n/locales/en.json'),
  hi: resolve(here, '../src/i18n/locales/hi.json'),
};

/** Every dotted leaf path → its value. */
function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, path, out);
    else out.set(path, v);
  }
  return out;
}

/**
 * i18next interpolation is `{{name}}`.
 *
 * NOT `%{name}`, which is what the copy of this script in `mobile-guard` looks
 * for — that is i18n-js syntax, inherited from the resident app, and against
 * i18next catalogues it matches nothing at all. This check reports zero problems
 * whether or not there are any until this regex is right.
 */
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const slots = (text) =>
  typeof text === 'string' ? new Set([...text.matchAll(PLACEHOLDER)].map(m => m[1])) : new Set();

/**
 * THE ONE EXEMPTION, and it is a real linguistic fact rather than a shortcut.
 *
 * CLDR puts BOTH 0 and 1 in the `one` category for Hindi; English puts only 1
 * there. So an English `one` form is always describing precisely one thing and
 * can write the word out — "1 item" — while the Hindi `one` form has to cover
 * "0 वस्तु" and "1 वस्तु" and therefore MUST interpolate `{{count}}`.
 *
 * That is not drift; it is the two languages counting differently, and the Hindi
 * is the one that is right. Flagging it would mean either a permanently red
 * check or a translator "fixing" the Hindi into being wrong at zero.
 *
 * Narrow on purpose: only a `_one` leaf, only when it is the HINDI that has the
 * extra slot. The reverse — English interpolating where Hindi does not — is
 * still a failure, because that direction has no linguistic justification.
 */
const isHindiPluralOne = (key, slot) => key.endsWith('_one') && slot === 'count';

const en = flatten(JSON.parse(readFileSync(FILES.en, 'utf8')));
const hi = flatten(JSON.parse(readFileSync(FILES.hi, 'utf8')));

const problems = [];

for (const key of en.keys()) if (!hi.has(key)) problems.push(`missing from hi: ${key}`);
for (const key of hi.keys()) if (!en.has(key)) problems.push(`missing from en: ${key}`);

for (const [key, value] of en) {
  if (!hi.has(key)) continue;
  const other = hi.get(key);

  if (typeof value !== typeof other) {
    problems.push(`type differs (${typeof value} vs ${typeof other}): ${key}`);
    continue;
  }
  if (typeof value === 'string') {
    if (!value.trim()) problems.push(`empty in en: ${key}`);
    if (!String(other).trim()) problems.push(`empty in hi: ${key}`);

    const a = slots(value);
    const b = slots(other);
    for (const s of a) if (!b.has(s)) problems.push(`en uses {{${s}}} and hi does not: ${key}`);
    for (const s of b) {
      if (!a.has(s) && !isHindiPluralOne(key, s)) {
        problems.push(`hi uses {{${s}}} and en does not: ${key}`);
      }
    }
  }
}

// ---------------------------------------------------------------- code keys
/** Block and line comments, gone — so a documented example key is not reported
 *  as a missing one. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * CHECK 5: every literal key the code asks for exists.
 *
 * The four checks above compare the two catalogues against each other and are
 * blind to the source, so a typo in a `t('…')` call passes all of them and then
 * shows a real partner the dotted key itself. Nothing else in the toolchain sees
 * it: it is a string to TypeScript and a valid file to the linter.
 *
 * Deliberately LITERAL keys only. A key assembled at runtime —
 * `t(`billing.status.${s}`)` — cannot be resolved without knowing the value, and
 * guessing would either miss the real misses or drown them in false ones. Those
 * are covered by the catalogue-parity checks instead: whatever the variable
 * holds, both languages have the same set.
 *
 * A PREFIX match counts. react-i18next stores a plural as `key_one`/`key_other`
 * and reads namespaces as branches.
 */
const SOURCE_DIRS = ['../src', '../app'];
const CALL = /\b(?:t)\(\s*(['"`])([A-Za-z][\w.]*)\1/g;

const sources = [];
const walkSource = (dir) => {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { walkSource(p); continue; }
    if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) sources.push(p);
  }
};
for (const d of SOURCE_DIRS) walkSource(resolve(here, d));

/**
 * Namespaces reached with a prefix — `useTranslation('x')` then `t('y')`.
 *
 * NOT `useTranslations(`, which is next-intl's hook and is what the guard copy
 * of this script searches for. No file in an i18next app contains that call, so
 * the scope list there is always empty and every scoped key falls through as
 * "missing" or, more often, is skipped by the bare-word rule below and checked
 * not at all.
 */
const NAMESPACE = /\buseTranslation\(\s*(['"`])([A-Za-z][\w.]*)\1/g;

const known = new Set(en.keys());
const prefixes = new Set();
for (const k of known) {
  const parts = k.split('.');
  for (let i = 1; i < parts.length; i += 1) prefixes.add(parts.slice(0, i).join('.'));
}

const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];

const seen = new Map();
for (const file of sources) {
  // Comments are stripped first: this file's own doc block spells out
  // `t('billing.status…')` as an example, and a checker that reports its own
  // documentation is a checker people learn to ignore.
  const src = stripComments(readFileSync(file, 'utf8'));
  const scopes = [...src.matchAll(NAMESPACE)].map((m) => m[2]);
  for (const m of src.matchAll(CALL)) {
    const key = m[2];
    // A trailing dot means the key is CONCATENATED — `t('billing.status.' + s)`
    // — so the literal here is a prefix, not a key.
    if (key.endsWith('.')) continue;
    // A bare word is a variable name or an unrelated call, not a dotted key.
    if (!key.includes('.') && !scopes.length) continue;
    /**
     * react-i18next stores a plural as SUFFIXED SIBLINGS — `items_one` and
     * `items_other` — and the code asks for the bare `items`. Without this every
     * plural key in the app reads as missing, and a checker nobody trusts is a
     * checker nobody runs.
     */
    const candidates = [key, ...scopes.map((s) => `${s}.${key}`)]
      .flatMap((c) => [c, ...PLURAL_SUFFIXES.map((suf) => `${c}_${suf}`)]);
    if (candidates.some((c) => known.has(c) || prefixes.has(c))) continue;
    if (!seen.has(key)) seen.set(key, file);
  }
}
for (const [key, file] of seen) {
  problems.push(`key used in code but not in the catalogue: ${key}  (${relative(resolve(here, '..'), file).split(sep).join('/')})`);
}

if (problems.length) {
  console.error(`i18n: ${problems.length} problem(s)\n`);
  for (const p of problems.slice(0, 60)) console.error(`  - ${p}`);
  if (problems.length > 60) console.error(`  … and ${problems.length - 60} more`);
  process.exit(1);
}

console.log(`i18n ok — ${en.size} keys, en and hi in step`);
