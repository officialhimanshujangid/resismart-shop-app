import { useCallback, useEffect, useRef, useState } from 'react';
import { BarcodeScanningResult } from 'expo-camera';
import { lookupProductByBarcode } from './api';
import { useScanFeedback } from './useScanFeedback';
import { apiErrorMessage } from '../../api/axios';
import { ProductScanOutcome, ProductScanRejection, ScanHit } from './types';
// >>> SCANNER
import { ClassifiedScan, ScanGate, ScanGateOptions, classifyScan } from './scanCore';
// <<< SCANNER

/**
 * THE reusable scanning hook (PARTNERS_PLAN §12.1) — camera and manual entry
 * both funnel through here, so the behaviour, the latch, the beep and the
 * lookup logic are identical everywhere. It hands back two handlers to wire
 * into whatever camera/input a screen draws, and calls `onResult` once per
 * resolved scan. See `index.ts` for the two ways to consume this.
 *
 * What it deliberately does NOT do: navigate, open a create form, or add a
 * line to a bill. `status: 'unknown'` is a fact about the catalog, not an
 * instruction — each screen reacts to it in its own way.
 *
 * >>> SCANNER — WHY THIS WAS REWRITTEN (Owner, Oct 2026: "it scanned ONE
 * product in different ways and kept ADDING it again and again").
 *
 * The old latch re-armed after 600 ms with no code in frame and did not know
 * whether the previous lookup had finished. Three things followed:
 *   1. a held pack whose decode flickered for >600 ms (glare, a tilted hand)
 *      re-armed and was added again — and again;
 *   2. a slow lookup plus a re-arm meant TWO lookups in flight → two adds;
 *   3. the code was only trimmed/upper-cased: Android reports a UPC-A as 12
 *      digits, iOS strips the leading 0 off an EAN-13, a carton's ITF-14 read
 *      partially is a shorter "valid" number — one item, several codes.
 *
 * Now every read goes through `scanCore`:
 *   - `classifyScan` — canonical code (UPC-A ↔ EAN-13, UPC-E expanded, GS1 /
 *     AIM prefixes stripped), check digit verified for the GTIN family, and
 *     the KIND decided: a URL / UPI / ResiSmart pass / unsupported code is
 *     never looked up (→ `onRejected`, once per presentation);
 *   - `ScanGate` — nothing accepted while a lookup is in flight; after an
 *     accept EVERY code is latched until the frame has been empty for
 *     `settleMs`; the same code also needs `cooldownMs` (2 s) after its lookup
 *     finished; a camera value must be read twice before it is believed.
 *
 * So: one presentation of an item is ONE `onResult`, however long it is held,
 * and the second tin of the same paint — lifted away and shown again — is a
 * second `onResult`, which `billing/new.tsx` turns into qty +1. A caller must
 * not de-duplicate on top of this.
 */
export interface UseProductScannerOptions {
  /**
   * False PAUSES scanning without unmounting the camera — e.g. a result sheet
   * or the create form is covering it. Coming back holds the code that fired
   * last until it leaves the frame (the phone is usually still hovering over
   * it); any other code scans straight away.
   */
  enabled: boolean;
  /** @deprecated use `gate.settleMs`. Kept so older callers still compile. */
  rearmSettleMs?: number;
  /** Tuning for the gate (tests; a screen should not need it). */
  gate?: ScanGateOptions;
  /** Treat a 2D code (QR / DataMatrix…) carrying plain text as a product code. Off on every product screen. */
  allowTwoD?: boolean;
  /** Take a full, check-digit-valid carton ITF-14 (receiving screens only — never the billing counter). */
  allowItf?: boolean;
  onResult: (outcome: ProductScanOutcome) => void;
  /** A read that is not a product code (link, UPI, pass, unsupported, misread). Said once. */
  onRejected?: (rejection: ProductScanRejection) => void;
  /** A code was ACCEPTED (before the lookup) — for the on-screen flash. */
  onAccepted?: (hit: ScanHit) => void;
}

