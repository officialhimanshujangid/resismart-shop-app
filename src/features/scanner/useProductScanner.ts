import { useCallback, useEffect, useRef, useState } from 'react';
import { BarcodeScanningResult } from 'expo-camera';
import { lookupProductByBarcode } from './api';
import { useScanFeedback } from './useScanFeedback';
import { apiErrorMessage } from '../../api/axios';
import { ProductScanOutcome, ScanHit } from './types';

/**
 * THE reusable scanning hook (PARTNERS_PLAN §12.1) — camera and manual entry
 * both funnel through here, "so the behaviour, the latch, the beep and the
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
 *
 * ── THE LATCH ────────────────────────────────────────────────────────────────
 *
 * What used to be here was a time-window debounce: the same code seen again
 * within 800ms was dropped. That is not what a counter scanner does, and the
 * comment that called it "the one thing that turns that into ONE scan" was
 * wrong on both halves. A pack held in frame for three seconds fired at t=0,
 * again at ~800, again at ~1600 — three beeps, quantity three. And because the
 * window was keyed on the code STRING, a pack carrying two symbologies fired
 * both, each one leaving the other's window untouched, so they never suppressed
 * each other at all.
 *
 * Replaced by a real latch. Accepting a code disarms the scanner for EVERY
 * code, not just that one. It re-arms on the only signal that honestly means
 * "that item is done": the frame going quiet — `rearmSettleMs` with nothing
 * decodable in front of the lens, i.e. the item was taken away.
 *
 * That rule is chosen to keep the one behaviour a shop cannot lose. Two tins of
 * the same paint are quantity two, and `billing/new.tsx` is right to say "keep
 * scanning — each item adds to the bill". A latch keyed on the code, or one
 * that only re-armed when a sheet closed, would have made the second tin
 * unscannable. Because the re-arm is keyed on the GAP and not on the code, one
 * code HELD in frame is one scan, and the same code PRESENTED TWICE — which
 * necessarily has the phone moving between the two, hence a gap — is two.
 *
 * The one case that rule cannot see is two identical items scanned with the
 * camera never losing sight of a code in between (packs touching on the
 * counter). No latch of any design can: from the lens it is indistinguishable
 * from one item held still. The line editor's qty field is the answer there,
 * and it is the same answer a supermarket lane gives.
 */
export interface UseProductScannerOptions {
  /**
   * False PAUSES scanning without unmounting the camera — e.g. a result sheet
   * or the create form is covering it. Camera frames keep arriving from
   * native code whether or not React is listening; without this a code still
   * in frame while a sheet is open re-fires the instant it closes.
   *
   * Un-pausing re-arms the latch (a screen that deliberately brings the camera
   * back wants the next item to scan) with one exception, handled below: the
   * code that fired LAST, if it is still sitting in the frame.
   */
  enabled: boolean;
  /**
   * How long the frame must stay empty of any decodable code before the latch
   * re-arms. Not a debounce — nothing is scanned during it and holding an item
   * still keeps pushing it out; it is "the item has been taken away" expressed
   * in the only terms the camera can report.
   *
   * 600ms: long enough to ride out the decoder dropping a frame or two on a
   * shaky hand or a glare, short enough that a cashier swapping one item for
   * the next is never waiting on it.
   *
   * The two ways to get this wrong are not equally bad, and that asymmetry is
   * what picked the number. Too SHORT re-arms while the item is still there and
   * the runaway count comes back — an invisible extra unit on a bill the
   * customer pays. Too LONG drops a scan when a fast cashier swaps items inside
   * the window — but that one announces itself: no beep, and the hand that just
   * moved moves again. Silence is self-correcting; a phantom line is not. When
   * in doubt this goes up, not down.
   *
   * Note what this does NOT do: re-arm because a DIFFERENT code arrived. That
   * looks like a free way to make item-to-item swaps instant, and it is wrong
   * even now that the two-dimensional symbologies are off by default — a pharma
   * strip carries a Code 128 batch label beside its EAN-13, an outer carton
   * carries an ITF-14 beside one, and both would then take turns re-arming each
   * other exactly the way the old string-keyed debounce let them. The gap is
   * the only signal that means "different item" rather than "different code on
   * the same item".
   */
  rearmSettleMs?: number;
  onResult: (outcome: ProductScanOutcome) => void;
}

