import { useCallback, useRef, useState } from 'react';
import { BarcodeScanningResult } from 'expo-camera';
import { lookupProductByBarcode } from './api';
import { useScanFeedback } from './useScanFeedback';
import { apiErrorMessage } from '../../api/axios';
import { ProductScanOutcome, ScanHit } from './types';

/**
 * THE reusable scanning hook (PARTNERS_PLAN §12.1) — camera and manual entry
 * both funnel through here, "so the behaviour, the debounce, the beep and the
 * lookup logic are identical everywhere". Framework-agnostic about the UI: it
 * hands back two handlers to wire into whatever camera/input a screen draws,
 * and calls `onResult` once per resolved scan. See `README` at the bottom of
 * `index.ts` for the two ways to consume this.
 *
 * What it deliberately does NOT do: navigate, open a create form, or add a
 * line to a bill. `status: 'unknown'` is a fact about the catalog, not an
 * instruction — the catalog screen and the billing screen react to it
 * differently (one opens `/catalog/create`, the other might want to keep the
 * camera open and let the cashier decide), and baking one behaviour in here
 * would make the other agent's reuse a fight with this file instead of a
 * fifteen-line `onResult`.
 */
export interface UseProductScannerOptions {
  /**
   * False PAUSES scanning without unmounting the camera — e.g. a result sheet
   * or the create form is covering it. Camera frames keep arriving from
   * native code whether or not React is listening; without this a code still
   * in frame while a sheet is open re-fires the instant it closes.
   */
  enabled: boolean;
  /** Same code within this window is one scan, not three. ~800ms per the spec. */
  debounceMs?: number;
  onResult: (outcome: ProductScanOutcome) => void;
}

export interface UseProductScannerReturn {
  /** Wire straight to `<CameraView onBarcodeScanned={...}>`. */
  handleBarcodeScanned: (result: BarcodeScanningResult) => void;
  /** Wire to the manual-entry field's submit — same dedupe, lookup and feedback path. */
  submitManualCode: (code: string) => void;
  /** A lookup is in flight. Disable the manual-submit button; the camera keeps reading regardless. */
  looking: boolean;
}

const DEFAULT_DEBOUNCE_MS = 800;

export function useProductScanner(options: UseProductScannerOptions): UseProductScannerReturn {
  const { hit: hitFeedback, unknown: unknownFeedback } = useScanFeedback();
  const [looking, setLooking] = useState(false);
  /**
   * The dedupe memory. A ref, not state — writing it must never itself trigger
   * a re-render on a screen that may be re-rendering many times a second while
   * the camera preview is live.
   */
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const process = useCallback(async (rawCode: string, type: ScanHit['type']) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;

    const now = Date.now();
    const debounceMs = optionsRef.current.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    const last = lastRef.current;
    // A held trigger on a laser scanner, or the same code sitting in the
    // camera's frame for half a second, fires the underlying event many times.
    // This is the one thing that turns that into ONE scan.
    if (last && last.code === code && now - last.at < debounceMs) return;
    lastRef.current = { code, at: now };

    const scanHit: ScanHit = { code, raw: rawCode, type };
    // Fires the instant a code is READ — before the network round trip even
    // starts. The cashier needs to know the scan registered now, not 200ms
    // from now when the server answers.
    hitFeedback();

    setLooking(true);
    try {
      const result = await lookupProductByBarcode(code);
      if (result.found) {
        optionsRef.current.onResult({ status: 'found', product: result.product, hit: scanHit });
      } else {
        unknownFeedback();
        optionsRef.current.onResult({ status: 'unknown', barcode: result.barcode, hit: scanHit });
      }
    } catch (e: unknown) {
      // A lookup FAILURE is not the same fact as "unknown to the catalog" — see
      // the header on `lookupProductByBarcode`. No tone here beyond the hit
      // that already fired: an error is not a scan-quality problem, and a
      // third distinct sound for a network hiccup is more for the cashier to
      // learn than it is worth.
      optionsRef.current.onResult({ status: 'error', message: apiErrorMessage(e), hit: scanHit });
    } finally {
      setLooking(false);
    }
  }, [hitFeedback, unknownFeedback]);

  const handleBarcodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (!optionsRef.current.enabled) return;
    void process(result.data, result.type as ScanHit['type']);
  }, [process]);

  const submitManualCode = useCallback((code: string) => {
    void process(code, 'manual');
  }, [process]);

  return { handleBarcodeScanned, submitManualCode, looking };
}