export interface UseProductScannerReturn {
  /** Wire straight to `<CameraView onBarcodeScanned={...}>`. */
  handleBarcodeScanned: (result: BarcodeScanningResult) => void;
  /** Wire to the manual-entry field's submit — same lookup and feedback path, no camera latch. */
  submitManualCode: (code: string) => void;
  /** A lookup is in flight. Disable the manual-submit button. */
  looking: boolean;
}

const hitOf = (c: ClassifiedScan, type: ScanHit['type']): ScanHit => ({ code: c.code, raw: c.raw, type });

export function useProductScanner(options: UseProductScannerOptions): UseProductScannerReturn {
  const { hit: hitFeedback, unknown: unknownFeedback } = useScanFeedback();
  const [looking, setLooking] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // One gate for the life of the screen. A ref, written synchronously inside
  // the native callback — a `setState` latch is read from a stale render.
  const gateRef = useRef<ScanGate | null>(null);
  if (gateRef.current === null) {
    gateRef.current = new ScanGate({
      ...(options.rearmSettleMs ? { settleMs: options.rearmSettleMs } : {}),
      ...options.gate,
    });
  }

  const enabled = options.enabled;
  const wasEnabled = useRef(enabled);
  useEffect(() => {
    const gate = gateRef.current!;
    if (!enabled) gate.pause();
    else if (!wasEnabled.current) gate.resume(Date.now());
    wasEnabled.current = enabled;
  }, [enabled]);

  const process = useCallback(async (scan: ClassifiedScan, type: ScanHit['type']) => {
    const scanHit = hitOf(scan, type);
    // Fires the instant a code is ACCEPTED — before the round trip. The
    // cashier needs to know the scan registered now.
    hitFeedback();
    optionsRef.current.onAccepted?.(scanHit);
    setLooking(true);
    try {
      const result = await lookupProductByBarcode(scan.code);
      if (result.found) {
        optionsRef.current.onResult({ status: 'found', product: result.product, hit: scanHit });
      } else {
        unknownFeedback();
        optionsRef.current.onResult({ status: 'unknown', barcode: result.barcode || scan.code, hit: scanHit });
      }
    } catch (e: unknown) {
      // A lookup FAILURE is not "unknown to the catalog" — see `api.ts`.
      optionsRef.current.onResult({ status: 'error', message: apiErrorMessage(e), hit: scanHit });
    } finally {
      setLooking(false);
      // The cooldown starts when the add is DONE, not when the code was seen.
      gateRef.current?.release(Date.now());
    }
  }, [hitFeedback, unknownFeedback]);

  const reject = useCallback((scan: ClassifiedScan, type: ScanHit['type']) => {
    unknownFeedback();
    const reason = scan.kind === 'product' || scan.kind === 'empty' ? 'unsupported' : scan.kind;
    optionsRef.current.onRejected?.({ reason, hit: hitOf(scan, type) });
  }, [unknownFeedback]);

  const handleBarcodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (!optionsRef.current.enabled) return;
    const scan = classifyScan(result.data, result.type, {
      allowTwoD: optionsRef.current.allowTwoD, allowItf: optionsRef.current.allowItf,
    });
    const decision = gateRef.current!.offer(scan, 'camera', Date.now());
    const type = result.type as ScanHit['type'];
    if (decision.action === 'accept') void process(decision.scan, type);
    else if (decision.action === 'reject') reject(decision.scan, type);
  }, [process, reject]);

  const submitManualCode = useCallback((code: string) => {
    // A typed code has a person behind it: no camera latch, no cooldown —
    // typing the same code twice is "two of these". Only an in-flight lookup
    // blocks it (the submit button is disabled then anyway).
    const scan = classifyScan(code, 'manual');
    const decision = gateRef.current!.offer(scan, 'manual', Date.now());
    if (decision.action === 'accept') void process(decision.scan, 'manual');
    else if (decision.action === 'reject') reject(decision.scan, 'manual');
  }, [process, reject]);

  return { handleBarcodeScanned, submitManualCode, looking };
}
// <<< SCANNER
