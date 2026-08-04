/**
 * The scanning subsystem's public surface. See `catalog/scan.tsx` for the
 * reference integration.
 *
 * TWO WAYS TO CONSUME THIS:
 *
 * 1. Drop in the ready-made surface (most callers, including billing):
 *
 *      import { BarcodeScannerView } from '../../src/features/scanner';
 *
 *      <BarcodeScannerView
 *        active={!resultSheetOpen}          // pause while a sheet covers it
 *        onResult={(outcome) => {
 *          if (outcome.status === 'found') { ...add outcome.product to the bill... }
 *          if (outcome.status === 'unknown') {
 *            router.push({ pathname: '/catalog/create', params: { barcode: outcome.barcode, returnTo: currentPath } });
 *          }
 *          if (outcome.status === 'error') { showSnackbar(outcome.message); }
 *        }}
 *      />
 *
 *    It owns the camera, permissions, the torch toggle and manual entry.
 *
 * 2. Build a custom layout around the same behaviour (e.g. camera plus a live
 *    running bill list beside it) with the hook alone:
 *
 *      const { handleBarcodeScanned, submitManualCode, looking } = useProductScanner({
 *        enabled: cameraIsOnScreen,
 *        onResult: handleOutcome,
 *      });
 *      <CameraView barcodeScannerSettings={{ barcodeTypes: [...SUPPORTED_BARCODE_TYPES] }}
 *                  onBarcodeScanned={handleBarcodeScanned} />
 *
 * THE UNKNOWN-CODE CONTRACT (both paths): pushing
 * `{ pathname: '/catalog/create', params: { barcode: code, returnTo: path } }`
 * opens the create form pre-filled with the scanned code. On save, that
 * screen returns to `returnTo` (falling back to `router.back()`, then to
 * `/catalog`, if absent) — "saving returns to where the scan happened"
 * (PARTNERS_PLAN §12.1). `catalog/create.tsx` is the one place that contract
 * is implemented; do not re-derive it. `returnTo` reaches that screen as a
 * plain string (expo-router's own params, already decoded) and is passed to
 * `router.replace()` cast `as Href` — a caller-chosen destination is not one
 * of this app's statically-known routes, so it cannot type-check against the
 * generated `Href` union the way a literal path can.
 *
 * Lookup alone, with no camera involved (e.g. checking a code a customer read
 * out over the phone): `lookupProductByBarcode(code)` from `./api`.
 */
export { BarcodeScannerView } from './BarcodeScannerView';
export type { BarcodeScannerViewProps } from './BarcodeScannerView';

export { useProductScanner } from './useProductScanner';
export type { UseProductScannerOptions, UseProductScannerReturn } from './useProductScanner';

export { useScanFeedback } from './useScanFeedback';
export type { ScanFeedback } from './useScanFeedback';

export { useRememberedScanMethod } from './scanMethod';

export { lookupProductByBarcode } from './api';

export { SUPPORTED_BARCODE_TYPES } from './types';
export type {
  SupportedBarcodeType, ScanHit, ScannedProduct, BarcodeLookupResult, ProductScanOutcome, ScanMethod,
} from './types';
