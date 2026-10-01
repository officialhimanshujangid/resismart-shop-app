import { ProductUnit } from '../../types/api-contract.generated';

/**
 * The universal scanning subsystem (PARTNERS_PLAN §12.1) — one code path for
 * every symbology a real shop meets, reused by the catalog (this agent) and by
 * billing (a different agent). See `index.ts` for the two things to import.
 */

/**
 * What a retail counter actually points the camera at: the GTIN family plus the
 * two linear symbologies Indian shops print their own labels in.
 *
 * THIS IS THE DEFAULT AND IT IS NARROWER ON PURPOSE. It used to be the full
 * thirteen the native module can decode, on the reasoning that a PDF417 or an
 * Aztec "costs nothing extra to also decode". It costs something specific: a
 * tin of paint or a strip of tablets in this country routinely carries an
 * EAN-13 *and* a marketing QR *and* a GS1 DataMatrix batch/expiry code within
 * the same few centimetres. All three land in one frame, `CameraView` reports
 * whichever it resolved that frame, and the shopkeeper's complaint — "the code
 * comes out different every time" — is the camera telling the truth about three
 * different codes. None of the three except the EAN-13 is the product's
 * identity: the QR is a URL, the DataMatrix is *this pack's* batch, so it is
 * different on the next tin of the same paint and could never match a catalog
 * row. Not decoding them is not a lost feature, it is the ambiguity removed at
 * the source rather than arbitrated after the fact.
 *
 * Kept in: `ean13`/`ean8`/`upc_a`/`upc_e` (the GTIN family on every retail
 * pack), `code128` (GS1-128 and nearly every label printer's default),
 * `code39` (pharma and older Indian FMCG labels), `itf14` (the outer carton, so
 * a shop buying by the case can scan the case).
 */
export const RETAIL_BARCODE_TYPES = [
  'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14',
] as const;

/**
 * Opt-in, via `<BarcodeScannerView extendedSymbologies>`. Two-dimensional codes
 * plus the two linear ones with no retail presence here (`code93` is internal
 * logistics; `codabar` is libraries and blood banks). A caller that turns these
 * on is saying "on my screen a QR is a legitimate product identity" — a shop
 * that prints its own QR shelf labels, say — and accepts the consequence: when
 * several codes share a frame, the FIRST one the native decoder resolves takes
 * the scan and the latch refuses the rest until the item leaves the frame. That
 * is a defined outcome rather than the old race, but it is still the decoder
 * choosing, not us, which is exactly why it is not the default.
 */
export const EXTENDED_BARCODE_TYPES = [
  'qr', 'datamatrix', 'pdf417', 'aztec', 'code93', 'codabar',
] as const;

/**
 * Everything `expo-camera`'s `CameraView` can decode on SDK 54 — verified
 * against `node_modules/expo-camera/build/Camera.types.d.ts` rather than
 * assumed, per `mobile-shop/AGENTS.md`. This is the TYPE source and the
 * union a `ScanHit.type` is drawn from; it is not what any camera is
 * configured with. Use `RETAIL_BARCODE_TYPES` for that.
 */
export const SUPPORTED_BARCODE_TYPES = [
  ...RETAIL_BARCODE_TYPES, ...EXTENDED_BARCODE_TYPES,
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
  /** P2 PHARMACY — sent by a server whose lookup projects them; absent otherwise. */
  drugSchedule?: 'H' | 'H1' | 'X';
  batchTracking?: boolean;
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
