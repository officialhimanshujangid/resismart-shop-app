import { useCallback, useEffect, useState } from 'react';
import { store } from '../../lib/store';
import { DEVICE_KEYS } from '../../constants/app';
import { ScanMethod } from './types';

/**
 * "The last-used method is remembered per device and pre-selected next time,
 * and it can be overridden at any moment with one tap." — PARTNERS_PLAN §12.1.
 *
 * `DEVICE_KEYS.SCAN_METHOD` is already reserved in `constants/app.ts` for
 * exactly this. Read once on mount (AsyncStorage, not SecureStore — this is a
 * UI preference, not a credential) and written every time the sheet's mode
 * actually changes, so the NEXT open — same device, same or different partner
 * session — starts the same way this one ended.
 */
export function useRememberedScanMethod(defaultMethod: ScanMethod = 'camera'): {
  method: ScanMethod;
  setMethod: (m: ScanMethod) => void;
  loaded: boolean;
} {
  const [method, setMethodState] = useState<ScanMethod>(defaultMethod);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void store.get(DEVICE_KEYS.SCAN_METHOD).then((stored) => {
      if (cancelled) return;
      if (stored === 'camera' || stored === 'manual') setMethodState(stored);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMethod = useCallback((m: ScanMethod) => {
    setMethodState(m);
    void store.set(DEVICE_KEYS.SCAN_METHOD, m);
  }, []);

  return { method, setMethod, loaded };
}
