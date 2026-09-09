import { useCallback, useSyncExternalStore } from 'react';
import i18n, { Language, SUPPORTED } from './index';
import { store } from '../lib/store';
import { DEVICE_KEYS } from '../constants/app';

/**
 * Read and change the app language, persisted to the device.
 *
 * Backed by i18next's own event so every mounted screen re-renders on a switch,
 * and by AsyncStorage — via `DEVICE_KEYS`, the class that deliberately SURVIVES
 * a sign-out (`constants/app.ts:32-48`). The language belongs to the phone on
 * the counter, not to the account signed in on it: a shopkeeper who reads Hindi
 * still reads Hindi after switching businesses.
 */
function subscribe(cb: () => void): () => void {
  i18n.on('languageChanged', cb);
  return () => i18n.off('languageChanged', cb);
}

export function useLanguage(): { language: Language; setLanguage: (l: Language) => void; toggle: () => void } {
  const language = useSyncExternalStore(subscribe, () => (i18n.language as Language) || 'en');

  const setLanguage = useCallback((l: Language) => {
    if (!(SUPPORTED as readonly string[]).includes(l)) return;
    void i18n.changeLanguage(l);
    void store.set(DEVICE_KEYS.LANGUAGE, l);
  }, []);

  const toggle = useCallback(() => {
    setLanguage((i18n.language as Language) === 'hi' ? 'en' : 'hi');
  }, [setLanguage]);

  return { language, setLanguage, toggle };
}

/** The stored language choice, if any — read once at boot to seed i18next. */
export async function loadStoredLanguage(): Promise<Language | null> {
  const v = await store.get(DEVICE_KEYS.LANGUAGE);
  return v === 'en' || v === 'hi' ? v : null;
}
