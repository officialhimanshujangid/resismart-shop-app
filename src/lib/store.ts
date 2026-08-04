import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Plaintext device storage, for everything that is neither a credential nor
 * small enough for SecureStore.
 *
 * The twin of `src/utils/storage.ts`, and the split is deliberate — see the
 * `DEVICE_KEYS` comment in `constants/app.ts`. In one sentence: SecureStore is
 * for the four session keys, is capped at 2 KB per value on Android, and is
 * wiped on logout; this is for everything that must survive a sign-out and may
 * be large. Never put a token, a password or a customer's phone number here.
 */
export const store = {
  async get(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error(`[store] read "${key}" failed:`, error);
      return null;
    }
  },

  async set(key: string, value: string): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, value);
      return true;
    } catch (error) {
      // Reported, not swallowed. The caller that queues an offline invoice draft
      // has to be able to tell the partner their bill was NOT saved — a silent
      // false success here is a bill that vanishes when the app is killed.
      console.error(`[store] write "${key}" failed:`, error);
      return false;
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`[store] remove "${key}" failed:`, error);
    }
  },

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await store.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Corrupt JSON is treated as absent rather than thrown. A half-written
      // value from a process killed mid-write must not make the screen that
      // reads it unmountable.
      return null;
    }
  },

  async setJson<T>(key: string, value: T): Promise<boolean> {
    return store.set(key, JSON.stringify(value));
  },
};
