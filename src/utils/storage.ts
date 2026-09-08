import * as SecureStore from 'expo-secure-store';

export const storage = {
  /**
   * `true` when the value is on disk, `false` when the write failed — the same
   * contract as `lib/store.ts`, and for the same reason it was given one there.
   *
   * This used to log and return `void`, which made a failed write indeterminable
   * from a successful one at every call site. That is survivable for a cached
   * list; it is not survivable for the two session tokens, because a refresh
   * that cannot persist its new access token leaves the app reading a stale one
   * off disk and refreshing again on every single request, with nothing in the
   * app to say so. `runRefresh` in `api/axios.ts` checks this answer.
   *
   * Still does not THROW: SecureStore's Android backend refuses values over 2 KB
   * (see `DEVICE_KEYS`), and the callers that could trip that limit are caching
   * paths where a lost write costs a re-fetch, not a crash.
   */
  async set(key: string, value: string): Promise<boolean> {
    try {
      await SecureStore.setItemAsync(key, value);
      return true;
    } catch (error) {
      console.error(`[Storage] Failed to set "${key}":`, error);
      return false;
    }
  },

  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error(`[Storage] Failed to get "${key}":`, error);
      return null;
    }
  },

  async delete(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error(`[Storage] Failed to delete "${key}":`, error);
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
