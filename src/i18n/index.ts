/**
 * The Intl.PluralRules polyfill, imported FIRST and for its side effect only.
 *
 * Hermes on Android does not always ship `Intl.PluralRules`, and without it
 * i18next logs "Your environment seems not to be Intl API compatible" and falls
 * back to its legacy v3 plural handling — which looks for `key_plural` in
 * catalogues that only carry `key_one` / `key_other`, finds neither, and renders
 * the bare dotted key to a real partner. The warning is the library announcing
 * that, not cosmetic noise.
 *
 * The fix is to give the runtime the API it is missing, NOT to set
 * `compatibilityJSON: 'v3'` — that flag breaks every plural key in `locales/`,
 * which are written in the modern form. The guard app learned this the hard way;
 * its `src/i18n/index.ts` carries the full account.
 *
 * Must come before `i18next` so the global exists by the time the plural
 * resolver is constructed.
 */
import 'intl-pluralrules';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from './locales/en.json';
import hi from './locales/hi.json';

/**
 * i18next for the partner app.
 *
 * The same shape the guard app uses — flat-ish JSON per locale, `{{name}}`
 * interpolation, `key_one` / `key_other` plurals — so the three mobile apps have
 * one setup between them rather than three.
 *
 * Initial language: whatever the partner last chose on this device (passed in),
 * else the phone's own language if it is one we have, else English.
 */

export const SUPPORTED = ['en', 'hi'] as const;
export type Language = (typeof SUPPORTED)[number];

/** Each names its own language, so neither is translated. */
export const LANGUAGE_NATIVE_NAME: Record<Language, string> = { en: 'English', hi: 'हिन्दी' };

export function deviceLanguage(): Language {
  const tag = getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED as readonly string[]).includes(tag) ? (tag as Language) : 'en';
}

export function initI18n(initial: Language): typeof i18n {
  if (!i18n.isInitialized) {
    // `import/no-named-as-default-member` sees that `i18next` also exports a
    // free function called `use` and assumes this is that import gone wrong. It
    // is not: `.use()` on the singleton is how a plugin is registered, and the
    // free export cannot install `initReactI18next` on this instance.
    // eslint-disable-next-line import/no-named-as-default-member
    i18n.use(initReactI18next).init({
      resources: { en: { translation: en }, hi: { translation: hi } },
      lng: initial,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnNull: false,
      // NO `compatibilityJSON: 'v3'` — see the polyfill note at the top.
    });
  }
  return i18n;
}

/**
 * A date, in the reader's language — `31 Jul 2028` or `31 जुलाई 2028`.
 *
 * Built from `common.months` rather than `toLocaleDateString('hi-IN')`, and the
 * reason is the same one `mobile-society/src/i18n/index.ts:215-231` gives: this
 * app runs on Hermes, Android's ICU coverage is not something the code can rely
 * on, and the failure is silent — a Hindi screen quietly rendering English
 * months with nothing to reveal it. A catalogue lookup is deterministic on every
 * platform and translatable like everything else.
 *
 * The day and year stay in Latin digits. Devanagari numerals (३१) are not what
 * an Indian reader expects on an invoice date, and the invoice is the whole
 * point of this app.
 */
export function formatI18nDate(iso: string | Date | undefined | null, t: (k: string) => string): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${t(`common.months.${d.getMonth() + 1}`)} ${d.getFullYear()}`;
}

export default i18n;
