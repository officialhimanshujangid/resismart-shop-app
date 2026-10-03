/**
 * LOCAL-WEB: the browser build of `storage.ts`.
 *
 * `expo-secure-store` has no web backend, so in the `expo start --web` preview
 * every write failed and sign-in ended with "this device would not save the
 * session". Metro picks this file on web only; phones keep SecureStore.
 *
 * `localStorage`, the same as the society app's `secure-store.web.ts`: fine for
 * local dev in a browser, NOT a secure home for a refresh token.
 */
const store = (): Storage | null => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const storage = {
  async set(key: string, value: string): Promise<boolean> {
    const s = store();
    if (!s) return false;
    try {
      s.setItem(key, value);
      return true;
    } catch (error) {
      console.error(`[Storage] Failed to set "${key}":`, error);
      return false;
    }
  },

  async get(key: string): Promise<string | null> {
    try {
      return store()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },

  async delete(key: string): Promise<void> {
    try {
      store()?.removeItem(key);
    } catch {
      // ignore
    }
  },

  async setObject<T>(key: string, value: T): Promise<boolean> {
    return storage.set(key, JSON.stringify(value));
  },

  async getObject<T>(key: string): Promise<T | null> {
    const raw = await storage.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
};