export interface UseProductScannerReturn {
  /** Wire straight to `<CameraView onBarcodeScanned={...}>`. */
  handleBarcodeScanned: (result: BarcodeScanningResult) => void;
  /**
   * Wire to the manual-entry field's submit — same lookup and feedback path,
   * but NOT the latch: see the note on the implementation.
   */
  submitManualCode: (code: string) => void;
  /** A lookup is in flight. Disable the manual-submit button; the camera keeps reading regardless. */
  looking: boolean;
}

const DEFAULT_REARM_SETTLE_MS = 600;

export function useProductScanner(options: UseProductScannerOptions): UseProductScannerReturn {
  const { hit: hitFeedback, unknown: unknownFeedback } = useScanFeedback();
  const [looking, setLooking] = useState(false);
  /**
   * The latch, and the memory it needs. Refs, not state — every one of these is
   * written from inside a callback that native code fires ten-plus times a
   * second while the preview is live, and a `setState` there would re-render
   * the whole screen at frame rate. More importantly a ref is written BEFORE
   * the callback returns, where state is not visible until React commits: the
   * bug this replaces was a guard read out of a stale render closure, which is
   * exactly what `mobile-guard`'s own scan latch documents as the reason it
   * latches a ref synchronously.
   */
  const armedRef = useRef(true);
  const lastAcceptedRef = useRef<string | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeGuardUntilRef = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }, []);

  /**
   * Called for EVERY decoded frame — the ones we accept and the ones the latch
   * refuses alike. Refused frames are the important half: they are the evidence
   * that the item is still there, and it is their absence, not any code
   * comparison, that eventually re-arms us.
   */
  const noteFrameAndScheduleRearm = useCallback(() => {
    clearSettleTimer();
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      armedRef.current = true;
      // The item is gone, so there is nothing left for the un-pause guard below
      // to recognise. Clearing keeps it from matching a genuinely new
      // presentation of the same product minutes later.
      lastAcceptedRef.current = null;
    }, optionsRef.current.rearmSettleMs ?? DEFAULT_REARM_SETTLE_MS);
  }, [clearSettleTimer]);

  const enabled = options.enabled;
  useEffect(() => {
    if (!enabled) {
      // Paused. The settle clock must stop with it: left running behind a sheet
      // it would re-arm on a frame-quiet the camera was never asked about, and
      // the code still in front of the lens would fire the instant the sheet
      // closed — the very thing `enabled` exists to prevent.
      clearSettleTimer();
      return;
    }
    armedRef.current = true;
    // ...but arming on un-pause has one honest exception. `catalog/scan` pushes
    // to a product, the shopkeeper comes back, and the phone is still hovering
    // over the pack it just scanned. That is the TAIL of the previous
    // presentation, not a new one, and arming blind would bounce them straight
    // back into the product they just left. For this brief window the code that
    // fired last is refused once more and handed to the settle clock, which
    // then treats it like any other held item.
    resumeGuardUntilRef.current = Date.now() + (optionsRef.current.rearmSettleMs ?? DEFAULT_REARM_SETTLE_MS);
  }, [enabled, clearSettleTimer]);

  useEffect(() => clearSettleTimer, [clearSettleTimer]);

  const process = useCallback(async (rawCode: string, type: ScanHit['type']) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;

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
    const code = result.data.trim().toUpperCase();
    if (!code) return;

    // Before any decision: this frame had a code in it, so the item is still
    // in front of the lens and the re-arm deadline moves out. Ordering matters
    // — every early return below must still count as "the item is there", or a
    // held pack would re-arm mid-hold and beep again.
    noteFrameAndScheduleRearm();

    if (!armedRef.current) return;

    if (code === lastAcceptedRef.current && Date.now() < resumeGuardUntilRef.current) {
      armedRef.current = false; // the un-pause exception; see the effect above
      return;
    }

    // Synchronous, before the `await` inside `process` yields. Native fires
    // this callback again long before a lookup resolves, and a latch set after
    // the round trip is not a latch.
    armedRef.current = false;
    lastAcceptedRef.current = code;
    void process(result.data, result.type as ScanHit['type']);
  }, [noteFrameAndScheduleRearm, process]);

  const submitManualCode = useCallback((code: string) => {
    // Deliberately NOT latched. A typed code has a keystroke and a button press
    // behind it — it cannot be the camera firing at 10Hz, which is the only
    // thing the latch exists to suppress. Typing the same code twice is a
    // cashier saying "two of these", and the old shared debounce silently ate
    // the second one if they typed quickly.
    void process(code, 'manual');
  }, [process]);

  return { handleBarcodeScanned, submitManualCode, looking };
}
