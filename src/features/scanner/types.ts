import { ProductUnit } from '../../types/api-contract.generated';

/**
 * The universal scanning subsystem (PARTNERS_PLAN §12.1) — one code path for
 * every symbology a real shop meets, reused by the catalog (this agent) and by
 * billing (a different agent). See `index.ts` for the two things to import.
 */

/**
 * Every symbology `expo-camera`'s `CameraView` can decode on SDK 54 — verified
 * against `node_modules/expo-camera/build/Camera.types.d.ts` rather than
 * assumed, per `mobile-shop/AGENTS.md`. Deliberately the FULL set the native
 * module supports, not just the seven named in the build spec: PARTNERS_PLAN
 * §12.1 frames this as "one scanning subsystem that reads every code a real
 * shop encounters", and a pharmacy's PDF417 unit-pack or an Aztec boarding-pass
 * style document costs nothing extra to also decode.
 */
export const SUPPORTED_BARCODE_TYPES = [
  'aztec', 'ean13', 'ean8', 'qr', 'pdf417', 'upc_e', 'datamatrix',
  'code39', 'code93', 'itf14', 'codabar', 'code128', 'upc_a',
] as const;
export type SupportedBarcodeType = typeof SUPPORTED_BARCODE_TYPES[number];

/** One decoded read, however it arrived. */
export interface ScanHit {
  /** Trimmed and UPPERCASED — matches how `partner-product.model.ts` stores `barcode`. */
  code: string;
  /** As read, before normalisation. Kept for the create form's "barcode" field. */
  raw: string;
  /** The symbology, or `'manual'` for a typed/keyboard-wedge entry. */
  type: SupportedBarcodeType | 'manual';
}

/**
 * The catalog fields the scan-to-bill lookup needs — a narrower echo of
 * `IPartnerProduct`, matching exactly the `.select()` in
 * `partner-product.controller.ts#byBarcode`. Widen it there first if a screen
 * needs another field; this file must not silently drift from what the server
 * actually sends.
 */
export interface ScannedProduct {
  _id: string;
  name: string;
  sku?: string;
  barcode?: string;
  hsnCode?: string;
  unit: ProductUnit;
  mrpPaise: number;
  sellPaise: number;
  taxRatePercent: number;
  taxInclusive: boolean;
  stockQty: number;
  trackStock: boolean;
  isActive: boolean;
  categoryId?: string;
  images: string[];
}

export type BarcodeLookupResult =
  | { found: true; product: ScannedProduct }
  /** Echoes the normalised code back, so the caller can prefill a create form without re-scanning. */
  | { found: false; barcode: string };

/** What a consumer of `useProductScanner` gets back for every hit, resolved. */
export type ProductScanOutcome =
  | { status: 'found'; product: ScannedProduct; hit: ScanHit }
  | { status: 'unknown'; barcode: string; hit: ScanHit }
  /** The LOOKUP failed (network, 5xx) — not the same as "unknown". Must not be
   *  read as "create a new product": that would mint a duplicate SKU the next
   *  time the connection is fine and the same barcode is scanned again. */
  | { status: 'error'; message: string; hit: ScanHit };

/** Remembered per device (`DEVICE_KEYS.SCAN_METHOD`) so the sheet opens the way it was last used. */
export type ScanMethod = 'camera' | 'manual';
